from dotenv import load_dotenv  # type: ignore
try:
    load_dotenv(encoding='utf-8')
except (UnicodeDecodeError, ValueError):
    import os
    os.environ.setdefault('PYTHONPATH', './backend')

from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, APIRouter, Request  # type: ignore
from fastapi.exceptions import RequestValidationError  # type: ignore
from fastapi.staticfiles import StaticFiles  # type: ignore
import base64
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from fastapi.responses import FileResponse, JSONResponse  # type: ignore
from pydantic import BaseModel, Field  # type: ignore
import os
import json
import tempfile
import traceback
import re
from typing import Any, Dict, List, Literal, Optional
from report_service import ReportService  # type: ignore
from pdf_tools import merge_pdfs_interleaved, merge_pdfs_sequential, split_pdf, split_pdf_by_ranges, organize_pdf  # type: ignore
import zipfile
from technical_reports.router import router as technical_reports_router  # type: ignore
from technical_reports.models import TechnicalReport  # type: ignore
from fichas_tecnicas.router import router as fichas_tecnicas_router  # type: ignore
from image_optimizer.router import router as image_optimizer_router  # type: ignore
from compressor.router import router as compressor_router  # type: ignore
from template_editor.router import router as template_editor_router  # type: ignore
from template_editor.service import (  # type: ignore
    get_all_published_templates,
    get_preview_html,
    get_published_template_by_name,
    get_template,
    publish_template,
    set_template_status,
)
from utils.file_utils import save_upload  # type: ignore

PHOTO_GRID_HEAD_CLOSE_RE = re.compile(r"</head>", re.IGNORECASE)


# --- Cleanup helper (used by multiple endpoints) ---
def _cleanup_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Error removing temp file {path}: {e}")


def _normalize_photo_grid_template_compat(template_html: Optional[str]) -> Optional[str]:
    """Backwards-compatible photo-grid fix for legacy template-editor exports.

    Injects CSS that normalises photo layout for both legacy templates (images
    directly inside ``.photo-cell-wrap``) and modern ones (images inside a
    ``.photo-media`` wrapper).  No HTML restructuring is performed so the fix
    is resilient to any variation in the template markup.
    """
    if not template_html or not isinstance(template_html, str):
        return template_html

    if "photo-cell-wrap" not in template_html:
        return template_html

    # CSS-only approach: style rules that handle both legacy (img directly in
    # .photo-cell-wrap) and modern (.photo-media wrapper) structures.
    # `!important` is used only where inline styles on legacy exports must be
    # overridden.
    compat_css = """
<style id="photo-grid-compat-fix">
  .photo-cell-wrap {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 1mm;
    box-sizing: border-box;
    overflow: hidden;
  }
  .photo-media {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* Legacy templates: img is a direct child of .photo-cell-wrap */
  .photo-cell-wrap > img {
    flex: 1 1 auto;
    min-height: 0;
    width: 100% !important;
    height: auto !important;
    max-height: 100%;
    object-fit: contain !important;
    object-position: center !important;
    display: block;
    image-orientation: from-image;
  }
  /* Modern templates: img inside .photo-media wrapper */
  .photo-media > img {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    object-position: center !important;
    display: block;
    image-orientation: from-image;
  }
  /* Catch-all for img nested deeper (e.g. inside Jinja blocks) */
  .photo-cell-wrap img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center;
    display: block;
  }
</style>
"""

    if "</head>" in template_html.lower():
        # FIX: BUG-008 reuse compiled regex for repeated template normalizations in batch flows
        return PHOTO_GRID_HEAD_CLOSE_RE.sub(f"{compat_css}</head>", template_html, count=1)
    return f"{compat_css}{template_html}"


def _validate_pdf_file(file: UploadFile) -> bool:
    """Valida PDF por magic number sin consumir el stream de forma permanente."""
    try:
        # Preserve current position to avoid side effects before save_upload.
        current_pos = file.file.tell()
        file.file.seek(0)
        header = file.file.read(5)
        file.file.seek(current_pos)
        return header == b"%PDF-"
    except Exception:
        return False


def _validate_pdf_uploads(files: List[UploadFile], min_files: int = 2) -> None:
    """Validación compartida para endpoints de merge sin alterar contrato de API."""
    if len(files) < min_files:
        raise HTTPException(status_code=400, detail="Se requieren al menos 2 archivos PDF")
    for file in files:
        if not _validate_pdf_file(file):
            raise HTTPException(status_code=400, detail=f"El archivo '{file.filename}' no es un PDF válido")


