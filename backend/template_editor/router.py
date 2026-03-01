import asyncio
import os
import re
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request  # pyre-ignore[21]

from .schemas import (  # pyre-ignore[21]
    CreateTemplatePayload,
    PreviewTemplatePayload,
    PublishTemplatePayload,
    RollbackTemplatePayload,
    UpdateTemplatePayload,
    UpdateTemplateResponse,
    ValidateTemplatePayload,
)
from .service import (  # pyre-ignore[21]
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
from .supabase_client import SupabaseNotConfiguredError, SupabaseOperationError  # pyre-ignore[21]

router = APIRouter(prefix="/api/template-editor", tags=["template-editor"])


def _feature_enabled() -> bool:
    return os.getenv("FEATURE_TEMPLATE_EDITOR", "false").lower() == "true"


def _model_dump(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


@router.get("/variables/catalog")
async def variable_catalog(report_type: str):
    return {"reportType": report_type, "variables": get_variable_catalog(report_type)}


@router.get("/published")
async def list_published_templates():
    try:
        templates = get_all_published_templates()
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Error de Supabase listando plantillas publicadas: {exc}")
        templates = []
    return {"templates": templates}


@router.get("/templates")
async def list_templates_endpoint():
    try:
        templates = get_all_editor_templates()
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Error de Supabase listando plantillas: {exc}")
        templates = []
    return {"templates": templates}


@router.post("/templates")
async def create_template_endpoint(payload: CreateTemplatePayload):
    report_type = payload.reportType or payload.templateJson.reportType
    try:
        created = create_template(payload.name, report_type, payload.templateJson, payload.author, feature_flag=payload.featureFlag)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Error de Supabase creando plantilla: {exc}")
        raise HTTPException(status_code=502, detail=f"Error en backend de almacenamiento: {exc}")
    except Exception as exc:
        print(f"[TemplateEditor] Error inesperado creando plantilla: {exc}")
        raise HTTPException(status_code=500, detail=f"Error interno: {type(exc).__name__}: {exc}")
    return _model_dump(created)


@router.get("/templates/{template_id}")
async def get_template_endpoint(template_id: str):
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    return _model_dump(record)


@router.put("/templates/{template_id}", response_model=UpdateTemplateResponse)
async def update_template_endpoint(template_id: str, payload: UpdateTemplatePayload):
    try:
        updated, validation = update_template(template_id, payload.templateJson, payload.author, payload.role)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Error de Supabase actualizando plantilla: {exc}")
        raise HTTPException(status_code=502, detail=f"Error en backend de almacenamiento: {exc}")
    except Exception as exc:
        print(f"[TemplateEditor] Error inesperado actualizando plantilla: {exc}")
        raise HTTPException(status_code=500, detail=f"Error interno: {type(exc).__name__}: {exc}")
    return UpdateTemplateResponse(template=updated, validation=validation)


@router.post("/templates/{template_id}/validate")
async def validate_template_endpoint(template_id: str, payload: ValidateTemplatePayload):
    _ = template_id
    result = run_validations(payload.templateJson, payload.role)
    return _model_dump(result)


def _render_preview_html(compiled_html: str, sample_data: Dict[str, Any]) -> str:
    """Regex-only fallback for simple {{ var }} substitution."""
    rendered = compiled_html
    for key, value in sample_data.items():
        pattern = re.compile(r"{{\s*" + re.escape(str(key)) + r"(?:\|[a-zA-Z_][a-zA-Z0-9_]*)?\s*}}")
        rendered = pattern.sub(str(value), rendered)
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
    from jinja2 import Template as J2Template  # pyre-ignore[21]

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
        template = J2Template(compiled_html)
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
    if not rate_limiter.check(f"preview:{request.client.host if request.client else 'local'}"):
        raise HTTPException(status_code=429, detail="Límite de solicitudes de vista previa excedido")

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
        raise HTTPException(status_code=504, detail="Tiempo de espera agotado generando vista previa")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error generando vista previa: {exc}")
    return {"templateId": template_id, "previewHtml": preview_html}


@router.post("/templates/{template_id}/render")
async def render_template_endpoint(template_id: str, payload: PreviewTemplatePayload, request: Request):
    """Compile a canvas template on-the-fly with variable substitution.

    This endpoint re-compiles the template from its stored TemplateJson
    using the canvas pipeline, ensuring the output matches the frontend's
    exportToJinja2() layout with correct absolute positioning.

    Accepts ``logo_left`` and ``logo_right`` (URL or base64 data URI) to
    resolve logo elements whose ``variableName`` references these variables.
    """
    if not rate_limiter.check(f"render:{request.client.host if request.client else 'local'}"):
        raise HTTPException(status_code=429, detail="Límite de solicitudes de renderizado excedido")

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
    if not _feature_enabled():
        raise HTTPException(status_code=403, detail="Editor de plantillas deshabilitado por feature flag")
    try:
        published = publish_template(template_id, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Error de Supabase publicando plantilla: {exc}")
        raise HTTPException(status_code=502, detail=f"Error en backend de almacenamiento: {exc}")
    return _model_dump(published)


@router.post("/templates/{template_id}/rollback")
async def rollback_template_endpoint(template_id: str, payload: RollbackTemplatePayload):
    try:
        restored = rollback_template(template_id, payload.targetVersion, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Error de Supabase revirtiendo plantilla: {exc}")
        raise HTTPException(status_code=502, detail=f"Error en backend de almacenamiento: {exc}")
    return _model_dump(restored)


@router.delete("/templates/{template_id}")
async def delete_template_endpoint(template_id: str, author: str = "system"):
    try:
        deleted = delete_template(template_id, author)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Error de Supabase eliminando plantilla: {exc}")
        raise HTTPException(status_code=502, detail=f"Error en backend de almacenamiento: {exc}")
    return _model_dump(deleted)
