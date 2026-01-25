"""
PDF Tools - Sistema de Merge y Split de PDFs
=============================================

Módulo para manipulación de archivos PDF con soporte para:
- Merge intercalado (collated/interleaved)
- Split por número de páginas
"""

from .pdf_merger import merge_pdfs_interleaved
from .pdf_splitter import split_pdf, split_pdf_by_ranges
from .utils import validate_pdf_file, get_pdf_info

__all__ = [
    "merge_pdfs_interleaved",
    "split_pdf",
    "split_pdf_by_ranges",
    "validate_pdf_file",
    "get_pdf_info",
]

__version__ = "1.0.0"
