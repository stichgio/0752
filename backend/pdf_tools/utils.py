"""
Utilidades y helpers para manipulación de PDFs.

Este módulo contiene funciones de validación y utilidades
compartidas por los módulos de merge y split.
"""
from __future__ import annotations

import logging
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError

# Configuración de logging
logger = logging.getLogger(__name__)


class PDFValidationError(Exception):
    """Excepción para errores de validación de PDF."""
    pass


class PDFProcessingError(Exception):
    """Excepción para errores durante el procesamiento de PDF."""
    pass


def validate_pdf_file(file_path: str) -> tuple[bool, str]:
    """
    Valida que un archivo exista y sea un PDF válido.
    
    Args:
        file_path: Ruta al archivo PDF a validar
        
    Returns:
        Tupla (es_valido, mensaje)
        - es_valido: True si el archivo es un PDF válido
        - mensaje: Descripción del resultado o error
    """
    path = Path(file_path)
    
    # Verificar existencia
    if not path.exists():
        return False, f"El archivo no existe: {file_path}"
    
    # Verificar que sea un archivo (no directorio)
    if not path.is_file():
        return False, f"La ruta no es un archivo: {file_path}"
    
    # Verificar extensión
    if path.suffix.lower() != ".pdf":
        return False, f"El archivo no tiene extensión .pdf: {file_path}"
    
    # Verificar que no esté vacío
    if path.stat().st_size == 0:
        return False, f"El archivo está vacío: {file_path}"
    
    # Intentar abrir como PDF
    try:
        reader = PdfReader(file_path)
        num_pages = len(reader.pages)
        
        if num_pages == 0:
            return False, f"El PDF no contiene páginas: {file_path}"
            
        return True, f"PDF válido con {num_pages} página(s)"
        
    except PdfReadError as e:
        return False, f"Error al leer PDF (archivo corrupto o protegido): {e}"
    except Exception as e:
        return False, f"Error inesperado al validar PDF: {e}"


def ensure_directory(dir_path: str) -> Path:
    """
    Asegura que un directorio exista, creándolo si es necesario.
    
    Args:
        dir_path: Ruta al directorio
        
    Returns:
        Path object del directorio
    """
    path = Path(dir_path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def generate_output_filename(
    base_name: str,
    index: int,
    total: int,
    extension: str = ".pdf"
) -> str:
    """
    Genera un nombre de archivo con índice formateado.
    
    Args:
        base_name: Nombre base del archivo
        index: Índice actual (1-based)
        total: Total de archivos
        extension: Extensión del archivo
        
    Returns:
        Nombre de archivo formateado (ej: "documento_001.pdf")
    """
    # Calcular padding necesario
    padding = len(str(total))
    padded_index = str(index).zfill(padding)
    
    return f"{base_name}_{padded_index}{extension}"
