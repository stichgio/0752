"""
Configuracion centralizada del backend
"""

import os
from pathlib import Path

# Rutas base
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

# Asegurar que existan los directorios necesarios
DATA_DIR.mkdir(exist_ok=True)

# Configuracion de Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_KEY", ""))
