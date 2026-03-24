# -*- coding: utf-8 -*-
"""
Router dedicado para descarga de archivos temporales (/api/download-temp).
Extraído de main.py para separación de responsabilidades.
"""
import os
import re
import tempfile
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import FileResponse

from core.helpers import cleanup_file, normalize_download_filename

router = APIRouter(prefix="/api", tags=["temp-downloads"])


@router.get("/download-temp/{filename}")
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
    background_tasks.add_task(cleanup_file, path)
    normalized_download_name = normalize_download_filename(download_name)
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=normalized_download_name,
        headers={"X-Filename": normalized_download_name},
    )
