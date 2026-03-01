"""Unit tests for _normalize_photo_grid_template_compat (CSS-only approach)."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.pdf_generation import _normalize_photo_grid_template_compat


# ── Pass-through cases ──────────────────────────────────────────────────────

def test_returns_none_for_none():
    assert _normalize_photo_grid_template_compat(None) is None


def test_returns_empty_string_unchanged():
    assert _normalize_photo_grid_template_compat("") == ""


def test_returns_non_string_unchanged():
    assert _normalize_photo_grid_template_compat(42) == 42


def test_skips_html_without_photo_cell_wrap():
    html = '<div class="photo-grid"><img src="a.jpg"></div>'
    assert _normalize_photo_grid_template_compat(html) == html


# ── CSS injection ────────────────────────────────────────────────────────────

def test_injects_compat_css_when_photo_cell_wrap_present():
    html = '<div class="photo-cell-wrap"><img src="a.jpg"></div>'
    result = _normalize_photo_grid_template_compat(html)
    assert "photo-grid-compat-fix" in result
    assert ".photo-cell-wrap > img" in result
    assert ".photo-media > img" in result
    assert ".photo-label" in result


def test_injects_css_before_closing_head():
    html = (
        "<html><head><title>Test</title></head>"
        '<body><div class="photo-cell-wrap"><img></div></body></html>'
    )
    result = _normalize_photo_grid_template_compat(html)
    # CSS should appear before </head>
    head_end = result.index("</head>")
    style_pos = result.index("photo-grid-compat-fix")
    assert style_pos < head_end


def test_prepends_css_when_no_head_tag():
    html = '<div class="photo-cell-wrap"><img src="a.jpg"></div>'
    result = _normalize_photo_grid_template_compat(html)
    assert result.startswith("<style")


# ── Idempotency ──────────────────────────────────────────────────────────────

def test_idempotent_no_double_injection():
    html = '<div class="photo-cell-wrap"><img src="a.jpg"></div>'
    first = _normalize_photo_grid_template_compat(html)
    second = _normalize_photo_grid_template_compat(first)
    assert first == second
    assert second.count("photo-grid-compat-fix") == 1


# ── No !important ────────────────────────────────────────────────────────────

def test_no_important_declarations():
    html = '<div class="photo-cell-wrap"><img src="a.jpg"></div>'
    result = _normalize_photo_grid_template_compat(html)
    assert "!important" not in result


# ── No regex HTML restructuring ──────────────────────────────────────────────

def test_does_not_restructure_html_content():
    """The function should only inject CSS, never modify the HTML body."""
    body = (
        '<div class="photo-cell-wrap">'
        '{% if report.images|length > 0 %}'
        '<img src="{{ report.images[0].path }}">'
        '{% endif %}'
        '<div class="photo-label">FOTO 1</div>'
        '</div>'
    )
    html = f"<html><head></head><body>{body}</body></html>"
    result = _normalize_photo_grid_template_compat(html)
    # The body content must be completely untouched
    assert body in result


def test_handles_legacy_template_without_photo_media():
    """Legacy templates without .photo-media should get CSS that targets
    .photo-cell-wrap > img directly."""
    html = (
        '<div class="photo-cell-wrap">'
        '<img src="test.jpg">'
        '<div class="photo-label">LABEL</div>'
        '</div>'
    )
    result = _normalize_photo_grid_template_compat(html)
    assert ".photo-cell-wrap > img" in result


def test_handles_modern_template_with_photo_media():
    """Modern templates already have .photo-media — CSS should still be
    injected (it doesn't conflict)."""
    html = (
        '<div class="photo-cell-wrap">'
        '<div class="photo-media"><img src="test.jpg"></div>'
        '<div class="photo-label">LABEL</div>'
        '</div>'
    )
    result = _normalize_photo_grid_template_compat(html)
    assert ".photo-media > img" in result


def test_handles_varied_html_attributes():
    """Any variation in HTML attributes should not break the function."""
    html = (
        '<div class="photo-cell-wrap extra-class" data-index="0">'
        '<img src="test.jpg" alt="photo" class="custom">'
        '<div class="photo-label custom-label">LABEL</div>'
        '</div>'
    )
    result = _normalize_photo_grid_template_compat(html)
    assert "photo-grid-compat-fix" in result
    # Original HTML is untouched
    assert 'class="photo-cell-wrap extra-class" data-index="0"' in result


def test_handles_complex_jinja_blocks():
    """Complex Jinja2 patterns that previously broke the regex should work."""
    html = (
        '<div class="photo-cell-wrap">'
        '{% if report.images and report.images|length > 0 %}'
        '{% for img in report.images[:4] %}'
        '<img src="{{ img.path }}">'
        '{% endfor %}'
        '{% else %}'
        '<div>No images</div>'
        '{% endif %}'
        '<div class="photo-label">GRID</div>'
        '</div>'
    )
    result = _normalize_photo_grid_template_compat(html)
    assert "photo-grid-compat-fix" in result
    # Complex Jinja2 content is completely preserved
    assert "{% for img in report.images[:4] %}" in result
    assert "{% endfor %}" in result
