"""
Servidor FastAPI independiente para Multi-Sheet Report.

Corre en puerto 7861 separado del backend principal (7860).
Arrancar con:
    cd backend && uvicorn msheets.main_msheets:app --host 0.0.0.0 --port 7861 --reload
"""

from __future__ import annotations

# Load .env before anything else (same as main.py)
from dotenv import load_dotenv  
try:
    load_dotenv(encoding='utf-8')
except (UnicodeDecodeError, ValueError):
    pass

import json
import logging
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request  
from fastapi.exceptions import RequestValidationError  
from fastapi.middleware.cors import CORSMiddleware  
from fastapi.responses import JSONResponse  

from msheets.multi_sheet_report import router as multi_sheet_router  

# ── Increase multipart form-field size limit (same as main.py) ────────────────
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
        kwargs.setdefault("max_part_size", 50 * 1024 * 1024)  # 50 MB
        _orig_mp_init(self, headers, stream, *args, **kwargs)

    _MultiPartParser.__init__ = _patched_mp_init  
except Exception:
    pass
# ──────────────────────────────────────────────────────────────────────────────

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(title="Multi-Sheet Report Service", version="1.0.0")


# ── Error handlers (same format as main.py) ──────────────────────────────────

def _error_code_from_status(status_code: int) -> str:
    if status_code == 400:
        return "BAD_REQUEST"
    if status_code == 404:
        return "NOT_FOUND"
    if status_code == 422:
        return "VALIDATION_ERROR"
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


# ── CORS ─────────────────────────────────────────────────────────────────────
_cors_raw = os.environ.get("CORS_ORIGINS", os.environ.get("CORS_ALLOWED_ORIGINS", ""))
if _cors_raw and _cors_raw.strip() != "*":
    _cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
else:
    _cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


# ── Router ───────────────────────────────────────────────────────────────────
app.include_router(multi_sheet_router, prefix="/api/multi-sheet", tags=["multi-sheet-report"])


# ── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "multi-sheet", "port": 7861}


if __name__ == "__main__":
    import uvicorn  
    uvicorn.run(app, host="0.0.0.0", port=7861)
