"""
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


def merge_pdfs_interleaved(
    input_paths: list[str],
    output_path: str,
    strict: bool = False
) -> dict[str, Any]:
    """
    Combina múltiples PDFs intercalando páginas por índice.
    
    Esta función toma N archivos PDF y genera un único PDF donde
    las páginas se intercalan por número de página. Es ideal para
    combinar documentos que deben leerse en paralelo (ej: reportes
    trimestrales, versiones de un documento).
    
    Args:
        input_paths: Lista de rutas a los PDFs de entrada.
                    Mínimo 2 archivos requeridos.
        output_path: Ruta donde guardar el PDF resultante.
                    El directorio se creará si no existe.
        strict: Si True, requiere que todos los PDFs tengan igual
                número de páginas (lanza error si difieren).
                Si False, permite longitudes variables:
                - Intercala hasta el PDF más corto
                - Añade páginas restantes al final
                - Registra warnings informativos
    
    Returns:
        Diccionario con metadata de la operación:
        {
            'total_pages': int - Total de páginas en el PDF output
            'source_files': int - Cantidad de archivos procesados
            'status': str - 'success' o 'partial'
            'warnings': list[str] - Lista de advertencias
            'output_path': str - Ruta absoluta del archivo generado
            'pages_per_source': list[int] - Páginas de cada archivo fuente
        }
    
    Raises:
        PDFValidationError: Si algún archivo de entrada no es válido
        PDFProcessingError: Si ocurre un error durante el merge
        ValueError: Si input_paths tiene menos de 2 elementos
    
    Example:
        >>> resultado = merge_pdfs_interleaved(
        ...     input_paths=["q1.pdf", "q2.pdf", "q3.pdf"],
        ...     output_path="output/consolidado.pdf",
        ...     strict=True
        ... )
        >>> print(f"Generado: {resultado['total_pages']} páginas")
        Generado: 30 páginas
    """
    warnings: list[str] = []
    
    # === VALIDACIONES INICIALES ===
    
    # Verificar cantidad mínima de archivos
    if len(input_paths) < 2:
        raise ValueError(
            f"Se requieren al menos 2 archivos PDF. Recibidos: {len(input_paths)}"
        )
    
    logger.info(f"Iniciando merge intercalado de {len(input_paths)} archivos")
    
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
            logger.info(
                f"  → Se intercalarán las primeras {min_pages} páginas, "
                f"luego se añadirán las restantes"
            )
    
    # === REALIZAR MERGE INTERCALADO ===
    
    writer = PdfWriter()
    total_pages_added = 0
    
    try:
        # Fase 1: Intercalar páginas (hasta min_pages)
        logger.info(f"Fase 1: Intercalando {min_pages} páginas de cada archivo...")
        
        for page_idx in range(min_pages):
            for file_idx, reader in enumerate(readers):
                page = reader.pages[page_idx]
                writer.add_page(page)
                total_pages_added += 1  # type: ignore
                
                # Log de progreso cada 10 páginas
                if total_pages_added % 10 == 0:
                    logger.debug(f"  Procesadas {total_pages_added} páginas...")
        
        logger.info(
            f"  ✓ Intercalado completado: "
            f"{min_pages} × {len(readers)} = {min_pages * len(readers)} páginas"
        )
        
        # Fase 2: Añadir páginas restantes (si strict=False y hay diferencias)
        if not strict and max_pages > min_pages:
            logger.info("Fase 2: Añadiendo páginas restantes...")
            
            extra_pages = 0
            for file_idx, reader in enumerate(readers):
                remaining = page_counts[file_idx] - min_pages  # type: ignore
                
                if remaining > 0:
                    file_name = Path(input_paths[file_idx]).name
                    logger.info(
                        f"  + {file_name}: añadiendo {remaining} páginas extra"
                    )
                    warnings.append(
                        f"{file_name}: {remaining} páginas añadidas al final"
                    )
                    
                    for page_idx in range(min_pages, page_counts[file_idx]):  # type: ignore
                        writer.add_page(reader.pages[page_idx])
                        total_pages_added += 1  # type: ignore
                        extra_pages += 1  # type: ignore
            
            logger.info(f"  ✓ Páginas extra añadidas: {extra_pages}")
        
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