# --- App Lifespan: singleton ReportService ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.report_service = ReportService()
    print("[App] ReportService initialized (singleton)")
    yield
    await app.state.report_service.close()
    print("[App] ReportService closed")

app = FastAPI(lifespan=lifespan)


def _is_development_environment() -> bool:
    env_name = os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "production"
    return env_name.strip().lower() in {"dev", "development", "local"}


def _get_cors_allowed_origins() -> List[str]:
    raw_origins = (os.getenv("CORS_ALLOWED_ORIGINS") or os.getenv("CORS_ORIGINS") or "").strip()
    if raw_origins:
        origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
        if "*" in origins:
            if _is_development_environment():
                return ["*"]
            filtered_origins = [origin for origin in origins if origin != "*"]
            print("[CORS] Ignoring wildcard origin outside development environment")
            return filtered_origins
        return origins

    if _is_development_environment():
        return ["*"]

    print("[CORS] CORS_ALLOWED_ORIGINS/CORS_ORIGINS is not configured; no cross-origin requests will be allowed")
    return []


def _error_code_from_status(status_code: int) -> str:
    if status_code == 400:
        return "BAD_REQUEST"
    if status_code == 401:
        return "UNAUTHORIZED"
    if status_code == 403:
        return "FORBIDDEN"
    if status_code == 404:
        return "NOT_FOUND"
    if status_code == 405:
        return "METHOD_NOT_ALLOWED"
    if status_code == 409:
        return "CONFLICT"
    if status_code == 422:
        return "VALIDATION_ERROR"
    if status_code == 429:
        return "RATE_LIMITED"
    if 500 <= status_code < 600:
        return "INTERNAL_ERROR"
    return "REQUEST_ERROR"


def _extract_error_message(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict):
        if isinstance(detail.get("message"), str):
            return detail["message"]
        return json.dumps(detail, ensure_ascii=False)
    if isinstance(detail, list):
        return json.dumps(detail, ensure_ascii=False)
    return str(detail)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    message = _extract_error_message(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": message,
            "error": {
                "code": _error_code_from_status(exc.status_code),
                "message": message,
            },
        },
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Error de validación de solicitud",
            },
        },
    )

# Enable CORS with environment-based allowed origins.
cors_allowed_origins = _get_cors_allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Original-Size",
        "X-Compressed-Size",
        "X-Reduction-Percent",
        "X-Filename",
        "X-Error",
        "Content-Disposition",
    ],
)

# Create API Router with prefix
api_router = APIRouter(prefix="/api")


class TemplateStatusUpdatePayload(BaseModel):
    status: Literal["draft", "published", "archived"] = Field(default="draft")
    author: str = Field(default="system", min_length=1, max_length=120)

# Include the routers (Only include once)
app.include_router(technical_reports_router)
app.include_router(fichas_tecnicas_router)
app.include_router(image_optimizer_router)
app.include_router(compressor_router)
app.include_router(template_editor_router)

@api_router.get("/templates")
async def list_templates():
    templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
    if not os.path.exists(templates_dir):
        file_templates = []
    else:
        file_templates = [f for f in os.listdir(templates_dir) if f.endswith(".html") and f != "report.html"]

    # Include published templates from the block editor
    editor_templates = get_all_published_templates()

    return {"templates": file_templates, "editorTemplates": editor_templates}


@api_router.get("/templates/published")
async def list_published_templates():
    return {"templates": get_all_published_templates()}


