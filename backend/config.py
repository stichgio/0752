"""
# -*- coding: utf-8 -*-
Configuracion centralizada del backend usando pydantic-settings.
Todos los modulos del backend deben importar desde aqui:

    from config import settings
"""

from pathlib import Path
from typing import List

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolver .env desde la raíz del repo y desde backend/ (uvicorn suele usar CWD=backend/)
_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent
_ENV_FILES = (
    str(_REPO_ROOT / ".env"),
    str(_BACKEND_DIR / ".env"),
)


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

    # ── Pexels integration ────────────────────────────────────────────────────
    pexels_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("PEXELS_API_KEY", "pexels_api_key"),
    )
    # Si true, el proxy acepta X-Pexels-Api-Key del cliente cuando no hay key en servidor.
    # En desarrollo (ENVIRONMENT=dev/local/…) también se acepta sin esta variable.
    pexels_allow_client_key: bool = Field(
        default=False,
        validation_alias=AliasChoices("PEXELS_ALLOW_CLIENT_KEY", "pexels_allow_client_key"),
    )

    # ── GTK Runtime (Windows / WeasyPrint) ────────────────────────────────────
    gtk_runtime_bin: str = Field(default="")

    # ── Ghostscript post-compression ──────────────────────────────────────────
    ghostscript_enabled: bool = Field(default=True)
    ghostscript_quality: str = Field(default="printer")


    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # ── Computed properties ───────────────────────────────────────────────────

    @property
    def is_development(self) -> bool:
        return self.environment.strip().lower() in {"dev", "development", "local"}

    @property
    def effective_supabase_key(self) -> str:
        """Resolves SUPABASE_SERVICE_ROLE_KEY with fallback to legacy SUPABASE_KEY."""
        return self.supabase_service_role_key or self.supabase_key

    @property
    def pexels_accepts_client_key(self) -> bool:
        """Permite enviar la API key desde el navegador (localStorage) al proxy."""
        return self.pexels_allow_client_key or self.is_development

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


# ── Singleton settings object ──────────────────────────────────────────────────
settings = Settings()
