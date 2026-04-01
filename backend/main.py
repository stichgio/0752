# -*- coding: utf-8 -*-
from pathlib import Path
import os

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(*_args, **_kwargs):
        return False

# Cargar .env desde la raíz del repo y desde backend/ (antes de cualquier import que lea os.environ)
_backend_dir = Path(__file__).resolve().parent
_repo_root = _backend_dir.parent
try:
    load_dotenv(_repo_root / ".env", encoding="utf-8")
    load_dotenv(_backend_dir / ".env", encoding="utf-8", override=True)
except (UnicodeDecodeError, ValueError, OSError):
    os.environ.setdefault('PYTHONPATH', './backend')

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import logging
import json
from typing import Any

logger = logging.getLogger(__name__)

from technical_reports.router import router as technical_reports_router
from fichas_tecnicas.router import router as fichas_tecnicas_router
from image_optimizer.router import router as image_optimizer_router
from compressor.router import router as compressor_router
from template_editor.router import router as template_editor_router
from msheets.multi_sheet_report import router as msheets_router
from formatos.router import router as formatos_router  # noqa
from panel_fotografico.router import router as panel_fotografico_router  # noqa
from desinfeccion_reservorios.router import router as desinfeccion_reservorios_router  # noqa
from maquina_balde.router import router as maquina_balde_router  # noqa
from routers.templates.router import router as api_templates_router
from routers.generation.router import router as generation_router
from routers.temp_downloads.router import router as temp_downloads_router
from routers.pdf_tools.router import router as api_pdf_tools_router
from routers.admin_users import router as admin_users_router
from config import settings
from services.report_service import ReportService

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


from fastapi import HTTPException  # noqa: E402


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
                "message": "Error de validaci\u00f3n de solicitud",
            },
        },
    )

# Enable CORS with environment-based allowed origins.
cors_allowed_origins = settings.effective_cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins,
    allow_credentials=True,
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

# --- Include all routers ---

# Existing module routers
app.include_router(technical_reports_router)
app.include_router(fichas_tecnicas_router)
app.include_router(image_optimizer_router)
app.include_router(compressor_router)
app.include_router(template_editor_router)
app.include_router(msheets_router, prefix="/api/multi-sheet")
app.include_router(formatos_router)
app.include_router(panel_fotografico_router)
app.include_router(desinfeccion_reservorios_router)
app.include_router(maquina_balde_router)

# New dedicated routers (extracted from main.py)
app.include_router(api_templates_router)
app.include_router(generation_router)
app.include_router(temp_downloads_router)
app.include_router(api_pdf_tools_router)
app.include_router(admin_users_router)


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
