"""
Utilidades para manejo de archivos
"""

import os
import re
from pathlib import Path


def safe_filename(filename: str) -> str:
    """
    Sanitiza un nombre de archivo para evitar path traversal.

    Args:
        filename: Nombre del archivo original

    Returns:
        Nombre de archivo seguro
    """
    # Obtener solo el nombre base (sin path)
    safe_name = os.path.basename(filename)

    # Remover caracteres potencialmente peligrosos
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', safe_name)

    # Limitar longitud
    if len(safe_name) > 255:
        name, ext = os.path.splitext(safe_name)
        safe_name = name[:255 - len(ext)] + ext

    return safe_name


def cleanup_temp_file(path: str) -> None:
    """
    Elimina un archivo temporal de forma segura.

    Args:
        path: Ruta al archivo a eliminar
    """
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Error removing temp file {path}: {e}")


def ensure_directory(path: Path) -> Path:
    """
    Asegura que un directorio exista, creándolo si es necesario.

    Args:
        path: Ruta del directorio

    Returns:
        La misma ruta del directorio
    """
    path.mkdir(parents=True, exist_ok=True)
    return path
