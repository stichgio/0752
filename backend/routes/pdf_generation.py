"""PDF generation endpoints (single and SSE progress)."""

import asyncio
import base64
import json
import os
import re
import tempfile
import traceback
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile  # type: ignore
from fastapi.responses import FileResponse, StreamingResponse  # type: ignore

from progress import format_sse_event  # type: ignore
from technical_reports.models import TechnicalReport  # type: ignore
from template_editor.service import get_published_template_by_name  # type: ignore
from utils.file_utils import build_safe_upload_path, save_upload  # type: ignore

router = APIRouter(prefix="/api", tags=["pdf-generation"])


# --- Helpers ---

def _cleanup_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Error removing temp file {path}: {e}")


def _normalize_photo_grid_template_compat(template_html: Optional[str]) -> Optional[str]:
    """Backwards-compatible photo-grid fix for legacy template-editor exports.

    Legacy canvas-editor templates may lack a ``.photo-media`` wrapper inside
    ``.photo-cell-wrap``, causing images to stretch or crop inconsistently.
    Instead of restructuring the HTML with fragile regex (which breaks on any
    markup variation), we inject CSS rules that handle **both** layouts:

    * Modern templates  – ``.photo-cell-wrap > .photo-media > img``
    * Legacy templates  – ``.photo-cell-wrap > img`` (no wrapper)

    The injected ``<style>`` block is idempotent (skipped if already present).
    """
    if not template_html or not isinstance(template_html, str):
        return template_html

    if "photo-cell-wrap" not in template_html:
        return template_html

    # Already patched — avoid double-injection.
    if "photo-grid-compat-fix" in template_html:
        return template_html

    compat_css = (
        '<style id="photo-grid-compat-fix">\n'
        # ── cell wrapper: flex column that stretches to fill the table cell ──
        '  .photo-cell-wrap {\n'
        '    display: flex;\n'
        '    flex-direction: column;\n'
        '    align-items: stretch;\n'
        '    justify-content: flex-start;\n'
        '    width: 100%;\n'
        '    height: 100%;\n'
        '    min-height: 0;\n'
        '    padding: 1mm;\n'
        '    box-sizing: border-box;\n'
        '    overflow: hidden;\n'
        '  }\n'
        # ── modern wrapper (already present in new templates) ──
        '  .photo-media {\n'
        '    flex: 1 1 auto;\n'
        '    min-height: 0;\n'
        '    width: 100%;\n'
        '    position: relative;\n'
        '    overflow: hidden;\n'
        '    display: flex;\n'
        '    align-items: center;\n'
        '    justify-content: center;\n'
        '  }\n'
        '  .photo-media > img {\n'
        '    position: absolute;\n'
        '    top: 0;\n'
        '    left: 0;\n'
        '    width: 100%;\n'
        '    height: 100%;\n'
        '    object-fit: contain;\n'
        '    object-position: center;\n'
        '    display: block;\n'
        '  }\n'
        # ── legacy fallback: img is a direct child of .photo-cell-wrap ──
        '  .photo-cell-wrap > img {\n'
        '    flex: 1 1 auto;\n'
        '    min-height: 0;\n'
        '    width: 100%;\n'
        '    object-fit: contain;\n'
        '    object-position: center;\n'
        '    display: block;\n'
        '  }\n'
        # ── catch-all for deeply-nested or unexpected structures ──
        '  .photo-cell img {\n'
        '    max-width: 100%;\n'
        '    max-height: 100%;\n'
        '    object-fit: contain;\n'
        '    object-position: center;\n'
        '  }\n'
        # ── label always at the bottom ──
        '  .photo-label {\n'
        '    flex-shrink: 0;\n'
        '    font-weight: 700;\n'
        '    font-size: 7.5pt;\n'
        '    text-transform: uppercase;\n'
        '    margin-top: 1mm;\n'
        '    text-align: center;\n'
        '  }\n'
        '</style>\n'
    )

    if "</head>" in template_html:
        return template_html.replace("</head>", f"{compat_css}</head>", 1)

    return f"{compat_css}{template_html}"


def _resolve_template(custom_template: Optional[str], template_name: Optional[str]):
    """Resolve published visual template if needed."""
    resolved_custom = custom_template
    resolved_name = template_name
    if template_name and not custom_template:
        compiled = get_published_template_by_name(template_name)
        if compiled:
            resolved_custom = compiled
            resolved_name = None
    resolved_custom = _normalize_photo_grid_template_compat(resolved_custom)
    return resolved_custom, resolved_name


def _validate_report_data(row_data):
    """Validate against Pydantic model for defaults and legacy patching."""
    try:
        if isinstance(row_data, dict) and 'valvulas' in row_data:
            validated = TechnicalReport(**row_data)
            return validated.model_dump()
    except Exception as e:
        print(f"Warning: Model validation failed (continuing with raw data): {e}")
    return row_data


async def _process_logo(logo_file):
    if not logo_file:
        return None
    content = await logo_file.read()
    encoded = base64.b64encode(content).decode("utf-8")
    mime = "image/png" if (logo_file.filename or "").lower().endswith(".png") else "image/jpeg"
    return f"data:{mime};base64,{encoded}"


