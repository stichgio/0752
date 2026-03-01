import os
import sys

import pytest  # pyre-ignore[21]

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import template_editor.validators as validators_module  # pyre-ignore[21]
from template_editor.compiler import _compile_photo_grid, _compile_table, compileTemplateJsonToJinja  # pyre-ignore[21]
from template_editor.models import EditorBlock, EditorSection, ProtectionRules, TemplateJson  # pyre-ignore[21]
from template_editor.validators import sanitizeHtml, validateProtectedBlocks, validateVariables  # pyre-ignore[21]


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
    assert '<table class="photo-grid"' in html
    assert "table-layout: fixed;" in html
    assert "{% if report.images|length > 4 %}" in html
    assert 'class="photo-cell-empty"' in html
    assert "width: 100%; height: 100%;" in html


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
    assert "ANTES</div>" in html
    assert "DURANTE</div>" in html
    assert "DESPUES</div>" in html
    assert "photo-cell-center" in html
    assert "width: 48%;" in html


def test_compile_table_uses_table_data_matrix_with_safe_bounds():
    block = EditorBlock(
        id="tbl-1",
        type="table",
        metadata={
            "layout": {"x": 12, "y": 34, "width": 100, "height": 25},
            "tableData": {
                "rowCount": 2,
                "colCount": 3,
                "borderColor": "#9ca3af",
                "colWidths": [30, 40, 30],
                "rowHeights": [60, 40],
                "data": [
                    ["A1", "A2", "A3"],
                    ["B1"],
                ],
            },
        },
    )

    html = _compile_table(block)
    assert 'class="element table"' in html
    assert "left: 12.0mm" in html
    assert "top: 34.0mm" in html
    assert "A1" in html
    assert "A2" in html
    assert "A3" in html
    assert "B1" in html
    assert html.count("<td") == 6
    assert "<colgroup>" in html
    assert '<col style="width: 30.0000%;">' in html
    assert '<col style="width: 40.0000%;">' in html
    assert '<tr style="height: 60.0000%;">' in html


def test_compile_table_keeps_legacy_headers_rows_shape():
    block = EditorBlock(
        id="tbl-legacy",
        type="table",
        metadata={
            "headers": ["Campo", "Valor"],
            "rows": [["NIS", "123"], ["Distrito", "ATE"]],
            "borderColor": "#cbd5e1",
            "headerBg": "#f5f5f5",
        },
    )

    html = _compile_table(block)
    assert "<thead" in html
    assert "<th>Campo</th>" in html
    assert "<th>Valor</th>" in html
    assert "<td>NIS</td>" in html
    assert "<td>123</td>" in html
    assert "<td>Distrito</td>" in html
    assert "<td>ATE</td>" in html


def test_sanitize_html_fallback_removes_javascript_and_suspicious_data_urls(monkeypatch):
    monkeypatch.setattr(validators_module, "bleach", None)
    dirty = '<img src="javascript:alert(1)" onerror="alert(2)"><img src="data:text/html;base64,PHNjcmlwdA==">'
    with pytest.warns(UserWarning):
        cleaned = sanitizeHtml(dirty)
    assert "javascript:" not in cleaned.lower()
    assert "onerror" not in cleaned.lower()
    assert "data:text/html" not in cleaned.lower()


def test_compile_signature_renders_dynamic_title_and_name():
    template_json = TemplateJson(
        reportType="generic",
        sections=[
            EditorSection(
                id="s-signature",
                type="body",
                title="Body",
                blocks=[
                    EditorBlock(
                        id="sig-1",
                        type="signature",
                        metadata={
                            "layout": {"x": 12.5, "y": 230, "width": 70, "height": 22},
                            "title": "SUPERVISOR",
                            "name": "Ing. Juan Perez",
                        },
                    )
                ],
            )
        ],
        protectionRules=ProtectionRules(required_block_ids=[], editable_placeholder_by_block={}),
    )

    html = compileTemplateJsonToJinja(template_json)
    assert "class=\"element signature\"" in html
    assert "SUPERVISOR" in html
    assert "Ing. Juan Perez" in html
    assert "left: 12.5mm" in html
    assert "top: 230.0mm" in html


def test_compile_signature_supports_legacy_signature_config_fallback():
    template_json = TemplateJson(
        reportType="generic",
        sections=[
            EditorSection(
                id="s-signature-legacy",
                type="body",
                title="Body",
                blocks=[
                    EditorBlock(
                        id="sig-legacy",
                        type="signature",
                        metadata={
                            "signatureConfig": [{"title": "CONTRATISTA", "name": "Maria Torres"}],
                        },
                    )
                ],
            )
        ],
        protectionRules=ProtectionRules(required_block_ids=[], editable_placeholder_by_block={}),
    )

    html = compileTemplateJsonToJinja(template_json)
    assert "CONTRATISTA" in html
    assert "Maria Torres" in html


# ---------------------------------------------------------------------------
# _normalize_photo_grid_template_compat tests
# ---------------------------------------------------------------------------

from main import _normalize_photo_grid_template_compat  # pyre-ignore[21]


def test_compat_returns_none_for_none():
    assert _normalize_photo_grid_template_compat(None) is None


def test_compat_returns_empty_string_unchanged():
    assert _normalize_photo_grid_template_compat("") == ""


def test_compat_skips_html_without_photo_cell_wrap():
    html = "<html><head></head><body><p>Hello</p></body></html>"
    assert _normalize_photo_grid_template_compat(html) == html


def test_compat_injects_style_before_head_close():
    html = '<html><head></head><body><div class="photo-cell-wrap"></div></body></html>'
    result = _normalize_photo_grid_template_compat(html)
    assert "photo-grid-compat-fix" in result
    assert result.index("photo-grid-compat-fix") < result.index("</head>")


def test_compat_injects_style_as_prefix_when_no_head():
    html = '<div class="photo-cell-wrap"><img src="x.jpg"></div>'
    result = _normalize_photo_grid_template_compat(html)
    assert result.startswith("\n<style")
    assert "photo-grid-compat-fix" in result
    assert html in result


def test_compat_does_not_restructure_html():
    """The function must NOT modify the HTML structure — only inject CSS."""
    legacy = (
        '<div class="photo-cell-wrap">'
        '{% if report.images|length > 0 %}'
        '<img src="{{ report.images[0].path }}">'
        '{% endif %}'
        '<div class="photo-label">ANTES</div>'
        '</div>'
    )
    result = _normalize_photo_grid_template_compat(legacy)
    # The original markup must be intact (no wrapping divs inserted).
    assert legacy in result


def test_compat_handles_modern_template_with_photo_media():
    modern = (
        '<html><head></head><body>'
        '<div class="photo-cell-wrap">'
        '<div class="photo-media"><img src="x.jpg"></div>'
        '<div class="photo-label">FOTO</div>'
        '</div></body></html>'
    )
    result = _normalize_photo_grid_template_compat(modern)
    assert "photo-grid-compat-fix" in result
    # Original structure preserved.
    assert '<div class="photo-media"><img src="x.jpg"></div>' in result


def test_compat_css_covers_legacy_direct_img():
    """CSS must include rules for img as direct child of .photo-cell-wrap."""
    html = '<div class="photo-cell-wrap"><img src="x.jpg"></div>'
    result = _normalize_photo_grid_template_compat(html)
    assert ".photo-cell-wrap > img" in result


def test_compat_css_covers_photo_media_img():
    """CSS must include rules for img inside .photo-media."""
    html = '<div class="photo-cell-wrap"><div class="photo-media"><img></div></div>'
    result = _normalize_photo_grid_template_compat(html)
    assert ".photo-media > img" in result
