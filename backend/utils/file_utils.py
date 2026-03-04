"""
Utilidades para manejo de archivos
"""

import os
import re
import shutil

from fastapi import UploadFile

_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


async def save_upload(upload: UploadFile, dest: str) -> int:
    """
    Save an UploadFile to disk using streaming (shutil.copyfileobj).
    Returns the number of bytes written.
    """
    with open(dest, "wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
        return buffer.tell()


def sanitize_upload_filename(filename: str, default_name: str = "upload") -> str:
    """
    Normalize user-controlled multipart filenames before using them on disk.
    """
    raw = str(filename or "").replace("\\", "/").split("/")[-1]
    cleaned = _SAFE_FILENAME_RE.sub("_", raw).strip("._")
    return cleaned or default_name


def build_safe_upload_path(directory: str, filename: str, prefix: str = "", default_name: str = "upload") -> str:
    """
    Build a safe path inside ``directory`` using a sanitized basename.
    """
    safe_name = sanitize_upload_filename(filename, default_name=default_name)
    if prefix:
        safe_name = f"{prefix}{safe_name}"
    return os.path.join(directory, safe_name)
