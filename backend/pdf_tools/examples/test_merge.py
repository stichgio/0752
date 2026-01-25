#!/usr/bin/env python3
"""
Ejemplos de uso del sistema PDF Tools.

Este script demuestra las funcionalidades principales:
- Merge intercalado de PDFs
- Merge secuencial
- Split de PDFs

Para ejecutar:
    python -m pdf_tools.examples.test_merge
    
O directamente:
    python test_merge.py
"""

import logging
import sys
from pathlib import Path

# Añadir directorio padre al path para imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pdf_tools import merge_pdfs_interleaved
from pdf_tools.pdf_merger import merge_pdfs_sequential
from pdf_tools.pdf_splitter import split_pdf, extract_pages
from pdf_tools.utils import setup_logging, get_pdf_info

# Configurar logging para ver la salida
setup_logging(level=logging.INFO)


def ejemplo_merge_intercalado_estricto():
    """
    Ejemplo 1: Merge intercalado en modo estricto.
    
    Requiere que todos los PDFs tengan la misma cantidad de páginas.
    """
    print("\n" + "="*60)
    print("EJEMPLO 1: Merge Intercalado (Modo Estricto)")
    print("="*60)
    
    # Archivos de ejemplo (reemplazar con rutas reales)
    input_files = [
        "documentos/reporte_Q1.pdf",
        "documentos/reporte_Q2.pdf",
        "documentos/reporte_Q3.pdf",
    ]
    
    try:
        resultado = merge_pdfs_interleaved(
            input_paths=input_files,
            output_path="output/reporte_consolidado.pdf",
            strict=True
        )
        
        print(f"\n✓ PDF generado exitosamente!")
        print(f"  → Archivo: {resultado['output_path']}")
        print(f"  → Total páginas: {resultado['total_pages']}")
        print(f"  → Archivos procesados: {resultado['source_files']}")
        print(f"  → Estado: {resultado['status']}")
        
    except FileNotFoundError:
        print("\n⚠️ Los archivos de ejemplo no existen.")
        print("   Modifica las rutas en input_files para probar.")
    except Exception as e:
        print(f"\n❌ Error: {e}")


def ejemplo_merge_intercalado_flexible():
    """
    Ejemplo 2: Merge intercalado en modo flexible.
    
    Permite PDFs con diferente número de páginas.
    Las páginas extra se añaden al final.
    """
    print("\n" + "="*60)
    print("EJEMPLO 2: Merge Intercalado (Modo Flexible)")
    print("="*60)
    
    input_files = [
        "doc1.pdf",           # 10 páginas
        "doc2_extra.pdf",     # 15 páginas (5 extra)
    ]
    
    try:
        resultado = merge_pdfs_interleaved(
            input_paths=input_files,
            output_path="output/consolidado_flexible.pdf",
            strict=False  # Permitir diferentes longitudes
        )
        
        print(f"\n✓ PDF generado!")
        print(f"  → Total páginas: {resultado['total_pages']}")
        
        if resultado['warnings']:
            print("\n⚠️ Advertencias:")
            for warning in resultado['warnings']:
                print(f"   - {warning}")
                
    except FileNotFoundError:
        print("\n⚠️ Los archivos de ejemplo no existen.")
    except Exception as e:
        print(f"\n❌ Error: {e}")


def ejemplo_merge_secuencial():
    """
    Ejemplo 3: Merge secuencial tradicional.
    
    Concatena PDFs uno después del otro.
    """
    print("\n" + "="*60)
    print("EJEMPLO 3: Merge Secuencial")
    print("="*60)
    
    input_files = ["portada.pdf", "contenido.pdf", "anexos.pdf"]
    
    try:
        resultado = merge_pdfs_sequential(
            input_paths=input_files,
            output_path="output/documento_completo.pdf"
        )
        
        print(f"\n✓ Merge secuencial completado!")
        print(f"  → Páginas por archivo: {resultado['pages_per_source']}")
        print(f"  → Total: {resultado['total_pages']} páginas")
        
    except FileNotFoundError:
        print("\n⚠️ Los archivos de ejemplo no existen.")
    except Exception as e:
        print(f"\n❌ Error: {e}")


