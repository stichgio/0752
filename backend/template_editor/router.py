# -*- coding: utf-8 -*-
import asyncio
import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from config import settings

from .render_service import compile_and_render_template_json, render_compiled_html
from .schemas import (
    CreateTemplatePayload,
    PreviewMatrixPayload,
    PreviewTemplateJsonPayload,
    PreviewTemplatePayload,
    PublishTemplatePayload,
    RollbackTemplatePayload,
    TemplatePreviewResponse,
    TemplateVersionResponse,
    TemplateVersionsResponse,
    UpdateTemplatePayload,
    UpdateTemplateResponse,
    ValidateTemplatePayload,
)
from .service import (
    create_template,
    delete_template,
    get_all_editor_templates,
    get_all_published_templates,
    get_preview_html,
    get_template,
    get_template_version,
    get_template_versions,
    get_variable_catalog,
    publish_template,
    rate_limiter,
    rollback_template,
    run_validations,
    update_template,
)
from .supabase_client import SupabaseNotConfiguredError, SupabaseOperationError

router = APIRouter(prefix="/api/template-editor", tags=["template-editor"])


def _feature_enabled() -> bool:
    raw = os.getenv("FEATURE_TEMPLATE_EDITOR")
    if raw is None:
        return settings.feature_template_editor
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _is_development_env() -> bool:
    raw = os.getenv("ENVIRONMENT") or os.getenv("APP_ENV")
    if raw is None:
        return settings.is_development
    return raw.strip().lower() in {"dev", "development", "local"}


def _ensure_feature_enabled() -> None:
    if not _feature_enabled():
        raise HTTPException(status_code=403, detail="Funcionalidad del editor de plantillas deshabilitada")


def _mutation_role() -> str:
    # Never trust a client-supplied role for write operations.
    return "admin" if _is_development_env() else "editor"


def _value_error_status(exc: ValueError) -> int:
    return 404 if "no encontrada" in str(exc).lower() else 400


def _is_duplicate_template_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "duplicate key" in message or "unique constraint" in message or "23505" in message


