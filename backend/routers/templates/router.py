# -*- coding: utf-8 -*-
"""
Router dedicado para endpoints de plantillas (/api/templates).
Extraído de main.py para separación de responsabilidades.
"""
import logging
import os
from typing import Dict, Literal, Optional, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from template_editor.service import (
    get_all_published_templates,
    get_preview_html,
    get_published_template_by_name,
    get_template,
    publish_template,
    set_template_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["templates"])


class TemplateStatusUpdatePayload(BaseModel):
    status: Literal["draft", "published", "archived"] = Field(default="draft")
    author: str = Field(default="system", min_length=1, max_length=120)


@router.get("/templates")
async def list_templates():
    templates_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "templates")
    if not os.path.exists(templates_dir):
        file_templates = []
    else:
        file_templates = [f for f in os.listdir(templates_dir) if f.endswith(".html") and f != "report.html"]

    # Keep the legacy template list working even if the optional editor
    # backend cannot reach Supabase right now.
    try:
        editor_templates = get_all_published_templates()
    except Exception as exc:
        logger.warning("Unable to load published editor templates for /api/templates: %s", exc, exc_info=True)
        editor_templates = []

    return {"templates": file_templates, "editorTemplates": editor_templates}


@router.get("/templates/published")
async def list_published_templates():
    try:
        templates = get_all_published_templates()
    except Exception as exc:
        logger.warning("Unable to load published editor templates for /api/templates/published: %s", exc, exc_info=True)
        templates = []
    return {"templates": templates}


@router.patch("/templates/{template_id}")
async def update_template_status_endpoint(template_id: str, payload: TemplateStatusUpdatePayload):
    try:
        if payload.status == "published":
            updated = publish_template(template_id, payload.author)
        else:
            updated = set_template_status(template_id, payload.status, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")

    return updated.model_dump()


@router.put("/templates/{template_id}")
async def update_template_status_put_endpoint(template_id: str, payload: TemplateStatusUpdatePayload):
    return await update_template_status_endpoint(template_id, payload)


@router.get("/templates/{template_id}/render")
async def render_template_by_id(template_id: str):
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    compiled_html = get_preview_html(template_id)
    if not compiled_html:
        raise HTTPException(status_code=404, detail="Contenido de plantilla no encontrado")

    latest_version = record.versions[-1] if record.versions else None
    template_json: Optional[Dict[str, Any]] = None
    if latest_version and latest_version.templateJson:
            template_json = latest_version.templateJson.model_dump()

    published_at = None
    for version in reversed(record.versions):
        if version.status == "published":
            published_at = version.diffSummary.get("publishedAt") or version.createdAt
            break

    return {
        "id": record.id,
        "name": record.name,
        "status": record.status,
        "content": compiled_html,
        "templateJson": template_json,
        "publishedAt": published_at,
        "updatedAt": record.updatedAt,
    }

@router.get("/templates/{filename}")
async def get_template_content(filename: str):
    # Security: Ensure filename is just a name, not a path
    safe_filename = os.path.basename(filename)
    templates_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "templates")
    file_path = os.path.join(templates_dir, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"name": safe_filename, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