@api_router.patch("/templates/{template_id}")
async def update_template_status_endpoint(template_id: str, payload: TemplateStatusUpdatePayload):
    try:
        if payload.status == "published":
            updated = publish_template(template_id, payload.author)
        else:
            updated = set_template_status(template_id, payload.status, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")

    return updated.model_dump()


@api_router.put("/templates/{template_id}")
async def update_template_status_put_endpoint(template_id: str, payload: TemplateStatusUpdatePayload):
    return await update_template_status_endpoint(template_id, payload)


@api_router.get("/templates/{template_id}/render")
async def render_template_by_id(template_id: str):
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    compiled_html = get_preview_html(template_id)
    if not compiled_html:
        raise HTTPException(status_code=404, detail="Contenido de plantilla no encontrado")

    latest_version = record.versions[-1] if record.versions else None
    template_json: Optional[Dict[str, Any]] = None
    if latest_version and latest_version.templateJson:
            template_json = latest_version.templateJson.model_dump()

    published_at = None
    for version in reversed(record.versions):
        if version.status == "published":
            published_at = version.diffSummary.get("publishedAt") or version.createdAt
            break

    return {
        "id": record.id,
        "name": record.name,
        "status": record.status,
        "content": compiled_html,
        "templateJson": template_json,
        "publishedAt": published_at,
        "updatedAt": record.updatedAt,
    }

@api_router.get("/templates/{filename}")
async def get_template_content(filename: str):
    # Security: Ensure filename is just a name, not a path
    safe_filename = os.path.basename(filename)
    templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
    file_path = os.path.join(templates_dir, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"name": safe_filename, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/generate-pdf")
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
        # Parse JSON data
        row_data = json.loads(data)

        # Compatibility bridge: optionally resolve published visual template without changing API contract.
        resolved_custom_template = customTemplate
        resolved_template_name = templateName
        if templateName and not customTemplate:
            compiled_template = get_published_template_by_name(templateName)
            if compiled_template:
                resolved_custom_template = compiled_template
                resolved_template_name = None

        resolved_custom_template = _normalize_photo_grid_template_compat(resolved_custom_template)

        # Validate against Pydantic model to ensure defaults and legacy patching.
        # The root_validator in TechnicalReport handles all legacy/incomplete data
        # normalization (valvulas.impulsion, canastillas '14', missing inspeccion).
        try:
            if isinstance(row_data, dict) and 'valvulas' in row_data:
                validated = TechnicalReport(**row_data)
                row_data = validated.model_dump()
        except Exception as e:
            print(f"Warning: Model validation failed (continuing with raw data): {e}")

        # Helper to process logo
        async def process_logo(logo_file):
            if not logo_file: return None
            content = await logo_file.read()
            encoded = base64.b64encode(content).decode("utf-8")
            # Detect mime
            mime = "image/jpeg"
            if logo_file.filename.lower().endswith(".png"):
                mime = "image/png"
            return f"data:{mime};base64,{encoded}"

        logo_left_b64 = await process_logo(logoLeft)
        logo_right_b64 = await process_logo(logoRight)

        # Create temp directory for images
        with tempfile.TemporaryDirectory() as temp_dir:
            file_map = {}  # type: ignore

            # Save uploaded images to temp dir
            for file in files:
                file_path = os.path.join(temp_dir, file.filename)
                await save_upload(file, file_path)
                file_map[file.filename] = {"name": file.filename, "path": file_path}

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
                            r_files.append(mapped_file)  # type: ignore

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
                    logo_left=logo_left_b64,
                    logo_right=logo_right_b64,
                    custom_template_str=resolved_custom_template,
                    template_name=resolved_template_name
                )
            except Exception:
                # If generation fails, ensure we clean up the file immediately
                if os.path.exists(output_path):
                    os.remove(output_path)
                raise

            background_tasks.add_task(_cleanup_file, output_path)

            # Return FileResponse (streams from disk)
            return FileResponse(
                output_path,
                media_type="application/pdf",
                filename="report_consolidado.pdf"
            )

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Formato JSON inválido en el campo 'data': {str(e)}")
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"PDF Generation Error:\n{error_trace}")

        # Try to provide a user-friendly message for common errors
        error_msg = str(e)
        if "weasyprint" in error_trace.lower():
            error_msg = f"Error del motor de generación PDF (WeasyPrint): {str(e)}"
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

# --- SSE Progress Endpoints ---

from fastapi.responses import StreamingResponse  # type: ignore
from progress import format_sse_event, ProgressCallback  # type: ignore