def _model_dump(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


@router.get("/variables/catalog")
async def variable_catalog(report_type: str):
    _ensure_feature_enabled()
    return {"reportType": report_type, "variables": get_variable_catalog(report_type)}


@router.get("/published")
async def list_published_templates():
    _ensure_feature_enabled()
    try:
        templates = get_all_published_templates()
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error listing published templates: {exc}")
        templates = []
    return {"templates": templates}


@router.get("/templates")
async def list_templates_endpoint():
    _ensure_feature_enabled()
    try:
        templates = get_all_editor_templates()
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error listing templates: {exc}")
        templates = []
    return {"templates": templates}


@router.post("/templates")
async def create_template_endpoint(payload: CreateTemplatePayload):
    _ensure_feature_enabled()
    report_type = payload.reportType or payload.templateJson.reportType
    try:
        created = create_template(payload.name, report_type, payload.templateJson, payload.author, feature_flag=payload.featureFlag)
    except ValueError as exc:
        raise HTTPException(status_code=_value_error_status(exc), detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error creating template: {exc}")
        raise HTTPException(status_code=502, detail=f"Error del backend de almacenamiento: {exc}")
    except Exception as exc:
        if _is_duplicate_template_error(exc):
            raise HTTPException(status_code=409, detail="Ya existe una plantilla con el mismo nombre y tipo de reporte")
        print(f"[TemplateEditor] Unexpected error creating template: {exc}")
        raise HTTPException(status_code=500, detail=f"Error interno: {type(exc).__name__}: {exc}")
    return _model_dump(created)


@router.get("/templates/{template_id}")
async def get_template_endpoint(template_id: str):
    _ensure_feature_enabled()
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    return _model_dump(record)


def _latest_template_json_payload(record: Any) -> Dict[str, Any]:
    versions = getattr(record, "versions", None) or []
    if not versions:
        return {}
    latest = versions[-1]
    template_json = getattr(latest, "templateJson", None)
    if template_json is None:
        return {}
    if hasattr(template_json, "model_dump"):
        return template_json.model_dump()
    if hasattr(template_json, "dict"):
        return template_json.dict()
    return {}


@router.get(
    "/templates/{template_id}/versions",
    response_model=TemplateVersionsResponse,
    summary="Listar versiones de una plantilla",
)
async def list_template_versions_endpoint(template_id: str):
    _ensure_feature_enabled()
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    return TemplateVersionsResponse(templateId=template_id, versions=get_template_versions(template_id))


@router.get(
    "/templates/{template_id}/versions/{version_number}",
    response_model=TemplateVersionResponse,
    summary="Obtener una versión específica de una plantilla",
)
async def get_template_version_endpoint(template_id: str, version_number: int):
    _ensure_feature_enabled()
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    version = get_template_version(template_id, version_number)
    if not version:
        raise HTTPException(status_code=404, detail="Versión de plantilla no encontrada")
    return TemplateVersionResponse(templateId=template_id, version=version)


@router.put("/templates/{template_id}", response_model=UpdateTemplateResponse)
async def update_template_endpoint(template_id: str, payload: UpdateTemplatePayload):
    _ensure_feature_enabled()
    try:
        updated, validation = update_template(template_id, payload.templateJson, payload.author, _mutation_role())
    except ValueError as exc:
        raise HTTPException(status_code=_value_error_status(exc), detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error updating template: {exc}")
        raise HTTPException(status_code=502, detail=f"Error del backend de almacenamiento: {exc}")
    except Exception as exc:
        print(f"[TemplateEditor] Unexpected error updating template: {exc}")
        raise HTTPException(status_code=500, detail=f"Error interno: {type(exc).__name__}: {exc}")
    return UpdateTemplateResponse(template=updated, validation=validation)


@router.post("/templates/{template_id}/validate")
async def validate_template_endpoint(template_id: str, payload: ValidateTemplatePayload):
    _ensure_feature_enabled()
    _ = template_id
    result = run_validations(payload.templateJson, payload.role)
    return _model_dump(result)


@router.post(
    "/preview",
    response_model=TemplatePreviewResponse,
    summary="Previsualizar una plantilla sin guardarla",
)
async def preview_template_json_endpoint(payload: PreviewTemplateJsonPayload, request: Request):
    _ensure_feature_enabled()
    if not rate_limiter.check(f"preview-template-json:{request.client.host if request.client else 'local'}"):
        raise HTTPException(status_code=429, detail="Límite de tasa de vista previa excedido")

    async def _build_preview() -> str:
        return compile_and_render_template_json(
            payload.templateJson,
            payload.sampleData,
            logo_left=payload.logo_left or "",
            logo_right=payload.logo_right or "",
        )

    try:
        preview_html = await asyncio.wait_for(_build_preview(), timeout=8.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Tiempo de espera agotado en generación de vista previa")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error en generación de vista previa: {exc}")

    return TemplatePreviewResponse(previewHtml=preview_html)


@router.post(
    "/templates/{template_id}/preview",
    response_model=TemplatePreviewResponse,
    summary="Previsualizar una plantilla guardada",
)
async def preview_template_endpoint(template_id: str, payload: PreviewTemplatePayload, request: Request):
    _ensure_feature_enabled()
    if not rate_limiter.check(f"preview:{request.client.host if request.client else 'local'}"):
        raise HTTPException(status_code=429, detail="Límite de tasa de vista previa excedido")

    async def _build_preview() -> str:
        compiled_html = get_preview_html(template_id)
        if not compiled_html:
            raise HTTPException(status_code=404, detail="Plantilla o borrador no encontrado")
        return render_compiled_html(
            compiled_html,
            payload.sampleData,
            logo_left=payload.logo_left or "",
            logo_right=payload.logo_right or "",
        )

    try:
        preview_html = await asyncio.wait_for(_build_preview(), timeout=8.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Tiempo de espera agotado en generación de vista previa")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error en generación de vista previa: {exc}")
    return TemplatePreviewResponse(templateId=template_id, previewHtml=preview_html)


@router.post("/templates/{template_id}/preview-matrix")
async def preview_matrix_endpoint(template_id: str, payload: PreviewMatrixPayload, request: Request):
    _ensure_feature_enabled()
    if not rate_limiter.check(f"preview-matrix:{request.client.host if request.client else 'local'}"):
        raise HTTPException(status_code=429, detail="Limite de tasa de vista previa excedido")

    compiled_html = get_preview_html(template_id)
    if not compiled_html:
        raise HTTPException(status_code=404, detail="Plantilla o borrador no encontrado")

    previews = []
    for sample in payload.samples:
        previews.append(
            {
                "id": sample.id,
                "previewHtml": render_compiled_html(compiled_html, sample.sampleData),
            }
        )

    return {"templateId": template_id, "previews": previews}


@router.get("/templates/{template_id}/assets")
async def template_assets_endpoint(template_id: str):
    _ensure_feature_enabled()
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    template_json = _latest_template_json_payload(record)
    metadata = template_json.get("metadata") if isinstance(template_json.get("metadata"), dict) else {}
    assets = template_json.get("assetLibrary") if isinstance(template_json.get("assetLibrary"), list) else metadata.get("assetLibrary")
    return {"assets": assets or []}


@router.get("/templates/{template_id}/brand-kits")
async def template_brand_kits_endpoint(template_id: str):
    _ensure_feature_enabled()
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    template_json = _latest_template_json_payload(record)
    metadata = template_json.get("metadata") if isinstance(template_json.get("metadata"), dict) else {}
    brand_kits = metadata.get("brandKits") if isinstance(metadata.get("brandKits"), list) else []
    return {"brandKits": brand_kits}


@router.get("/templates/{template_id}/variants")
async def template_variants_endpoint(template_id: str):
    _ensure_feature_enabled()
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    template_json = _latest_template_json_payload(record)
    metadata = template_json.get("metadata") if isinstance(template_json.get("metadata"), dict) else {}
    variants = metadata.get("variants") if isinstance(metadata.get("variants"), list) else []
    return {"variants": variants}


@router.post(
    "/templates/{template_id}/render",
    response_model=TemplatePreviewResponse,
    summary="Renderizar HTML de una plantilla guardada",
)
async def render_template_endpoint(template_id: str, payload: PreviewTemplatePayload, request: Request):
    """Render a stored template with variable substitution for preview/PDF checks."""
    _ensure_feature_enabled()
    if not rate_limiter.check(f"render:{request.client.host if request.client else 'local'}"):
        raise HTTPException(status_code=429, detail="Límite de tasa de renderizado excedido")

    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    compiled_html = get_preview_html(template_id)
    if not compiled_html:
        raise HTTPException(status_code=404, detail="Contenido de plantilla no encontrado")

    rendered_html = render_compiled_html(
        compiled_html,
        payload.sampleData,
        logo_left=payload.logo_left or "",
        logo_right=payload.logo_right or "",
    )

    return TemplatePreviewResponse(templateId=template_id, previewHtml=rendered_html)


@router.post("/templates/{template_id}/publish")
async def publish_template_endpoint(template_id: str, payload: PublishTemplatePayload):
    _ensure_feature_enabled()
    try:
        published = publish_template(template_id, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error publishing template: {exc}")
        raise HTTPException(status_code=502, detail=f"Error del backend de almacenamiento: {exc}")
    return _model_dump(published)


@router.post("/templates/{template_id}/rollback")
async def rollback_template_endpoint(template_id: str, payload: RollbackTemplatePayload):
    _ensure_feature_enabled()
    try:
        restored = rollback_template(template_id, payload.targetVersion, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error rolling back template: {exc}")
        raise HTTPException(status_code=502, detail=f"Error del backend de almacenamiento: {exc}")
    return _model_dump(restored)


@router.delete("/templates/{template_id}")
async def delete_template_endpoint(template_id: str, author: str = "system"):
    _ensure_feature_enabled()
    try:
        deleted = delete_template(template_id, author)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error deleting template: {exc}")
        raise HTTPException(status_code=502, detail=f"Error del backend de almacenamiento: {exc}")
    return _model_dump(deleted)


# ── Pexels proxy ──────────────────────────────────────────────────────────────

from .pexels_service import curated_photos, pexels_status, search_photos  # noqa: E402


@router.get(
    "/providers/pexels/status",
    summary="Estado de la integración Pexels",
    tags=["template-editor", "pexels"],
)
async def pexels_status_endpoint():
    """Indica si PEXELS_API_KEY está configurada, sin exponer el secreto."""
    return pexels_status()


@router.get(
    "/providers/pexels/search",
    summary="Buscar fotos en Pexels",
    tags=["template-editor", "pexels"],
)
async def pexels_search_endpoint(
    query: str,
    page: int = 1,
    per_page: int = 24,
    orientation: str | None = None,
    size: str | None = None,
    color: str | None = None,
    locale: str = "es-ES",
):
    """
    Proxy seguro hacia GET https://api.pexels.com/v1/search.

    Responde con `items[]` normalizados al DTO interno, paginación y
    `rateLimit` opcionales. Cachea por combinación de parámetros (TTL 60 s).
    """
    return await search_photos(
        query=query,
        page=page,
        per_page=per_page,
        orientation=orientation,
        size=size,
        color=color,
        locale=locale,
    )


@router.get(
    "/providers/pexels/curated",
    summary="Fotos curadas de Pexels",
    tags=["template-editor", "pexels"],
)
async def pexels_curated_endpoint(
    page: int = 1,
    per_page: int = 24,
):
    """
    Proxy seguro hacia GET https://api.pexels.com/v1/curated.

    Devuelve el mismo DTO que /search. Cachea por página/per_page (TTL 60 s).
    """
    return await curated_photos(page=page, per_page=per_page)
