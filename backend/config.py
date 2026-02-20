"""
Configuración centralizada del backend
"""

import os
from pathlib import Path

# Rutas base
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"

# Asegurar que existan los directorios necesarios
DATA_DIR.mkdir(exist_ok=True)

# Configuración del servidor
SERVER_HOST = os.getenv("HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("PORT", "7860"))

# Configuración de Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_KEY", ""))

# Configuración de CORS
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
CORS_ALLOW_CREDENTIALS = os.getenv("CORS_CREDENTIALS", "false").lower() == "true"

# Configuración de PDF
class PDFConfig:
    """Configuración para generación de PDFs"""
    A4_WIDTH_MM = 210
    A4_HEIGHT_MM = 297
    TARGET_DPI = 150
    JPEG_QUALITY = 90
    MAX_CONCURRENT = 5
    MAX_PDF_WORKERS = 4
    PIPELINE_BUFFER_SIZE = 8
    GC_INTERVAL = 10
    PDF_BATCH_SIZE = 5
    HTML_PREFETCH_SIZE = 10
    GHOSTSCRIPT_ENABLED = True
    GHOSTSCRIPT_QUALITY = "printer"

    @classmethod
    def get_max_image_size(cls):
        return (
            int((cls.A4_WIDTH_MM / 25.4) * cls.TARGET_DPI),
            int((cls.A4_HEIGHT_MM / 25.4) * cls.TARGET_DPI)
        )

# Configuración de base de datos JSON
class DatabaseConfig:
    """Rutas de archivos de base de datos JSON"""
    FICHAS_TECNICAS_FILE = DATA_DIR / "fichas_tecnicas.json"
    TECHNICAL_REPORTS_FILE = DATA_DIR / "technical_reports.json"

# GTK3 configuration for Windows (WeasyPrint)
def configure_gtk3_windows():
    """Configura GTK3 en Windows para WeasyPrint"""
    if os.name == 'nt':
        gtk_path = r"C:\Program Files\GTK3-Runtime Win64\bin"
        if os.path.isdir(gtk_path):
            os.environ['PATH'] = gtk_path + os.pathsep + os.environ.get('PATH', '')
            if hasattr(os, 'add_dll_directory'):
                try:
                    os.add_dll_directory(gtk_path)
                except Exception:
                    pass