@api_router.post("/generate-pdf-progress")
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
    import asyncio
    import uuid

    # --- Same data preparation as generate_single_pdf ---
    row_data = json.loads(data)

    resolved_custom_template = customTemplate
    resolved_template_name = templateName
    if templateName and not customTemplate:
        compiled_template = get_published_template_by_name(templateName)
        if compiled_template:
            resolved_custom_template = compiled_template
            resolved_template_name = None
    resolved_custom_template = _normalize_photo_grid_template_compat(resolved_custom_template)

    try:
        if isinstance(row_data, dict) and 'valvulas' in row_data:
            validated = TechnicalReport(**row_data)
            row_data = validated.model_dump()
    except Exception:
        pass

    async def process_logo(logo_file):
        if not logo_file:
            return None
        content = await logo_file.read()
        encoded = base64.b64encode(content).decode("utf-8")
        mime = "image/png" if (logo_file.filename or "").lower().endswith(".png") else "image/jpeg"
        return f"data:{mime};base64,{encoded}"

    logo_left_b64 = await process_logo(logoLeft)
    logo_right_b64 = await process_logo(logoRight)

    # Read all file contents into memory before streaming response starts
    file_contents = []
    for file in files:
        content = await file.read()
        file_contents.append({"filename": file.filename, "content": content})

    if isinstance(row_data, list):
        uploaded_filenames = {item["filename"] for item in file_contents}
        for item in row_data:
            for name in item.get("image_filenames", []):
                if str(name) not in uploaded_filenames:
                    # FIX: BUG-005 avoid silent image mapping failures with descriptive 400
                    raise HTTPException(status_code=400, detail=f"Image filename '{name}' not found in uploaded files")

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

                reports_payload = []
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
                # CancelledError / KeyboardInterrupt: signal the frontend before re-raising
                progress_queue.put_nowait({"phase": "error", "detail": "La generación fue interrumpida"})
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


