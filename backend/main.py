from dotenv import load_dotenv
try:
    load_dotenv(encoding='utf-8')
except (UnicodeDecodeError, ValueError):
    import os
    os.environ.setdefault('PYTHONPATH', './backend')

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, APIRouter, Request, Query
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
import asyncio
import logging
import os
import json
import tempfile
import traceback
import re
import unicodedata
import uuid
from typing import Any, Dict, List, Literal, Optional, TypedDict
from urllib.parse import quote

logger = logging.getLogger(__name__)
from services.report_service import ReportService
from pdf_tools import merge_pdfs_interleaved, merge_pdfs_sequential, split_pdf, split_pdf_by_ranges, organize_pdf, extract_pages  
from pdf_tools.utils import PDFValidationError  
import zipfile
from technical_reports.router import router as technical_reports_router  
from technical_reports.models import TechnicalReport  
from fichas_tecnicas.router import router as fichas_tecnicas_router  
from image_optimizer.router import router as image_optimizer_router  
from compressor.router import router as compressor_router  
from template_editor.router import router as template_editor_router  
from msheets.multi_sheet_report import router as msheets_router      
# Multi-Sheet Report router imported and added below for production compatibility.
from config import settings  
from template_editor.service import (  
    get_all_published_templates,
    get_preview_html,
    get_published_template_by_name,
    get_template,
    publish_template,
    set_template_status,
)
from utils.file_utils import build_safe_upload_path, save_upload, sanitize_upload_filename  

# ---------------------------------------------------------------------------------------------------
# Starlette/python-multipart defaults to 1 MB per text part, which is too small
# for large customTemplate HTML payloads and batch `data` JSON fields.
# Patch the default so all Form() endpoints accept up to 50 MB per field.
try:
    from starlette.formparsers import MultiPartParser as _MultiPartParser  

    _orig_mp_init = _MultiPartParser.__init__

    def _patched_mp_init(  
        self,
        headers,  
        stream,  
        *args,  
        **kwargs,  
    ) -> None:
        # Preserve Starlette's evolving parser kwargs (for example `max_files`)
        # while still raising the default text-part limit globally.
        kwargs.setdefault("max_part_size", 50 * 1024 * 1024)  # 50 MB (was 1 MB)
        _orig_mp_init(self, headers, stream, *args, **kwargs)

    _MultiPartParser.__init__ = _patched_mp_init  
except Exception:
    pass  # Skip silently if starlette internals change in a future version
# ---------------------------------------------------------------------------------------------------

PHOTO_GRID_HEAD_CLOSE_RE = re.compile(r"</head>", re.IGNORECASE)


class ReportFileEntry(TypedDict):
    name: str
    path: str


class ReportPayloadEntry(TypedDict):
    data: Any
    files: List[ReportFileEntry]


# --- Cleanup helper (used by multiple endpoints) ---
def _cleanup_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        logger.warning("Error removing temp file %s: %s", path, e)


_TEMPLATE_FILENAME_ALIASES = {
    "report_volanteo": "Volante",
    "reporta_volanteo": "Volante",
    "report": "Reporte",
}

_TEMPLATE_ACRONYMS = {"ate", "id", "nis", "ot", "pdf"}


def _slugify_filename_part(value: Any, lowercase: bool = False) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", normalized)
    sanitized = re.sub(r"_+", "_", sanitized).strip("._-")
    if lowercase:
        sanitized = sanitized.lower()
    return sanitized


def _template_filename_label(template_name: Optional[str]) -> str:
    base_name = os.path.splitext(os.path.basename(str(template_name or "")))[0].strip()
    if not base_name:
        return "Reporte"

    alias = _TEMPLATE_FILENAME_ALIASES.get(base_name.lower())
    if alias:
        return alias

    cleaned_name = re.sub(r"^(reporta?|format)[_-]*", "", base_name, flags=re.IGNORECASE).strip("_- ")
    if not cleaned_name:
        return "Reporte"

    words: List[str] = []
    for token in re.split(r"[_\-\s]+", cleaned_name):
        if not token:
            continue
        lower_token = token.lower()
        if token.isdigit():
            words.append(token)
        elif lower_token in _TEMPLATE_ACRONYMS:
            words.append(lower_token.upper())
        else:
            words.append(lower_token.capitalize())

    return "_".join(words) or "Reporte"


