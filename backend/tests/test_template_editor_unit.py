import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import template_editor.validators as validators_module
from template_editor.compiler import _compile_photo_grid, compileTemplateJsonToJinja
from template_editor.models import EditorBlock, EditorSection, ProtectionRules, TemplateJson
from template_editor.validators import sanitizeHtml, validateProtectedBlocks, validateVariables


def _sample_json() -> TemplateJson:
    return TemplateJson(
        reportType="technical-report",
        sections=[
            EditorSection(
                id="s1",
                type="body",
                title="Body",
                blocks=[
                    EditorBlock(id="b1", type="text", content="<p>{{cs}}</p>"),
                    EditorBlock(id="b2", type="protected", content="<div>{{contratista}}</div>", placeholders=["contratista"], locked=True),
                ],
            )
        ],
        variableBindings={"cs": "header.cs"},
        protectionRules=ProtectionRules(required_block_ids=["b2"], editable_placeholder_by_block={"b2": ["contratista"]}),
    )


def test_compile_template_json_to_jinja_is_deterministic():
    template_json = _sample_json()
    result_a = compileTemplateJsonToJinja(template_json)
    result_b = compileTemplateJsonToJinja(template_json)
    assert result_a == result_b
    assert "data-protected=\"true\"" in result_a


def test_validate_variables_detects_unknown_and_bad_filter():
    template_json = _sample_json().copy(deep=True)
    template_json.sections[0].blocks[0].content = "{{unknown}} {{cs|danger}}"
    allowed = {"cs": {"optional": False}}
    result = validateVariables(template_json, allowed, whitelist_filters={"date"})
    assert result.valid is False
    codes = {issue.code for issue in result.issues}
    assert "VAR_UNKNOWN" in codes
    assert "FILTER_NOT_ALLOWED" in codes


def test_validate_protected_blocks_rejects_editor_unlock():
    template_json = _sample_json().copy(deep=True)
    template_json.sections[0].blocks[1].locked = False
    result = validateProtectedBlocks(template_json, role="editor")
    assert result.valid is False
    assert any(issue.code == "PROTECTED_NOT_LOCKED" for issue in result.issues)


def test_sanitize_html_removes_scripts_and_handlers():
    dirty = '<div onclick="alert(1)">X</div><script>alert(2)</script><iframe src="x"></iframe>'
    cleaned = sanitizeHtml(dirty)
    assert "onclick" not in cleaned
    assert "script" not in cleaned.lower()
    assert "iframe" not in cleaned.lower()


def test_compile_photo_grid_adds_safe_guards_for_indexed_images():
    block = EditorBlock(id="pg1", type="photo-grid", metadata={"showLabels": False})
    html = _compile_photo_grid(block)
    assert "{% if report.images|length > 0 %}" in html
    assert "{% if report.images|length > 1 %}" in html
    assert "{% if report.images|length > 2 %}" in html


def test_compile_photo_grid_respects_configured_count_and_odd_position():
    block = EditorBlock(
        id="pg2",
        type="photo-grid",
        metadata={"count": 5, "oddPosition": "right", "showLabels": False},
    )
    html = _compile_photo_grid(block)
    assert 'grid-template-columns: repeat(2, 1fr);' in html
    assert "{% if report.images|length > 4 %}" in html
    assert "grid-column: 2 / span 1;" in html


def test_compile_photo_grid_respects_configured_count_with_labels():
    block = EditorBlock(
        id="pg3",
        type="photo-grid",
        metadata={
            "count": 3,
            "oddPosition": "center",
            "showLabels": True,
            "labels": ["ANTES", "DURANTE", "DESPUES"],
        },
    )
    html = _compile_photo_grid(block)
    assert "{% if report.images|length > 2 %}" in html
    assert '<div class="photo-label">ANTES</div>' in html
    assert '<div class="photo-label">DURANTE</div>' in html
    assert '<div class="photo-label">DESPUES</div>' in html
    assert "grid-column: 1 / span 2; width: 50%; justify-self: center;" in html


def test_sanitize_html_fallback_removes_javascript_and_suspicious_data_urls(monkeypatch):
    monkeypatch.setattr(validators_module, "bleach", None)
    dirty = '<img src="javascript:alert(1)" onerror="alert(2)"><img src="data:text/html;base64,PHNjcmlwdA==">'
    with pytest.warns(UserWarning):
        cleaned = sanitizeHtml(dirty)
    assert "javascript:" not in cleaned.lower()
    assert "onerror" not in cleaned.lower()
    assert "data:text/html" not in cleaned.lower()
