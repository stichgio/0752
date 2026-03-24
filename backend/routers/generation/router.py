# -*- coding: utf-8 -*-
"""
Router dedicado para endpoints de generación de PDF (/api/generate-pdf*).
Extraído de main.py para separación de responsabilidades.
"""
import asyncio
import json
import logging
import os
import tempfile
import traceback
import uuid
from typing import Dict, List, Optional
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from core.helpers import (
    ReportFileEntry,
    ReportPayloadEntry,
    build_pdf_download_filename,
    cleanup_file,
    normalize_photo_grid_template_compat,
)
from core.progress import format_sse_event
from technical_reports.models import TechnicalReport
from template_editor.service import get_published_template_by_name
from utils.file_utils import build_safe_upload_path, save_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["generation"])


@router.post("/generate-pdf")
async def generate_single_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    data: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    customTemplate: Optional[str] = Form(None),
    templateName: Optional[str] = Form(None),
    idColumn: Optional[str] = Form(None),
    exportScope: Optional[str] = Form(None),
    originalQuality: Optional[str] = Form(None),
):
    use_original_quality = (originalQuality or "").lower() in ("true", "1", "yes")
    logger.info("Received request: data len=%d, files=%d, customTemplate=%s, templateName=%s, originalQuality=%s",
                len(data), len(files), 'yes' if customTemplate else 'no', templateName, use_original_quality)
    try:
        # Parse JSON data
        row_data = json.loads(data)
        download_filename = build_pdf_download_filename(templateName, row_data, exportScope, idColumn)

        # Compatibility bridge: optionally resolve published visual template without changing API contract.
        resolved_custom_template = customTemplate
        resolved_template_name = templateName
        if templateName and not customTemplate:
            compiled_template = get_published_template_by_name(templateName)
            if compiled_template:
                resolved_custom_template = compiled_template
                resolved_template_name = None

        resolved_custom_template = normalize_photo_grid_template_compat(resolved_custom_template)

        # Validate against Pydantic model to ensure defaults and legacy patching.
        # The root_validator in TechnicalReport handles all legacy/incomplete data
        # normalization (valvulas.impulsion, canastillas '14', missing inspeccion).
        try:
            if isinstance(row_data, dict) and 'valvulas' in row_data:
                validated = TechnicalReport(**row_data)
                row_data = validated.model_dump()
        except Exception as e:
            logger.warning("Model validation failed (continuing with raw data): %s", e)

        async def read_logo_bytes(logo_file):
            if not logo_file:
                return None
            content = await logo_file.read()
            return content or None

        logo_left_bytes = await read_logo_bytes(logoLeft)
        logo_right_bytes = await read_logo_bytes(logoRight)

        # Create temp directory for images
        with tempfile.TemporaryDirectory() as temp_dir:
            file_map = {}

            # Save uploaded images to temp dir
            for index, file in enumerate(files):
                original_name = file.filename or f"upload_{index:04d}"
                file_path = build_safe_upload_path(temp_dir, original_name, prefix=f"{index:04d}_", default_name="image")
                await save_upload(file, file_path)
                file_map[original_name] = {"name": original_name, "path": file_path}

            # Use singleton ReportService
            service = request.app.state.report_service
            reports_payload = []

            # Check if this is a batch request (list) or legacy single (dict)
            if isinstance(row_data, list):
                # Expecting [{ "row_data": {...}, "image_filenames": ["a.jpg", ...] }]
                for item in row_data:
                    r_data = item.get("row_data", {})
                    img_names = item.get("image_filenames", [])

                    # Find matching file objects
                    r_files = []
                    for name in img_names:
                            mapped_file = file_map.get(str(name))
                            if mapped_file is None:
                                # FIX: BUG-005 avoid silent KeyError with explicit client-facing 400
                                raise HTTPException(status_code=400, detail=f"Image filename '{name}' not found in uploaded files")
                            r_files.append(mapped_file)

                    reports_payload.append({"data": r_data, "files": r_files})
            else:
                # Legacy single mode: all files belong to this row
                # Convert file_map values to list
                r_files = list(file_map.values())
                reports_payload.append({"data": row_data, "files": r_files})

            # Create a temporary file for output that persists (delete=False)
            # This ensures the large PDF is written to disk, not held in RAM.
            # FileResponse will stream it from disk to the client.
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_output:
                output_path = tmp_output.name

            try:
                # Generate PDF to file directly (chunked write)
                await service.generate_batch_pdf(
                    reports_payload,
                    output_path=output_path,
                    logo_left=logo_left_bytes,
                    logo_right=logo_right_bytes,
                    custom_template_str=resolved_custom_template,
                    template_name=resolved_template_name,
                    original_quality=use_original_quality
                )
            except Exception:
                # If generation fails, ensure we clean up the file immediately
                if os.path.exists(output_path):
                    os.remove(output_path)
                raise

            background_tasks.add_task(cleanup_file, output_path)

            # Return FileResponse (streams from disk)
            return FileResponse(
                output_path,
                media_type="application/pdf",
                filename=download_filename,
                headers={"X-Filename": download_filename},
            )

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Formato JSON inv\u00e1lido en el campo 'data': {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error("PDF Generation Error:\n%s", error_trace)

        # Try to provide a user-friendly message for common errors
        error_msg = str(e)
        if "weasyprint" in error_trace.lower():
            error_msg = f"Error del motor de generaci\u00f3n PDF (WeasyPrint): {str(e)}"
        elif "No such file" in error_msg:
            error_msg = f"Recurso de archivo no encontrado: {str(e)}"

        # Return 500 with clear details
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Error al generar PDF",
                "reason": error_msg,
                "type": type(e).__name__
            }
        )