def _extract_report_id_value(payload_data: Any, id_column: Optional[str]) -> Optional[Any]:
    candidate_rows: List[Dict[str, Any]] = []

    if isinstance(payload_data, list) and payload_data:
        first_item = payload_data[0] if isinstance(payload_data[0], dict) else {}
        if isinstance(first_item, dict):
            direct_value = first_item.get("id_value")
            if direct_value not in (None, "", "-"):
                return direct_value
            row_data = first_item.get("row_data")
            if isinstance(row_data, dict):
                candidate_rows.append(row_data)
    elif isinstance(payload_data, dict):
        candidate_rows.append(payload_data)

    if not candidate_rows:
        return None

    candidate_keys: List[str] = []
    if id_column:
        id_column_text = str(id_column).strip()
        if id_column_text:
            candidate_keys.extend([id_column_text, id_column_text.upper(), id_column_text.lower()])

    candidate_keys.extend(["NIS", "nis", "ID", "id", "ID_UNICO", "id_unico", "Nro OT", "OT", "ot"])

    for row in candidate_rows:
        for key in candidate_keys:
            value = row.get(key)
            if value not in (None, "", "-"):
                return value

    return None


def _build_pdf_download_filename(
    template_name: Optional[str],
    payload_data: Any,
    export_scope: Optional[str],
    id_column: Optional[str],
) -> str:
    template_label = _template_filename_label(template_name)
    reports_count = len(payload_data) if isinstance(payload_data, list) else 1
    is_consolidated = export_scope == "all" or reports_count > 1

    if is_consolidated:
        consolidated_label = _slugify_filename_part(template_label) or "Reporte"
        return f"Consolidado_{consolidated_label}_{max(reports_count, 0)}.pdf"

    report_id = _extract_report_id_value(payload_data, id_column)
    safe_template = _slugify_filename_part(template_label, lowercase=True) or "reporte"
    safe_id = _slugify_filename_part(report_id, lowercase=True) or "sin_id"
    return f"{safe_template}_{safe_id}.pdf"


def _normalize_download_filename(filename: Optional[str], default_name: str = "report_consolidado.pdf") -> str:
    base_name = os.path.basename(str(filename or "").strip()) or default_name
    stem, _ = os.path.splitext(base_name)
    safe_stem = _slugify_filename_part(stem) or os.path.splitext(default_name)[0]
    return f"{safe_stem}.pdf"


def _inject_template_compat_style(template_html: str, style_id: str, compat_css: str) -> str:
    if style_id in template_html:
        return template_html
    if "</head>" in template_html.lower():
        return PHOTO_GRID_HEAD_CLOSE_RE.sub(f"{compat_css}</head>", template_html, count=1)
    return f"{compat_css}{template_html}"


def _normalize_photo_grid_template_compat(template_html: Optional[str]) -> Optional[str]:
    """Backwards-compatible CSS normalization for template-editor exports.

    The PDF backend can fall back to headless Chrome when WeasyPrint is not
    available. Older compiled templates with photo grids rely on flex/grid
    layouts that Chrome paginates more aggressively, which can split a single
    visual page into an extra overflow page. This function injects CSS-only
    fixes without restructuring the HTML.
    """
    if not template_html or not isinstance(template_html, str):
        return template_html

    normalized_html = template_html

    if "photo-cell-wrap" in normalized_html:
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
        normalized_html = _inject_template_compat_style(
            normalized_html,
            "photo-grid-compat-fix",
            compat_css,
        )

    # Check against original template_html (not normalized_html) to avoid
    # false positives from the injected style id "photo-grid-compat-fix"
    # which contains the substring "photo-grid".
    has_photo_panel = any(
        marker in template_html
        for marker in (
            "panel-fotografico",
            "photo-grid",
            "photo-grid-table",
            "photo-grid-3x2",
            "photo-grid-5",
        )
    )
    has_page_shell = any(
        marker in template_html
        for marker in (
            "class=\"page\"",
            "class='page'",
            ".page {",
            "class=\"template-container\"",
            "class='template-container'",
            ".template-container {",
            "class=\"canvas-page\"",
            "class='canvas-page'",
            ".canvas-page {",
        )
    )
    if has_photo_panel and has_page_shell:
        chrome_page_css = """
<style id="chrome-page-compat-fix">
  @page {
    margin: 0 !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .page,
  .template-container,
  .canvas-page {
    box-sizing: border-box !important;
    overflow: hidden !important;
    page-break-after: always !important;
    page-break-inside: avoid !important;
    break-after: page !important;
    break-inside: avoid-page !important;
  }
  .page:last-child,
  .template-container:last-child,
  .canvas-page:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }
  .page > *,
  .template-container > *,
  .canvas-page > * {
    min-height: 0 !important;
  }
  .panel-fotografico,
  .photo-section {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }
  .photo-grid,
  .photo-grid-table,
  .photo-grid-3x2,
  .photo-grid-5 {
    min-height: 0 !important;
    align-content: stretch !important;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
  }
  .photo-grid-3x2,
  .photo-grid-5 {
    grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
  }
  .photo-cell,
  .photo-grid-table td,
  .photo-grid-table th {
    min-width: 0 !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }
  .photo-cell img,
  .photo-grid img,
  .photo-grid-table img {
    max-width: 100% !important;
    max-height: 100% !important;
    object-fit: contain !important;
    object-position: center !important;
    display: block !important;
  }
</style>
"""
        normalized_html = _inject_template_compat_style(
            normalized_html,
            "chrome-page-compat-fix",
            chrome_page_css,
        )

    return normalized_html


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
    logger.info("[App] ReportService initialized (singleton)")
    yield
    await app.state.report_service.close()
    logger.info("[App] ReportService closed")

