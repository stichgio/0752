"""
Configuracion centralizada del backend usando pydantic-settings.
Todos los modulos del backend deben importar desde aqui:

    from config import settings
"""

from pathlib import Path
from typing import List

from pydantic import AliasChoices, Field  
from pydantic_settings import BaseSettings  


class Settings(BaseSettings):
    # ── Environment ───────────────────────────────────────────────────────────
    environment: str = Field(
        default="production",
        validation_alias=AliasChoices("ENVIRONMENT", "APP_ENV"),
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_raw_origins: str = Field(
        default="",
        validation_alias=AliasChoices("CORS_ALLOWED_ORIGINS", "CORS_ORIGINS"),
    )

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str = Field(default="")
    supabase_service_role_key: str = Field(default="")
    supabase_key: str = Field(default="")          # legacy alias for service_role_key

    # ── Template Editor ───────────────────────────────────────────────────────
    template_storage_bucket: str = Field(default="template-assets")
    feature_template_editor: bool = Field(default=False)

    # ── GTK Runtime (Windows / WeasyPrint) ────────────────────────────────────
    gtk_runtime_bin: str = Field(default="")

    # ── Ghostscript post-compression ──────────────────────────────────────────
    ghostscript_enabled: bool = Field(default=True)
    ghostscript_quality: str = Field(default="printer")


    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
        "populate_by_name": True,
    }

    # ── Computed properties ───────────────────────────────────────────────────

    @property
    def is_development(self) -> bool:
        return self.environment.strip().lower() in {"dev", "development", "local"}

    @property
    def effective_supabase_key(self) -> str:
        """Resolves SUPABASE_SERVICE_ROLE_KEY with fallback to legacy SUPABASE_KEY."""
        return self.supabase_service_role_key or self.supabase_key

    @property
    def effective_cors_origins(self) -> List[str]:
        raw = self.cors_raw_origins.strip()
        if raw:
            origins = [o.strip() for o in raw.split(",") if o.strip()]
            if "*" in origins:
                if self.is_development:
                    return ["*"]
                filtered = [o for o in origins if o != "*"]
                print("[CORS] Ignoring wildcard origin outside development environment")
                return filtered
            return origins
        if self.is_development:
            return ["*"]
        print("[CORS] CORS_ALLOWED_ORIGINS/CORS_ORIGINS is not configured; no cross-origin requests will be allowed")
        return []


# ── Module-level paths ─────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# ── Singleton settings object ──────────────────────────────────────────────────
settings = Settings()

# ── Backward-compat aliases ────────────────────────────────────────────────────
# Allow legacy `from config import SUPABASE_URL, SUPABASE_KEY` imports to work.
SUPABASE_URL = settings.supabase_url
SUPABASE_KEY = settings.effective_supabase_key