# --- SSE Progress Endpoint ---

@router.post("/generate-pdf-progress")
async def generate_pdf_with_progress(
    request: Request,
    data: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    customTemplate: Optional[str] = Form(None),
    templateName: Optional[str] = Form(None),
    idColumn: Optional[str] = Form(None),
    exportScope: Optional[str] = Form(None),
    originalQuality: Optional[str] = Form(None),
):
    """SSE version of /generate-pdf with real-time progress events."""
    use_original_quality = (originalQuality or "").lower() in ("true", "1", "yes")

    try:
        row_data = json.loads(data)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Formato JSON inv\u00e1lido en el campo 'data': {str(exc)}")

    download_filename = build_pdf_download_filename(templateName, row_data, exportScope, idColumn)

    resolved_custom_template = customTemplate
    resolved_template_name = templateName
    if templateName and not customTemplate:
        compiled_template = get_published_template_by_name(templateName)
        if compiled_template:
            resolved_custom_template = compiled_template
            resolved_template_name = None
    resolved_custom_template = normalize_photo_grid_template_compat(resolved_custom_template)

    try:
        if isinstance(row_data, dict) and 'valvulas' in row_data:
            validated = TechnicalReport(**row_data)
            row_data = validated.model_dump()
    except Exception:
        pass

    async def read_logo_bytes(logo_file: Optional[UploadFile]) -> Optional[bytes]:
        if not logo_file:
            return None
        content = await logo_file.read()
        return content or None

    logo_left_bytes = await read_logo_bytes(logoLeft)
    logo_right_bytes = await read_logo_bytes(logoRight)

    temp_dir = tempfile.mkdtemp(prefix="pdf_progress_")
    file_map: Dict[str, ReportFileEntry] = {}
    try:
        for index, file in enumerate(files):
            original_name = file.filename or f"upload_{index:04d}"
            file_path = build_safe_upload_path(temp_dir, original_name, prefix=f"{index:04d}_", default_name="image")
            await save_upload(file, file_path)
            file_map[original_name] = {"name": original_name, "path": file_path}

        if isinstance(row_data, list):
            uploaded_filenames = set(file_map.keys())
            for item in row_data:
                for name in item.get("image_filenames", []):
                    if str(name) not in uploaded_filenames:
                        raise HTTPException(status_code=400, detail=f"Image filename '{name}' not found in uploaded files")
    except Exception:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise

    service = request.app.state.report_service

    async def event_generator():
        progress_queue: asyncio.Queue = asyncio.Queue()

        async def on_progress(phase: str, current: int, total: int, detail: str = ""):
            await progress_queue.put({"phase": phase, "current": current, "total": total, "detail": detail})

        async def run_generation():
            try:
                reports_payload: List[ReportPayloadEntry] = []
                if isinstance(row_data, list):
                    for item in row_data:
                        r_data = item.get("row_data", {})
                        img_names = item.get("image_filenames", [])
                        r_files = [file_map[str(n)] for n in img_names if str(n) in file_map]
                        reports_payload.append({"data": r_data, "files": r_files})
                else:
                    reports_payload.append({"data": row_data, "files": list(file_map.values())})

                filename = f"pdf_{uuid.uuid4().hex[:12]}.pdf"
                output_path = os.path.join(tempfile.gettempdir(), filename)

                await service.generate_batch_pdf(
                    reports_payload,
                    output_path=output_path,
                    logo_left=logo_left_bytes,
                    logo_right=logo_right_bytes,
                    custom_template_str=resolved_custom_template,
                    template_name=resolved_template_name,
                    on_progress=on_progress,
                    original_quality=use_original_quality
                )
                await progress_queue.put({"phase": "done", "download_url": f"/api/download-temp/{filename}?download_name={quote(download_filename, safe='')}"})
            except Exception as e:
                try:
                    await progress_queue.put({"phase": "error", "detail": str(e)})
                except Exception:
                    progress_queue.put_nowait({"phase": "error", "detail": str(e)})
            except asyncio.CancelledError:
                # Task was cancelled (e.g. client disconnect): signal the frontend before re-raising
                progress_queue.put_nowait({"phase": "error", "detail": "La generaci\u00f3n fue interrumpida"})
                raise
            finally:
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
                # put_nowait avoids a new await that could itself be cancelled
                try:
                    progress_queue.put_nowait(None)
                except Exception:
                    pass

        generation_task = asyncio.create_task(run_generation())

        while True:
            if await request.is_disconnected():
                # FIX: BUG-007 cancel background generation when SSE client disconnects
                generation_task.cancel()
                break
            msg = await progress_queue.get()
            if msg is None:
                break
            phase = msg.get("phase", "")
            if phase == "done":
                yield format_sse_event(msg, "done")
            elif phase == "error":
                yield format_sse_event(msg, "error")
            else:
                yield format_sse_event(msg, "progress")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