app = FastAPI(lifespan=lifespan)


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
            reason = detail.get("reason")
            if reason:
                return f"{detail['message']}: {reason}"
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
cors_allowed_origins = settings.effective_cors_origins
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
app.include_router(msheets_router, prefix="/api/multi-sheet")

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
        download_filename = _build_pdf_download_filename(templateName, row_data, exportScope, idColumn)

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

            background_tasks.add_task(_cleanup_file, output_path)

            # Return FileResponse (streams from disk)
            return FileResponse(
                output_path,
                media_type="application/pdf",
                filename=download_filename,
                headers={"X-Filename": download_filename},
            )

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Formato JSON inválido en el campo 'data': {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error("PDF Generation Error:\n%s", error_trace)

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

from fastapi.responses import StreamingResponse  
from core.progress import format_sse_event, ProgressCallback  


@api_router.post("/generate-pdf-progress")
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

    # --- Same data preparation as generate_single_pdf ---
    row_data = json.loads(data)
    download_filename = _build_pdf_download_filename(templateName, row_data, exportScope, idColumn)

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
async def download_temp_file(
    filename: str,
    background_tasks: BackgroundTasks,
    download_name: Optional[str] = Query(None),
):
    """Download a temporary PDF file and schedule cleanup."""
    if not re.match(r'^pdf_[a-f0-9]{12}\.pdf$', filename):
        raise HTTPException(status_code=400, detail="Nombre de archivo invalido")
    path = os.path.join(tempfile.gettempdir(), filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado o expirado")
    background_tasks.add_task(_cleanup_file, path)
    normalized_download_name = _normalize_download_filename(download_name)
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=normalized_download_name,
        headers={"X-Filename": normalized_download_name},
    )

# --- PDF Tools Endpoints ---

@api_router.post("/tools/merge-pdfs")
async def tool_merge_pdfs(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    strict: bool = Form(False)
):
    logger.info("Tool Merge Request: %d files, strict=%s", len(files), strict)
    _validate_pdf_uploads(files)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_paths = []
            # Save uploaded files (streaming)
            for idx, file in enumerate(files):
                # Avoid collisions when users upload files with the same name
                # (common when coming from different folders/devices).
                safe_filename = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
                file_path = build_safe_upload_path(temp_dir, safe_filename, prefix=f"{idx:04d}_", default_name="document.pdf")
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
        logger.error("Merge Error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/tools/merge-pdfs-normal")
async def tool_merge_pdfs_normal(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...)
):
    """
    Merge normal (secuencial) - Une PDFs uno después del otro sin intercalar.
    """
    logger.info("Tool Merge Normal Request: %d files", len(files))
    _validate_pdf_uploads(files)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_paths = []
            # Save uploaded files with unique names to avoid collisions (streaming)
            for idx, file in enumerate(files):
                safe_filename = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
                file_path = build_safe_upload_path(temp_dir, safe_filename, prefix=f"{idx:04d}_", default_name="document.pdf")
                file_size = await save_upload(file, file_path)
                input_paths.append(file_path)
                logger.debug("  Saved file %d: %s -> %s (%d bytes)", idx, file.filename, safe_filename, file_size)

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
        logger.error("Merge Normal Error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/tools/split-pdf")
