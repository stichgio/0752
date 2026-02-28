"""
PDF Organizer - Reorganiza, rota y divide páginas de un PDF.

Este módulo proporciona funcionalidades para reorganizar las páginas
de un PDF, aplicar rotaciones individuales, y opcionalmente dividir
el resultado en múltiples segmentos según puntos de corte.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter  # type: ignore

from .utils import (  # type: ignore
    PDFProcessingError,
    PDFValidationError,
    ensure_directory,
    validate_pdf_file,
)

logger = logging.getLogger(__name__)


def organize_pdf(
    input_path: str,
    output_path: str,
    page_order: list[int],
    rotations: list[int],
    cuts: list[int] | None = None,
) -> dict[str, Any]:
    """
    Reorganiza páginas de un PDF: reordena, rota, y opcionalmente divide en segmentos.

    Args:
        input_path: Ruta al archivo PDF de entrada.
        output_path: Ruta del archivo PDF de salida (modo organize)
                     o directorio base para segmentos (modo organize-split).
        page_order: Lista de números de página 1-indexed en el orden deseado.
                    Ejemplo: [3, 1, 2] coloca la página 3 primero, luego 1, luego 2.
        rotations: Lista de grados de rotación por página (misma longitud que page_order).
                   Valores válidos: 0, 90, 180, 270.
        cuts: Lista de índices de corte 0-indexed sobre el array resultado.
              Si se proporciona, divide el PDF organizado en segmentos.
              Ejemplo: [1] con 3 páginas produce [pág0-pág1] y [pág2].

    Returns:
        Diccionario con metadata de la operación:
        - Sin cuts: {"total_pages": int, "status": str, "output_path": str}
        - Con cuts: {"total_pages": int, "status": str, "output_paths": list[str]}

    Raises:
        PDFValidationError: Si el archivo de entrada no es válido
        PDFProcessingError: Si ocurre un error durante el procesamiento
    """
    # === VALIDACIONES ===

    is_valid, message = validate_pdf_file(input_path)
    if not is_valid:
        raise PDFValidationError(message)

    if len(page_order) != len(rotations):
        raise PDFValidationError(
            f"page_order ({len(page_order)}) y rotations ({len(rotations)}) "
            f"deben tener la misma longitud"
        )

    logger.info(f"Iniciando organización de: {input_path}")
    logger.info(f"  → Orden de páginas: {page_order}")
    logger.info(f"  → Rotaciones: {rotations}")

    reader = PdfReader(input_path)
    total_source_pages = len(reader.pages)

    # Validar que los índices de página estén en rango
    for idx, page_num in enumerate(page_order):
        if page_num < 1 or page_num > total_source_pages:
            raise PDFValidationError(
                f"Página {page_num} fuera de rango (el PDF tiene {total_source_pages} páginas)"
            )

    # === CONSTRUIR PDF ORGANIZADO ===

    try:
        writer = PdfWriter()

        for i, page_num in enumerate(page_order):
            page = reader.pages[page_num - 1]

            if rotations[i] != 0:
                page.rotate(rotations[i])
                logger.debug(f"  Página {page_num}: rotada {rotations[i]}°")

            writer.add_page(page)

        total_pages = len(writer.pages)
        logger.info(f"  → Total páginas organizadas: {total_pages}")

        # === GUARDAR RESULTADO ===

        if not cuts:
            # Modo organize: guardar un solo PDF
            ensure_directory(str(Path(output_path).parent))

            with open(output_path, "wb") as f:
                writer.write(f)

            output_abs_path = str(Path(output_path).absolute())
            logger.info(f"✓ Organización completada: {output_abs_path}")

            return {
                "total_pages": total_pages,
                "status": "success",
                "output_path": output_abs_path,
            }
        else:
            # Modo organize-split: dividir en segmentos según los cortes
            ensure_directory(output_path)

            # Construir los rangos de segmentos a partir de los cortes
            # cuts son 0-indexed sobre el array resultado
            # Ejemplo: pages=[A,B,C,D], cuts=[1,3] → segmentos: [A,B], [C,D], []
            split_points = sorted(cuts[:])  # type: ignore
            segments: list[tuple[int, int]] = []
            prev = 0
            for cut in split_points:
                if cut > prev:
                    segments.append((prev, cut))
                prev = cut
            if prev < total_pages:
                segments.append((prev, total_pages))

            output_paths: list[str] = []

            for seg_idx, (start, end) in enumerate(segments, 1):
                seg_writer = PdfWriter()

                for page_idx in range(start, end):
                    seg_writer.add_page(writer.pages[page_idx])

                seg_filename = f"segment_{seg_idx:02d}.pdf"
                seg_path = os.path.join(output_path, seg_filename)

                with open(seg_path, "wb") as f:
                    seg_writer.write(f)

                output_paths.append(str(Path(seg_path).absolute()))
                logger.info(
                    f"  ✓ {seg_filename}: páginas {int(start) + 1}-{end} "
                    f"({int(end) - int(start)} páginas)"
                )

            logger.info(f"✓ Organización con split completada: {len(output_paths)} segmentos")

            return {
                "total_pages": total_pages,
                "status": "success",
                "output_paths": output_paths,
            }

    except (PDFValidationError, PDFProcessingError):
        raise
    except Exception as e:
        raise PDFProcessingError(f"Error durante la organización: {e}")
