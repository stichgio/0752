"""
PDF Tools - Sistema de Merge y Split de PDFs
=============================================

Módulo para manipulación de archivos PDF con soporte para:
- Merge intercalado (collated/interleaved)
- Split por número de páginas
"""

from .pdf_merger import merge_pdfs_interleaved, merge_pdfs_sequential  # pyre-ignore[21]
from .pdf_organizer import organize_pdf  # pyre-ignore[21]
from .pdf_splitter import split_pdf, split_pdf_by_ranges  # pyre-ignore[21]
from .utils import validate_pdf_file  # pyre-ignore[21]

__all__ = [
    "merge_pdfs_interleaved",
    "merge_pdfs_sequential",
    "organize_pdf",
    "split_pdf",
    "split_pdf_by_ranges",
    "validate_pdf_file",
]

__version__ = "1.0.0"
