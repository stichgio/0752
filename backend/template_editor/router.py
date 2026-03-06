import asyncio
import html
import os
import re
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from .schemas import (
    CreateTemplatePayload,
    PreviewMatrixPayload,
    PreviewTemplatePayload,
    PublishTemplatePayload,
    RollbackTemplatePayload,
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
    get_variable_catalog,
    publish_template,
    rate_limiter,
    rollback_template,
    run_validations,
    update_template,
)
from .supabase_client import SupabaseNotConfiguredError, SupabaseOperationError
from config import settings  

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


def _render_preview_html(compiled_html: str, sample_data: Dict[str, Any]) -> str:
    """Regex-only fallback for simple {{ var }} substitution."""
    rendered = compiled_html
    for key, value in sample_data.items():
        pattern = re.compile(r"{{\s*" + re.escape(str(key)) + r"(?:\|[a-zA-Z_][a-zA-Z0-9_]*)?\s*}}")
        rendered = pattern.sub(html.escape(str(value), quote=True), rendered)
    return rendered


def _render_compiled_html(
    compiled_html: str,
    sample_data: Dict[str, Any],
    logo_left: str = "",
    logo_right: str = "",
) -> str:
    """Render compiled Jinja2 HTML with proper variable context.

    Uses Jinja2 Template rendering to handle ``{% if logo_left %}`` conditional
    blocks and ``{{ variable }}`` expressions.  Falls back to regex substitution
    if Jinja2 rendering fails.
    """
    # Build a report context matching the PDF pipeline structure
    report_entry: Dict[str, Any] = {
        "data": sample_data,
        "images": [],
        "layout_mode": "2x2",
        "img_count": 0,
    }

    context: Dict[str, Any] = {
        # Top-level variables for {{ var_name }} substitution
        **sample_data,
        # Report list for {% for report in reports %}
        "reports": [report_entry],
        "report": report_entry,
        # Legacy single-report variables
        "data": sample_data,
        "images": [],
        "layout_mode": "2x2",
        "img_count": 0,
        "title": sample_data.get("title", ""),
        # Logos
        "logo_left": logo_left,
        "logo_right": logo_right,
    }

    try:
        from jinja2.sandbox import SandboxedEnvironment

        template = SandboxedEnvironment(autoescape=True).from_string(compiled_html)
        return template.render(**context)
    except Exception:
        # Fallback to regex substitution for simple {{ var }} patterns
        all_vars = dict(sample_data)
        if logo_left:
            all_vars["logo_left"] = logo_left
        if logo_right:
            all_vars["logo_right"] = logo_right
        return _render_preview_html(compiled_html, all_vars)


@router.post("/templates/{template_id}/preview")
async def preview_template_endpoint(template_id: str, payload: PreviewTemplatePayload, request: Request):
    _ensure_feature_enabled()
    if not rate_limiter.check(f"preview:{request.client.host if request.client else 'local'}"):
        raise HTTPException(status_code=429, detail="Límite de tasa de vista previa excedido")

    async def _build_preview() -> str:
        compiled_html = get_preview_html(template_id)
        if not compiled_html:
            raise HTTPException(status_code=404, detail="Plantilla o borrador no encontrado")
        return _render_compiled_html(
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
    return {"templateId": template_id, "previewHtml": preview_html}




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
        previews.append({
            "id": sample.id,
            "previewHtml": _render_compiled_html(compiled_html, sample.sampleData),
        })

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


@router.post("/templates/{template_id}/render")
async def render_template_endpoint(template_id: str, payload: PreviewTemplatePayload, request: Request):
    """Compile a canvas template on-the-fly with variable substitution.

    This endpoint re-compiles the template from its stored TemplateJson
    using the canvas pipeline, ensuring the output matches the frontend's
    exportToJinja2() layout with correct absolute positioning.

    Accepts ``logo_left`` and ``logo_right`` (URL or base64 data URI) to
    resolve logo elements whose ``variableName`` references these variables.
    """
    _ensure_feature_enabled()
    if not rate_limiter.check(f"render:{request.client.host if request.client else 'local'}"):
        raise HTTPException(status_code=429, detail="Límite de tasa de renderizado excedido")

    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    compiled_html = get_preview_html(template_id)
    if not compiled_html:
        raise HTTPException(status_code=404, detail="Contenido de plantilla no encontrado")

    compiled_html = _render_compiled_html(
        compiled_html,
        payload.sampleData,
        logo_left=payload.logo_left or "",
        logo_right=payload.logo_right or "",
    )

    return {"templateId": template_id, "previewHtml": compiled_html}


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
