"""
PDF Extractor - Extract specific pages from a PDF into a new document.
"""
from __future__ import annotations

import logging
from io import BytesIO

from pypdf import PdfReader, PdfWriter  

from .utils import PDFProcessingError, PDFValidationError, validate_pdf_file  

logger = logging.getLogger(__name__)


def extract_pages(input_path: str, page_numbers: list[int]) -> bytes:
    """
    Extract specific pages from a PDF and return as bytes.

    Args:
        input_path: Path to the source PDF file
        page_numbers: List of 1-based page numbers to extract

    Returns:
        PDF bytes containing only the selected pages

    Raises:
        PDFValidationError: If the input file is not valid
        PDFProcessingError: If an error occurs during extraction
        ValueError: If page_numbers is empty or contains invalid values
    """
    if not page_numbers:
        raise ValueError("Debe seleccionar al menos una pagina")

    is_valid, message = validate_pdf_file(input_path)
    if not is_valid:
        raise PDFValidationError(message)

    try:
        reader = PdfReader(input_path)
        total_pages = len(reader.pages)

        normalized_pages: list[int] = []
        for idx, page in enumerate(page_numbers, start=1):
            if isinstance(page, bool) or not isinstance(page, int):
                raise ValueError(f"Valor de pagina invalido en posicion {idx}: {page}")
            if page < 1 or page > total_pages:
                raise ValueError(
                    f"Pagina {page} fuera de rango (1-{total_pages})"
                )
            normalized_pages.append(page)

        writer = PdfWriter()
        for page in sorted(normalized_pages):
            writer.add_page(reader.pages[page - 1])

        buffer = BytesIO()
        writer.write(buffer)
        buffer.seek(0)

        logger.info(
            f"Extracted {len(page_numbers)} pages from {input_path}"
        )
        return buffer.read()

    except (PDFValidationError, ValueError):
        raise
    except Exception as e:
        raise PDFProcessingError(f"Error extrayendo paginas: {e}")
