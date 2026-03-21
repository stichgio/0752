"""
# -*- coding: utf-8 -*-
PDF Merger - Combina múltiples PDFs con estrategia intercalada.

Este módulo proporciona funcionalidades para combinar archivos PDF
usando una estrategia de merge intercalado (collated/interleaved),
donde las páginas se combinan por número de página.

Ejemplo:
    3 PDFs de 10 páginas cada uno generarán un PDF de 30 páginas:
    [P1-PDF1, P1-PDF2, P1-PDF3, P2-PDF1, P2-PDF2, P2-PDF3, ...]
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter

from .utils import (
    PDFProcessingError,
    PDFValidationError,
    ensure_directory,
    validate_pdf_file,
)

logger = logging.getLogger(__name__)

MAX_INTERLEAVE_CHUNK = 1000


def _normalize_chunk_sizes(n_files: int, chunk_sizes: list[int] | None) -> list[int]:
    if chunk_sizes is None:
        return [1] * n_files
    if len(chunk_sizes) != n_files:
        raise ValueError(
            f"chunk_sizes debe tener {n_files} elementos (uno por PDF), recibido: {len(chunk_sizes)}"
        )
    out: list[int] = []
    for i, c in enumerate(chunk_sizes):
        if type(c) is not int or isinstance(c, bool):
            raise ValueError(
                f"chunk_sizes[{i}] debe ser un entero, recibido: {type(c).__name__}"
            )
        if c < 1:
            raise ValueError(f"chunk_sizes[{i}] debe ser >= 1, recibido: {c}")
        if c > MAX_INTERLEAVE_CHUNK:
            raise ValueError(
                f"chunk_sizes[{i}] no puede superar {MAX_INTERLEAVE_CHUNK}"
            )
        out.append(c)
    return out


def merge_pdfs_interleaved(
    input_paths: list[str],
    output_path: str,
    strict: bool = False,
    chunk_sizes: list[int] | None = None,
) -> dict[str, Any]:
    """
    Combina múltiples PDFs intercalando páginas por bloques.

    En cada vuelta se recorren los PDFs en orden; de cada uno se toman
    hasta chunk_sizes[i] páginas consecutivas. Con chunk_sizes=[1,...,1]
    (default) reproduce el intercalado clásico 1:1:1.

    Args:
        input_paths: Lista de rutas a los PDFs de entrada (mínimo 2).
        output_path: Ruta donde guardar el PDF resultante.
        strict: Si True, exige igual número de páginas en todos los PDFs.
        chunk_sizes: Opcional. Lista de enteros >= 1, uno por PDF.
                     None equivale a [1, 1, ...] (intercalado clásico).

    Returns:
        Diccionario con metadata: total_pages, source_files, status,
        warnings, output_path, pages_per_source.

    Raises:
        PDFValidationError: Archivo inválido o strict con longitudes distintas.
        PDFProcessingError: Error durante el merge.
        ValueError: Menos de 2 archivos o chunk_sizes inválido.
    """
    warnings: list[str] = []

    if len(input_paths) < 2:
        raise ValueError(
            f"Se requieren al menos 2 archivos PDF. Recibidos: {len(input_paths)}"
        )

    sizes = _normalize_chunk_sizes(len(input_paths), chunk_sizes)

    logger.info(
        "Iniciando merge intercalado de %d archivos (bloques por turno: %s)",
        len(input_paths),
        sizes,
    )
    
    # Validar todos los archivos de entrada
    readers: list[PdfReader] = []
    page_counts: list[int] = []
    
    for idx, path in enumerate(input_paths, 1):
        logger.debug(f"Validando archivo {idx}/{len(input_paths)}: {path}")
        
        is_valid, message = validate_pdf_file(path)
        if not is_valid:
            raise PDFValidationError(f"Archivo {idx} inválido: {message}")
        
        try:
            reader = PdfReader(path)
            num_pages = len(reader.pages)
            
            if num_pages == 0:
                raise PDFValidationError(
                    f"El archivo {path} no contiene páginas"
                )
            
            readers.append(reader)
            page_counts.append(num_pages)
            logger.info(f"  ✓ {Path(path).name}: {num_pages} páginas")
            
        except (PDFValidationError, PDFProcessingError):
            raise
        except Exception as e:
            raise PDFProcessingError(f"Error al procesar {path}: {e}")
    
    # === VERIFICAR LONGITUDES ===
    
    min_pages = min(page_counts)
    max_pages = max(page_counts)
    
    if min_pages != max_pages:
        diff_message = (
            f"Los PDFs tienen diferente número de páginas: "
            f"mín={min_pages}, máx={max_pages}"
        )
        
        if strict:
            raise PDFValidationError(
                f"Modo estricto activado. {diff_message}. "
                f"Use strict=False para permitir longitudes variables."
            )
        else:
            warnings.append(diff_message)
            logger.warning(f"⚠️ {diff_message}")
            logger.info("  → Se intercalará por bloques hasta agotar cada archivo")

    # === REALIZAR MERGE INTERCALADO POR BLOQUES ===

    writer = PdfWriter()
    total_pages_added = 0
    pos = [0] * len(readers)

    try:
        logger.info("Intercalando por turnos con bloques %s...", sizes)

        while True:
            added_this_round = 0
            for file_idx, reader in enumerate(readers):
                if pos[file_idx] >= page_counts[file_idx]:
                    continue
                take = min(sizes[file_idx], page_counts[file_idx] - pos[file_idx])
                for p in range(pos[file_idx], pos[file_idx] + take):
                    writer.add_page(reader.pages[p])
                    total_pages_added += 1
                    added_this_round += 1
                    if total_pages_added % 10 == 0:
                        logger.debug("  Procesadas %d páginas...", total_pages_added)
                pos[file_idx] += take

            if added_this_round == 0:
                break

        logger.info(
            "  ✓ Intercalado completado: %d páginas en el resultado",
            total_pages_added,
        )
        
        # === GUARDAR ARCHIVO ===
        
        # Asegurar que el directorio de salida exista
        output_dir = Path(output_path).parent
        ensure_directory(str(output_dir))
        
        logger.info(f"Guardando PDF en: {output_path}")
        
        with open(output_path, "wb") as output_file:
            writer.write(output_file)
        
        output_abs_path = str(Path(output_path).absolute())
        
        logger.info(f"✓ Merge completado exitosamente!")
        logger.info(f"  → Archivo: {output_abs_path}")
        logger.info(f"  → Total páginas: {total_pages_added}")
        
        return {
            "total_pages": total_pages_added,
            "source_files": len(input_paths),
            "status": "success" if not warnings else "partial",
            "warnings": warnings,
            "output_path": output_abs_path,
            "pages_per_source": page_counts,
        }
        
    except Exception as e:
        raise PDFProcessingError(f"Error durante el merge: {e}")


def merge_pdfs_sequential(
    input_paths: list[str],
    output_path: str
) -> dict[str, Any]:
    """
    Combina PDFs de forma secuencial (tradicional).
    
    A diferencia del merge intercalado, este método simplemente
    concatena los PDFs uno después del otro en el orden dado.
    
    Args:
        input_paths: Lista de rutas a los PDFs de entrada
        output_path: Ruta donde guardar el PDF resultante
    
    Returns:
        Diccionario con metadata similar a merge_pdfs_interleaved
    
    Example:
        >>> merge_pdfs_sequential(["a.pdf", "b.pdf"], "out.pdf")
        # Resultado: todas las páginas de a.pdf, seguidas de b.pdf
    """
    if len(input_paths) < 2:
        raise ValueError("Se requieren al menos 2 archivos PDF")
    
    logger.info(f"Iniciando merge secuencial de {len(input_paths)} archivos")
    
    writer = PdfWriter()
    page_counts: list[int] = []
    
    for idx, path in enumerate(input_paths, 1):
        is_valid, message = validate_pdf_file(path)
        if not is_valid:
            raise PDFValidationError(f"Archivo {idx} inválido: {message}")
        
        reader = PdfReader(path)
        num_pages = len(reader.pages)
        page_counts.append(num_pages)
        
        for page in reader.pages:
            writer.add_page(page)
        
        logger.info(f"  ✓ Añadido {Path(path).name}: {num_pages} páginas")
    
    # Guardar
    ensure_directory(str(Path(output_path).parent))
    
    with open(output_path, "wb") as f:
        writer.write(f)
    
    total_pages = sum(page_counts)
    
    return {
        "total_pages": total_pages,
        "source_files": len(input_paths),
        "status": "success",
        "warnings": [],
        "output_path": str(Path(output_path).absolute()),
        "pages_per_source": page_counts,
    }