def ejemplo_split():
    """
    Ejemplo 4: Dividir un PDF en archivos de N páginas.
    """
    print("\n" + "="*60)
    print("EJEMPLO 4: Split de PDF")
    print("="*60)
    
    try:
        archivos = split_pdf(
            input_path="manual_largo.pdf",
            output_dir="output/paginas/",
            pages_per_file=5  # 5 páginas por archivo
        )
        
        print(f"\n✓ Split completado!")
        print(f"  → Archivos generados: {len(archivos)}")
        for archivo in archivos[:3]:  # Mostrar primeros 3
            print(f"   - {Path(archivo).name}")
        if len(archivos) > 3:
            print(f"   ... y {len(archivos) - 3} más")
            
    except FileNotFoundError:
        print("\n⚠️ El archivo de ejemplo no existe.")
    except Exception as e:
        print(f"\n❌ Error: {e}")


def ejemplo_extraer_paginas():
    """
    Ejemplo 5: Extraer páginas específicas.
    """
    print("\n" + "="*60)
    print("EJEMPLO 5: Extraer Páginas Específicas")
    print("="*60)
    
    try:
        # Extraer solo la portada
        ruta = extract_pages(
            input_path="documento.pdf",
            output_path="output/portada.pdf",
            pages=[1]
        )
        print(f"✓ Portada extraída: {ruta}")
        
        # Extraer selección de páginas
        ruta = extract_pages(
            input_path="documento.pdf",
            output_path="output/seleccion.pdf",
            pages=[1, 3, 5, 7, 9]  # Solo páginas impares
        )
        print(f"✓ Selección extraída: {ruta}")
        
    except FileNotFoundError:
        print("\n⚠️ El archivo de ejemplo no existe.")
    except Exception as e:
        print(f"\n❌ Error: {e}")


def ejemplo_info_pdf():
    """
    Ejemplo 6: Obtener información de un PDF.
    """
    print("\n" + "="*60)
    print("EJEMPLO 6: Información de PDF")
    print("="*60)
    
    try:
        info = get_pdf_info("documento.pdf")
        
        print(f"\nInformación del archivo:")
        print(f"  → Nombre: {info['filename']}")
        print(f"  → Páginas: {info['num_pages']}")
        print(f"  → Tamaño: {info['file_size_mb']} MB")
        print(f"  → Encriptado: {'Sí' if info['is_encrypted'] else 'No'}")
        
        if info['metadata']:
            print(f"\nMetadata:")
            for key, value in info['metadata'].items():
                print(f"  → {key}: {value}")
                
    except FileNotFoundError:
        print("\n⚠️ El archivo de ejemplo no existe.")
    except Exception as e:
        print(f"\n❌ Error: {e}")


def demo_interactiva():
    """
    Demo interactiva para probar con archivos reales.
    """
    print("\n" + "="*60)
    print("DEMO INTERACTIVA")
    print("="*60)
    
    print("\nEste es un demo que puedes modificar para probar con tus PDFs.")
    print("Edita las rutas de archivos en las funciones de ejemplo.")
    print("\nFunciones disponibles:")
    print("  1. merge_pdfs_interleaved() - Merge intercalado")
    print("  2. merge_pdfs_sequential() - Merge secuencial")
    print("  3. split_pdf() - Dividir por páginas")
    print("  4. split_pdf_by_ranges() - Dividir por rangos")
    print("  5. extract_pages() - Extraer páginas específicas")
    print("  6. get_pdf_info() - Información del PDF")


if __name__ == "__main__":
    print("\n" + "="*60)
    print("   PDF TOOLS - EJEMPLOS DE USO")
    print("="*60)
    
    # Ejecutar demo informativa
    demo_interactiva()
    
    # Descomentar las siguientes líneas para ejecutar ejemplos
    # (asegúrate de tener los archivos PDF correspondientes)
    
    # ejemplo_merge_intercalado_estricto()
    # ejemplo_merge_intercalado_flexible()
    # ejemplo_merge_secuencial()
    # ejemplo_split()
    # ejemplo_extraer_paginas()
    # ejemplo_info_pdf()
    
    print("\n" + "="*60)
    print("Revisa y modifica el código para probar con tus archivos.")
    print("="*60 + "\n")
