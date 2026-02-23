"""
Utilidades para manejo de archivos
"""

import shutil
from fastapi import UploadFile


async def save_upload(upload: UploadFile, dest: str) -> int:
    """
    Save an UploadFile to disk using streaming (shutil.copyfileobj).
    Returns the number of bytes written.
    """
    with open(dest, "wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
        return buffer.tell()
