# PDF Tools 📄

Sistema robusto para manipulación de archivos PDF con soporte para merge intercalado y split.

## ✨ Características

- **Merge Intercalado (Collated)**: Combina PDFs intercalando páginas por índice
- **Merge Secuencial**: Concatenación tradicional de PDFs
- **Split por Páginas**: Divide un PDF en archivos de N páginas
- **Split por Rangos**: Extrae secciones específicas
- **Extracción de Páginas**: Obtiene páginas específicas
- **Validación Robusta**: Verifica archivos antes de procesar
- **Logging Detallado**: Seguimiento claro de operaciones

## 📦 Instalación

### Requisitos
- Python 3.10+
- pypdf >= 4.0.0

### Instalar dependencias

```bash
pip install pypdf>=4.0.0
```

O si usas el requirements.txt del backend:
```bash
pip install -r requirements.txt
```

## 🚀 Uso Rápido

### Merge Intercalado

Ideal para combinar reportes paralelos (ej: Q1, Q2, Q3 de diferentes años):

```python
from pdf_tools import merge_pdfs_interleaved

# 3 PDFs de 10 páginas cada uno → 1 PDF de 30 páginas intercaladas
resultado = merge_pdfs_interleaved(
    input_paths=[
        "reporte_Q1.pdf",
        "reporte_Q2.pdf", 
        "reporte_Q3.pdf"
    ],
    output_path="output/consolidado.pdf",
    strict=True  # Requiere misma cantidad de páginas
)

print(f"✓ Generado: {resultado['total_pages']} páginas")
```

**Resultado:**
- Página 1: P1 de Q1
- Página 2: P1 de Q2
- Página 3: P1 de Q3
- Página 4: P2 de Q1
- ... y así sucesivamente

### Modo Flexible (PDFs de diferente longitud)

```python
resultado = merge_pdfs_interleaved(
    input_paths=["doc_10_paginas.pdf", "doc_15_paginas.pdf"],
    output_path="output/flexible.pdf",
    strict=False  # Permite diferentes longitudes
)

if resultado['warnings']:
    print("⚠️ Advertencias:", resultado['warnings'])
```

### Split de PDF

```python
from pdf_tools import split_pdf

# Divide un PDF de 100 páginas en archivos de 10 páginas
archivos = split_pdf(
    input_path="manual.pdf",
    output_dir="output/partes/",
    pages_per_file=10
)

print(f"Generados: {len(archivos)} archivos")
# → manual_01.pdf, manual_02.pdf, ... manual_10.pdf
```

### Extraer Páginas Específicas

```python
from pdf_tools.pdf_splitter import extract_pages

# Extraer solo la portada
extract_pages("documento.pdf", "portada.pdf", pages=[1])

# Extraer páginas específicas
extract_pages("documento.pdf", "seleccion.pdf", pages=[1, 5, 10, 15])
```

### Información de PDF

```python
from pdf_tools import get_pdf_info

info = get_pdf_info("documento.pdf")
print(f"Páginas: {info['num_pages']}")
print(f"Tamaño: {info['file_size_mb']} MB")
```

## 📁 Estructura del Módulo

```
pdf_tools/
├── __init__.py          # Exports principales
├── pdf_merger.py        # Lógica de merge (intercalado y secuencial)
├── pdf_splitter.py      # Lógica de split y extracción
├── utils.py             # Validaciones y helpers
├── examples/
│   └── test_merge.py    # Ejemplos de uso
└── README.md            # Esta documentación
```

## 🔧 API Reference

### `merge_pdfs_interleaved()`

```python
def merge_pdfs_interleaved(
    input_paths: list[str],
    output_path: str,
    strict: bool = False
) -> dict[str, Any]
```

**Parámetros:**
- `input_paths`: Lista de rutas a PDFs (mínimo 2)
- `output_path`: Ruta de salida
- `strict`: Si `True`, error si las páginas difieren

**Retorna:**
```python
{
    'total_pages': int,
    'source_files': int,
    'status': 'success' | 'partial',
    'warnings': list[str],
    'output_path': str,
    'pages_per_source': list[int]
}
```

### `split_pdf()`

```python
def split_pdf(
    input_path: str,
    output_dir: str,
    pages_per_file: int = 1
) -> list[str]
```

**Retorna:** Lista de rutas a archivos generados

### `get_pdf_info()`

```python
def get_pdf_info(file_path: str) -> dict[str, Any]
```

**Retorna:**
```python
{
    'path': str,
    'filename': str,
    'num_pages': int,
    'file_size_mb': float,
    'metadata': dict,
    'is_encrypted': bool
}
```

## ⚠️ Manejo de Errores

El módulo define excepciones específicas:

```python
from pdf_tools.utils import PDFValidationError, PDFProcessingError

try:
    merge_pdfs_interleaved(...)
except PDFValidationError as e:
    print(f"Archivo inválido: {e}")
except PDFProcessingError as e:
    print(f"Error de procesamiento: {e}")
```

## 🧪 Testing

Ejecuta los ejemplos:

```bash
cd backend
python -m pdf_tools.examples.test_merge
```

## 📝 Notas

- Usa `pypdf` (versión moderna), NO PyPDF2 (deprecated)
- Compatible con Python 3.10+
- Cross-platform: Windows, Linux, macOS
- Los PDFs encriptados requieren contraseña (no soportado actualmente)

## 📄 Licencia

Parte del proyecto GIO.
