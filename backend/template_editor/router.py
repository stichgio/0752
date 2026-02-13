import asyncio
import os
import re
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from .schemas import (
    CreateTemplatePayload,
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
        print(f"[TemplateEditor] Supabase error listing published templates: {exc}")
        templates = []
    return {"templates": templates}


@router.get("/templates")
async def list_templates_endpoint():
    try:
        templates = get_all_editor_templates()
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error listing templates: {exc}")
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
        print(f"[TemplateEditor] Supabase error creating template: {exc}")
        raise HTTPException(status_code=502, detail=f"Storage backend error: {exc}")
    except Exception as exc:
        print(f"[TemplateEditor] Unexpected error creating template: {exc}")
        raise HTTPException(status_code=500, detail=f"Internal error: {type(exc).__name__}: {exc}")
    return _model_dump(created)


@router.get("/templates/{template_id}")
async def get_template_endpoint(template_id: str):
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Template not found")
    return _model_dump(record)


@router.put("/templates/{template_id}", response_model=UpdateTemplateResponse)
async def update_template_endpoint(template_id: str, payload: UpdateTemplatePayload):
    try:
        updated, validation = update_template(template_id, payload.templateJson, payload.author, payload.role)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error updating template: {exc}")
        raise HTTPException(status_code=502, detail=f"Storage backend error: {exc}")
    except Exception as exc:
        print(f"[TemplateEditor] Unexpected error updating template: {exc}")
        raise HTTPException(status_code=500, detail=f"Internal error: {type(exc).__name__}: {exc}")
    return UpdateTemplateResponse(template=updated, validation=validation)


@router.post("/templates/{template_id}/validate")
async def validate_template_endpoint(template_id: str, payload: ValidateTemplatePayload):
    _ = template_id
    result = run_validations(payload.templateJson, payload.role)
    return _model_dump(result)


def _render_preview_html(compiled_html: str, sample_data: Dict[str, Any]) -> str:
    rendered = compiled_html
    for key, value in sample_data.items():
        pattern = re.compile(r"{{\s*" + re.escape(str(key)) + r"(?:\|[a-zA-Z_][a-zA-Z0-9_]*)?\s*}}")
        rendered = pattern.sub(str(value), rendered)
    return rendered


@router.post("/templates/{template_id}/preview")
async def preview_template_endpoint(template_id: str, payload: PreviewTemplatePayload, request: Request):
    if not rate_limiter.check(f"preview:{request.client.host if request.client else 'local'}"):
        raise HTTPException(status_code=429, detail="Preview rate limit exceeded")

    async def _build_preview() -> str:
        compiled_html = get_preview_html(template_id)
        if not compiled_html:
            raise HTTPException(status_code=404, detail="Template or draft not found")
        return _render_preview_html(compiled_html, payload.sampleData)

    try:
        preview_html = await asyncio.wait_for(_build_preview(), timeout=8.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Preview generation timeout")
    return {"templateId": template_id, "previewHtml": preview_html}


@router.post("/templates/{template_id}/publish")
async def publish_template_endpoint(template_id: str, payload: PublishTemplatePayload):
    if not _feature_enabled():
        raise HTTPException(status_code=403, detail="Template editor feature flag disabled")
    try:
        published = publish_template(template_id, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error publishing template: {exc}")
        raise HTTPException(status_code=502, detail=f"Storage backend error: {exc}")
    return _model_dump(published)


@router.post("/templates/{template_id}/rollback")
async def rollback_template_endpoint(template_id: str, payload: RollbackTemplatePayload):
    try:
        restored = rollback_template(template_id, payload.targetVersion, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error rolling back template: {exc}")
        raise HTTPException(status_code=502, detail=f"Storage backend error: {exc}")
    return _model_dump(restored)


@router.delete("/templates/{template_id}")
async def delete_template_endpoint(template_id: str, author: str = "system"):
    try:
        deleted = delete_template(template_id, author)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (SupabaseNotConfiguredError, SupabaseOperationError) as exc:
        print(f"[TemplateEditor] Supabase error deleting template: {exc}")
        raise HTTPException(status_code=502, detail=f"Storage backend error: {exc}")
    return _model_dump(deleted)
