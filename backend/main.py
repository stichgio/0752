from dotenv import load_dotenv  # type: ignore
try:
    load_dotenv(encoding='utf-8')
except (UnicodeDecodeError, ValueError):
    import os
    os.environ.setdefault('PYTHONPATH', './backend')

import json
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request  # type: ignore
from fastapi.exceptions import RequestValidationError  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from fastapi.responses import JSONResponse  # type: ignore

from report_service import ReportService  # type: ignore

# Feature routers (already prefixed with /api/<feature>)
from technical_reports.router import router as technical_reports_router  # type: ignore
from fichas_tecnicas.router import router as fichas_tecnicas_router  # type: ignore
from image_optimizer.router import router as image_optimizer_router  # type: ignore
from compressor.router import router as compressor_router  # type: ignore
from template_editor.router import router as template_editor_router  # type: ignore

# Route modules extracted from this file
from routes.templates import router as templates_router  # type: ignore
from routes.pdf_generation import router as pdf_generation_router  # type: ignore
from routes.pdf_tools import router as pdf_tools_router  # type: ignore
from routes.static_files import mount_static  # type: ignore


# --- App Lifespan: singleton ReportService ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.report_service = ReportService()
    print("[App] ReportService initialized (singleton)")
    yield
    await app.state.report_service.close()
    print("[App] ReportService closed")

app = FastAPI(lifespan=lifespan)


# --- Unified error response helpers ---

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


from fastapi import HTTPException  # type: ignore

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
                "message": "Request validation failed",
            },
        },
    )


# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for Vercel/HuggingFace deployment
    allow_credentials=False,  # Must be False when using wildcard origins
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


# --- Register routers ---

# Existing feature routers
app.include_router(technical_reports_router)
app.include_router(fichas_tecnicas_router)
app.include_router(image_optimizer_router)
app.include_router(compressor_router)
app.include_router(template_editor_router)

# Extracted route modules
app.include_router(templates_router)
app.include_router(pdf_generation_router)
app.include_router(pdf_tools_router)

# Static / SPA serving (must be last — catch-all route)
mount_static(app)


if __name__ == "__main__":
    import uvicorn  # type: ignore
    uvicorn.run(app, host="0.0.0.0", port=7860)