@api_router.get("/download-temp/{filename}")
async def download_temp_file(filename: str, background_tasks: BackgroundTasks):
    """Download a temporary PDF file and schedule cleanup."""
    if not re.match(r'^pdf_[a-f0-9]{12}\.pdf$', filename):
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    path = os.path.join(tempfile.gettempdir(), filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado o expirado")
    background_tasks.add_task(_cleanup_file, path)
    return FileResponse(path, media_type="application/pdf", filename="report_consolidado.pdf")


# --- PDF Tools Endpoints ---

@api_router.post("/tools/merge-pdfs")
async def tool_merge_pdfs(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    strict: bool = Form(False)
):
    print(f"Tool Merge Request: {len(files)} files, strict={strict}")
    _validate_pdf_uploads(files)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_paths = []
            # Save uploaded files (streaming)
            for file in files:
                file_path = os.path.join(temp_dir, file.filename)
                await save_upload(file, file_path)
                input_paths.append(file_path)

            # Output to persistent temp file (survives TemporaryDirectory cleanup)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            final_path = tmp.name
            tmp.close()

            # Execute merge
            merge_pdfs_interleaved(
                input_paths=input_paths,
                output_path=final_path,
                strict=strict
            )

        background_tasks.add_task(_cleanup_file, final_path)
        return FileResponse(
            final_path,
            media_type="application/pdf",
            filename="merged_interleaved.pdf"
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Merge Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/tools/merge-pdfs-normal")
async def tool_merge_pdfs_normal(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...)
):
    """
    Merge normal (secuencial) - Une PDFs uno después del otro sin intercalar.
    """
    print(f"Tool Merge Normal Request: {len(files)} files")
    _validate_pdf_uploads(files)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_paths = []
            # Save uploaded files with unique names to avoid collisions (streaming)
            for idx, file in enumerate(files):
                safe_filename = f"{idx:04d}_{file.filename}"
                file_path = os.path.join(temp_dir, safe_filename)
                file_size = await save_upload(file, file_path)
                input_paths.append(file_path)
                print(f"  Saved file {idx}: {file.filename} -> {safe_filename} ({file_size} bytes)")

            # Output to persistent temp file
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            final_path = tmp.name
            tmp.close()

            # Execute sequential merge
            merge_pdfs_sequential(
                input_paths=input_paths,
                output_path=final_path
            )

        background_tasks.add_task(_cleanup_file, final_path)
        return FileResponse(
            final_path,
            media_type="application/pdf",
            filename="merged_normal.pdf"
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Merge Normal Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/tools/split-pdf")
async def tool_split_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mode: str = Form("pages"),  # 'pages' or 'custom'
    pages_per_file: int = Form(1, ge=1, le=500),  # FIX: BUG-009 prevent zero/negative pages per split file
    ranges: Optional[str] = Form(None)  # JSON string e.g. "[[1,2], [3,5]]"
):
    print(f"Tool Split Request: {file.filename}, mode={mode}, pages={pages_per_file}, ranges={ranges}")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # Save input file (streaming)
            input_path = os.path.join(temp_dir, file.filename)
            await save_upload(file, input_path)

            output_dir = os.path.join(temp_dir, "split_output")
            os.makedirs(output_dir, exist_ok=True)

            # Execute split based on mode
            if mode == "custom" and ranges:
                # Parse ranges
                try:
                    range_list = json.loads(ranges)
                    # Convert to list of tuples
                    range_tuples = [(r[0], r[1]) for r in range_list]
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Formato de rangos inválido: {e}")

                output_files = split_pdf_by_ranges(
                    input_path=input_path,
                    output_dir=output_dir,
                    ranges=range_tuples
                )
            else:
                # Default Pages Per File mode
                output_files = split_pdf(
                    input_path=input_path,
                    output_dir=output_dir,
                    pages_per_file=pages_per_file
                )

            # Create ZIP to persistent temp file (not BytesIO)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
            final_zip = tmp.name
            tmp.close()
            with zipfile.ZipFile(final_zip, mode='w', compression=zipfile.ZIP_DEFLATED) as zip_file:
                for f_path in output_files:
                    zip_file.write(f_path, arcname=os.path.basename(f_path))

        background_tasks.add_task(_cleanup_file, final_zip)
        return FileResponse(
            final_zip,
            media_type="application/zip",
            filename=f"{os.path.splitext(file.filename)[0]}_split.zip"
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Split Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/tools/organize-pdf")
async def tool_organize_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    operations: str = Form(...),
    mode: str = Form("organize"),
    ranges: Optional[str] = Form(None),
):
    """
    Endpoint para la tab ORGANIZAR de pdf-tools.html.
    Recibe el archivo PDF + operations JSON del frontend (executeOrganize()).

    El frontend envía:
      operations = {
        pageOrder: [int, ...],   // originalPageNum de cada página activa, 1-indexed
        rotations: [int, ...],   // grados de rotación por página
        cuts: [int, ...]         // índices de corte 0-indexed sobre el array resultado
      }
      mode = "organize" | "organize-split"

    Responde:
      - mode=organize: application/pdf  → filename: organized.pdf
      - mode=organize-split: application/zip → filename: organized_split.zip
    """
    try:
        ops = json.loads(operations)
    except Exception:
        raise HTTPException(status_code=400, detail="JSON de 'operations' inválido")

    page_order = ops.get("pageOrder", [])
    rotations = ops.get("rotations", [])
    cuts = ops.get("cuts", [])

    if not page_order:
        raise HTTPException(status_code=400, detail="pageOrder está vacío")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = os.path.join(temp_dir, file.filename)
            await save_upload(file, input_path)

            if mode == "organize-split" and cuts:
                output_paths = organize_pdf(
                    input_path=input_path,
                    output_path=temp_dir,
                    page_order=page_order,
                    rotations=rotations,
                    cuts=cuts,
                )["output_paths"]

                final_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip").name
                with zipfile.ZipFile(final_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                    for i, p in enumerate(output_paths, 1):
                        zf.write(p, arcname=f"part_{i:02d}.pdf")

                background_tasks.add_task(_cleanup_file, final_zip)
                return FileResponse(
                    final_zip,
                    media_type="application/zip",
                    filename="organized_split.zip",
                )
            else:
                final_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
                organize_pdf(
                    input_path=input_path,
                    output_path=final_path,
                    page_order=page_order,
                    rotations=rotations,
                    cuts=None,
                )

                background_tasks.add_task(_cleanup_file, final_path)
                return FileResponse(
                    final_path,
                    media_type="application/pdf",
                    filename="organized.pdf",
                )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Organize Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Include the API router
app.include_router(api_router)


# SERVING FRONTEND (React) - For Hugging Face Spaces / Docker
# If 'static' folder exists (created by Dockerfile), serve it.
if os.path.exists("static"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

    @app.get("/technical-reports")
    async def serve_page_technical():
        return FileResponse("static/technical-reports.html")

    # Catch-all for SPA (must be last)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow API calls to pass through (just in case)
        if full_path.startswith("api/"):
             raise HTTPException(status_code=404, detail="No encontrado")

        # Check if file exists in static (e.g. favicon.ico, public assets)
        path = os.path.join("static", full_path)
        if os.path.exists(path) and os.path.isfile(path):
            return FileResponse(path)

        # Fallback to index.html for React Router
        return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn  # type: ignore
    uvicorn.run(app, host="0.0.0.0", port=7860)
