"""
PDF Splitter - Divide archivos PDF en múltiples partes.

Este módulo proporciona funcionalidades para dividir un archivo PDF
en múltiples archivos más pequeños, ya sea por cantidad de páginas
o por rangos específicos.
"""
from __future__ import annotations

import logging
from pathlib import Path

from pypdf import PdfReader, PdfWriter  

from .utils import (  
    PDFProcessingError,
    PDFValidationError,
    ensure_directory,
    generate_output_filename,
    validate_pdf_file,
)

logger = logging.getLogger(__name__)


def split_pdf(
    input_path: str,
    output_dir: str,
    pages_per_file: int = 1
) -> list[str]:
    """
    Divide un PDF en múltiples archivos.
    
    Toma un archivo PDF y lo divide en varios archivos más pequeños,
    cada uno conteniendo la cantidad especificada de páginas.
    
    Args:
        input_path: Ruta al archivo PDF a dividir
        output_dir: Directorio donde guardar los archivos generados.
                   Se creará si no existe.
        pages_per_file: Cantidad de páginas por archivo de salida.
                       Default: 1 (cada página en archivo separado)
    
    Returns:
        Lista de rutas absolutas a los archivos generados
    
    Raises:
        PDFValidationError: Si el archivo de entrada no es válido
        PDFProcessingError: Si ocurre un error durante el split
        ValueError: Si pages_per_file es menor a 1
    
    Example:
        >>> archivos = split_pdf(
        ...     input_path="manual.pdf",
        ...     output_dir="output/paginas/",
        ...     pages_per_file=5
        ... )
        >>> print(f"Generados: {len(archivos)} archivos")
        Generados: 10 archivos
    """
    # === VALIDACIONES ===
    
    if pages_per_file < 1:
        raise ValueError("pages_per_file debe ser al menos 1")
    
    is_valid, message = validate_pdf_file(input_path)
    if not is_valid:
        raise PDFValidationError(message)
    
    logger.info(f"Iniciando split de: {input_path}")
    logger.info(f"  → Páginas por archivo: {pages_per_file}")
    
    # Preparar
    reader = PdfReader(input_path)
    total_pages = len(reader.pages)
    base_name = Path(input_path).stem
    
    # Calcular cantidad de archivos
    num_files = (total_pages + pages_per_file - 1) // pages_per_file
    
    logger.info(f"  → Total páginas: {total_pages}")
    logger.info(f"  → Archivos a generar: {num_files}")
    
    # Crear directorio de salida
    output_path = ensure_directory(output_dir)
    
    # === REALIZAR SPLIT ===
    
    output_files: list[str] = []
    
    try:
        for file_idx in range(num_files):
            writer = PdfWriter()
            
            # Calcular rango de páginas para este archivo
            start_page = file_idx * pages_per_file
            end_page = min(start_page + pages_per_file, total_pages)
            
            # Añadir páginas
            for page_idx in range(start_page, end_page):
                writer.add_page(reader.pages[page_idx])
            
            # Generar nombre de archivo
            filename = generate_output_filename(
                base_name=base_name,
                index=file_idx + 1,
                total=num_files
            )
            
            file_path = output_path / filename
            
            # Guardar
            with open(file_path, "wb") as f:
                writer.write(f)
            
            output_files.append(str(file_path.absolute()))
            
            pages_in_file = end_page - start_page
            logger.debug(
                f"  ✓ {filename}: páginas {start_page + 1}-{end_page} "
                f"({pages_in_file} páginas)"
            )
        
        logger.info(f"✓ Split completado! Generados {len(output_files)} archivos")
        
        return output_files
        
    except Exception as e:
        raise PDFProcessingError(f"Error durante split: {e}")


def split_pdf_by_ranges(
    input_path: str,
    output_dir: str,
    ranges: list[tuple[int, int]]
) -> list[str]:
    """
    Divide un PDF por rangos de páginas específicos.
    
    Permite extraer secciones específicas de un PDF definiendo
    rangos de páginas personalizados.
    
    Args:
        input_path: Ruta al archivo PDF a dividir
        output_dir: Directorio donde guardar los archivos generados
        ranges: Lista de tuplas (inicio, fin) definiendo los rangos.
               Los índices son 1-based e inclusivos.
               Ejemplo: [(1, 5), (10, 15)] extrae páginas 1-5 y 10-15
    
    Returns:
        Lista de rutas absolutas a los archivos generados
    
    Raises:
        PDFValidationError: Si el archivo de entrada no es válido
        PDFProcessingError: Si ocurre un error durante el split
        ValueError: Si algún rango es inválido
    
    Example:
        >>> archivos = split_pdf_by_ranges(
        ...     input_path="libro.pdf",
        ...     output_dir="output/capitulos/",
        ...     ranges=[(1, 20), (21, 50), (51, 100)]
        ... )
    """
    # === VALIDACIONES ===
    
    is_valid, message = validate_pdf_file(input_path)
    if not is_valid:
        raise PDFValidationError(message)
    
    if not ranges:
        raise ValueError("Debe proporcionar al menos un rango")
    
    reader = PdfReader(input_path)
    total_pages = len(reader.pages)
    
    # Validar rangos
    for idx, (start, end) in enumerate(ranges, 1):
        if start < 1:
            raise ValueError(f"Rango {idx}: inicio debe ser >= 1")
        if end > total_pages:
            raise ValueError(
                f"Rango {idx}: fin ({end}) excede total de páginas ({total_pages})"
            )
        if start > end:
            raise ValueError(
                f"Rango {idx}: inicio ({start}) mayor que fin ({end})"
            )
    
    logger.info(f"Dividiendo {input_path} en {len(ranges)} secciones")
    
    # Preparar
    base_name = Path(input_path).stem
    output_path = ensure_directory(output_dir)
    output_files: list[str] = []
    
    # === REALIZAR SPLIT ===
    
    try:
        for file_idx, (start, end) in enumerate(ranges, 1):
            writer = PdfWriter()
            
            # Añadir páginas (convertir de 1-based a 0-based)
            for page_idx in range(start - 1, end):
                writer.add_page(reader.pages[page_idx])
            
            # Generar nombre
            filename = f"{base_name}_part{file_idx}_{start}-{end}.pdf"
            file_path = output_path / filename
            
            with open(file_path, "wb") as f:
                writer.write(f)
            
            output_files.append(str(file_path.absolute()))
            logger.info(f"  ✓ {filename}: páginas {start}-{end}")
        
        logger.info(f"✓ Split por rangos completado!")
        
        return output_files
        
    except Exception as e:
        raise PDFProcessingError(f"Error durante split: {e}")
