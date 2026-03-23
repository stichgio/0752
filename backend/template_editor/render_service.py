# -*- coding: utf-8 -*-
import html
import re
from typing import Any, Dict

from jinja2.sandbox import SandboxedEnvironment

from .compiler import compileTemplateJsonToJinja
from .models import TemplateJson
from .validators import sanitizeHtml


def _sanitize_template_json(template_json: TemplateJson) -> TemplateJson:
    sanitized = template_json.model_copy(deep=True) if hasattr(template_json, "model_copy") else template_json.copy(deep=True)
    for section in sanitized.sections:
        for block in section.blocks:
            block.content = sanitizeHtml(block.content)
    return sanitized


def render_preview_html_fallback(compiled_html: str, sample_data: Dict[str, Any]) -> str:
    """Regex-only fallback for simple ``{{ var }}`` substitution."""
    rendered = compiled_html
    for key, value in sample_data.items():
        pattern = re.compile(r"{{\s*" + re.escape(str(key)) + r"(?:\|[a-zA-Z_][a-zA-Z0-9_]*)?\s*}}")
        rendered = pattern.sub(html.escape(str(value), quote=True), rendered)
    return rendered


def build_render_context(
    sample_data: Dict[str, Any],
    logo_left: str = "",
    logo_right: str = "",
) -> Dict[str, Any]:
    report_entry: Dict[str, Any] = {
        "data": sample_data,
        "images": [],
        "layout_mode": "2x2",
        "img_count": 0,
    }
    return {
        **sample_data,
        "reports": [report_entry],
        "report": report_entry,
        "data": sample_data,
        "images": [],
        "layout_mode": "2x2",
        "img_count": 0,
        "title": sample_data.get("title", ""),
        "logo_left": logo_left,
        "logo_right": logo_right,
    }


def render_compiled_html(
    compiled_html: str,
    sample_data: Dict[str, Any],
    logo_left: str = "",
    logo_right: str = "",
) -> str:
    context = build_render_context(sample_data, logo_left=logo_left, logo_right=logo_right)
    try:
        template = SandboxedEnvironment(autoescape=True).from_string(compiled_html)
        return template.render(**context)
    except Exception:
        all_vars = dict(sample_data)
        if logo_left:
            all_vars["logo_left"] = logo_left
        if logo_right:
            all_vars["logo_right"] = logo_right
        return render_preview_html_fallback(compiled_html, all_vars)


def compile_and_render_template_json(
    template_json: TemplateJson,
    sample_data: Dict[str, Any],
    logo_left: str = "",
    logo_right: str = "",
) -> str:
    sanitized = _sanitize_template_json(template_json)
    compiled_html = compileTemplateJsonToJinja(sanitized)
    return render_compiled_html(compiled_html, sample_data, logo_left=logo_left, logo_right=logo_right)
