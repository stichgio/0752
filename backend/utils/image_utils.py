"""
Utilidades para procesamiento de imágenes
"""

import base64
from typing import Optional
from fastapi import UploadFile


async def process_logo_base64(logo_file: Optional[UploadFile]) -> Optional[str]:
    """
    Procesa un archivo de logo y lo convierte a base64 data URI.

    Args:
        logo_file: Archivo de imagen subido

    Returns:
        String data URI en formato base64 o None si no hay archivo
    """
    if not logo_file:
        return None

    content = await logo_file.read()
    encoded = base64.b64encode(content).decode("utf-8")

    # Detectar tipo MIME
    mime = "image/jpeg"
    if logo_file.filename and logo_file.filename.lower().endswith(".png"):
        mime = "image/png"
    elif logo_file.filename and logo_file.filename.lower().endswith(".gif"):
        mime = "image/gif"
    elif logo_file.filename and logo_file.filename.lower().endswith(".webp"):
        mime = "image/webp"

    return f"data:{mime};base64,{encoded}"