async def tool_split_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mode: str = Form("pages"),  # 'pages' or 'custom'
    pages_per_file: int = Form(1, ge=1, le=500),  # FIX: BUG-009 prevent zero/negative pages per split file
    ranges: Optional[str] = Form(None)  # JSON string e.g. "[[1,2], [3,5]]"
):
    logger.info("Tool Split Request: %s, mode=%s, pages=%d, ranges=%s", file.filename, mode, pages_per_file, ranges)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # Save input file (streaming)
            safe_input_name = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
            input_path = build_safe_upload_path(temp_dir, safe_input_name, prefix="input_", default_name="document.pdf")
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
    except (PDFValidationError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Split Error: %s", e, exc_info=True)
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
      - mode=organize: application/pdf  -> filename: organized.pdf
      - mode=organize-split: application/zip -> filename: organized_split.zip
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
            safe_input_name = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
            input_path = build_safe_upload_path(temp_dir, safe_input_name, prefix="input_", default_name="document.pdf")
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
    except (PDFValidationError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Organize Error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/tools/extract-pages")
async def tool_extract_pages(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    pages: str = Form(...),
):
    """
    Extract specific pages from a PDF into a new single PDF.
    pages: JSON array of 1-based page numbers, e.g. "[1,3,7]"
    """
    try:
        raw_page_numbers = json.loads(pages)
    except Exception:
        raise HTTPException(status_code=400, detail="JSON de 'pages' invalido")

    if not isinstance(raw_page_numbers, list) or not raw_page_numbers:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos una pagina")

    page_numbers: List[int] = []
    for idx, value in enumerate(raw_page_numbers, start=1):
        if isinstance(value, bool):
            raise HTTPException(status_code=400, detail=f"Valor de pagina invalido en posicion {idx}: {value}")
        if isinstance(value, int):
            page_numbers.append(value)
            continue
        if isinstance(value, str) and value.strip().isdigit():
            page_numbers.append(int(value.strip()))
            continue
        raise HTTPException(status_code=400, detail=f"Valor de pagina invalido en posicion {idx}: {value}")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            safe_input_name = sanitize_upload_filename(file.filename or "", default_name="document.pdf")
            input_path = build_safe_upload_path(temp_dir, safe_input_name, prefix="input_", default_name="document.pdf")
            await save_upload(file, input_path)

            pdf_bytes = extract_pages(input_path, page_numbers)

            final_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
            with open(final_path, "wb") as f:
                f.write(pdf_bytes)

            background_tasks.add_task(_cleanup_file, final_path)
            return FileResponse(
                final_path,
                media_type="application/pdf",
                filename=f"extracted_{len(page_numbers)}pages.pdf",
            )

    except HTTPException:
        raise
    except (PDFValidationError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Extract Pages Error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Include the API router
app.include_router(api_router)


# SERVING FRONTEND (React) - For Hugging Face Spaces / Docker
# If 'static' folder exists (created by Dockerfile), serve it.
if os.path.exists("static"):
    static_root = Path("static").resolve()
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

    @app.get("/technical-reports")
    async def serve_page_technical():
        return FileResponse("static/technical-reports.html")

    @app.get("/pdf-tools")
    async def serve_page_pdf_tools():
        return FileResponse("static/pdf-tools.html")

    # Catch-all for SPA (must be last)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow API calls to pass through (just in case)
        if full_path.startswith("api/"):
             raise HTTPException(status_code=404, detail="No encontrado")

        # Check if file exists in static (e.g. favicon.ico, public assets)
        candidate = (static_root / full_path).resolve()
        try:
            candidate.relative_to(static_root)
        except ValueError:
            raise HTTPException(status_code=404, detail="No encontrado")
        if candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))

        # Fallback to index.html for React Router
        return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn  
    uvicorn.run(app, host="0.0.0.0", port=7860)