def _build_reports_payload(row_data, file_map: Dict):
    """Build reports payload from parsed data and file map."""
    reports_payload = []
    if isinstance(row_data, list):
        for item in row_data:
            r_data = item.get("row_data", {})
            img_names = item.get("image_filenames", [])
            r_files = [file_map[str(n)] for n in img_names if str(n) in file_map]
            reports_payload.append({"data": r_data, "files": r_files})
    else:
        reports_payload.append({"data": row_data, "files": list(file_map.values())})
    return reports_payload


# --- Endpoints ---

@router.post("/generate-pdf")
async def generate_single_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    data: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    customTemplate: Optional[str] = Form(None),
    templateName: Optional[str] = Form(None)
):
    print(f"Received request: data len={len(data)}, files={len(files)}, customTemplate={'yes' if customTemplate else 'no'}, templateName={templateName}")
    try:
        row_data = json.loads(data)

        resolved_custom_template, resolved_template_name = _resolve_template(customTemplate, templateName)
        row_data = _validate_report_data(row_data)

        logo_left_b64 = await _process_logo(logoLeft)
        logo_right_b64 = await _process_logo(logoRight)

        with tempfile.TemporaryDirectory() as temp_dir:
            file_map: Dict = {}
            for index, file in enumerate(files):
                original_name = file.filename or f"upload_{index:04d}"
                file_path = build_safe_upload_path(temp_dir, original_name, prefix=f"{index:04d}_", default_name="image")
                await save_upload(file, file_path)
                file_map[original_name] = {"name": original_name, "path": file_path}

            service = request.app.state.report_service
            reports_payload = _build_reports_payload(row_data, file_map)

            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_output:
                output_path = tmp_output.name

            try:
                await service.generate_batch_pdf(
                    reports_payload,
                    output_path=output_path,
                    logo_left=logo_left_b64,
                    logo_right=logo_right_b64,
                    custom_template_str=resolved_custom_template,
                    template_name=resolved_template_name
                )
            except Exception:
                if os.path.exists(output_path):
                    os.remove(output_path)
                raise

            background_tasks.add_task(_cleanup_file, output_path)

            return FileResponse(
                output_path,
                media_type="application/pdf",
                filename="report_consolidado.pdf"
            )

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format in 'data' field: {str(e)}")
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"PDF Generation Error:\n{error_trace}")

        error_msg = str(e)
        if "weasyprint" in error_trace.lower():
            error_msg = f"PDF Generation Engine Error (WeasyPrint): {str(e)}"
        elif "No such file" in error_msg:
             error_msg = f"Missing file resource: {str(e)}"

        raise HTTPException(
            status_code=500,
            detail={
                "message": "Failed to generate PDF",
                "reason": error_msg,
                "type": type(e).__name__
            }
        )


@router.post("/generate-pdf-progress")
async def generate_pdf_with_progress(
    request: Request,
    data: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    customTemplate: Optional[str] = Form(None),
    templateName: Optional[str] = Form(None)
):
    """SSE version of /generate-pdf with real-time progress events."""
    row_data = json.loads(data)

    resolved_custom_template, resolved_template_name = _resolve_template(customTemplate, templateName)
    row_data = _validate_report_data(row_data)

    logo_left_b64 = await _process_logo(logoLeft)
    logo_right_b64 = await _process_logo(logoRight)

    # Read all file contents into memory before streaming response starts
    file_contents = []
    for file in files:
        content = await file.read()
        file_contents.append({"filename": file.filename, "content": content})

    service = request.app.state.report_service

    async def event_generator():
        progress_queue: asyncio.Queue = asyncio.Queue()

        async def on_progress(phase: str, current: int, total: int, detail: str = ""):
            await progress_queue.put({"phase": phase, "current": current, "total": total, "detail": detail})

        async def run_generation():
            temp_dir = tempfile.mkdtemp()
            try:
                file_map = {}
                for fc in file_contents:
                    fpath = os.path.join(temp_dir, fc["filename"])
                    with open(fpath, "wb") as f:
                        f.write(fc["content"])
                    file_map[fc["filename"]] = {"name": fc["filename"], "path": fpath}

                reports_payload = _build_reports_payload(row_data, file_map)

                filename = f"pdf_{uuid.uuid4().hex[:12]}.pdf"
                output_path = os.path.join(tempfile.gettempdir(), filename)

                await service.generate_batch_pdf(
                    reports_payload,
                    output_path=output_path,
                    logo_left=logo_left_b64,
                    logo_right=logo_right_b64,
                    custom_template_str=resolved_custom_template,
                    template_name=resolved_template_name,
                    on_progress=on_progress
                )
                await progress_queue.put({"phase": "done", "download_url": f"/api/download-temp/{filename}"})
            except Exception as e:
                try:
                    await progress_queue.put({"phase": "error", "detail": str(e)})
                except Exception:
                    progress_queue.put_nowait({"phase": "error", "detail": str(e)})
            except BaseException as e:
                progress_queue.put_nowait({"phase": "error", "detail": "La generación fue interrumpida"})
                raise
            finally:
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
                try:
                    progress_queue.put_nowait(None)
                except Exception:
                    pass

        asyncio.create_task(run_generation())

        while True:
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


@router.get("/download-temp/{filename}")
async def download_temp_file(filename: str, background_tasks: BackgroundTasks):
    """Download a temporary PDF file and schedule cleanup."""
    if not re.match(r'^pdf_[a-f0-9]{12}\.pdf$', filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = os.path.join(tempfile.gettempdir(), filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found or expired")
    background_tasks.add_task(_cleanup_file, path)
    return FileResponse(path, media_type="application/pdf", filename="report_consolidado.pdf")
