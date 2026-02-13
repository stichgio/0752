"""
Compiler: converts canonical JSON editor model to production Jinja2 HTML.

The generated HTML must be fully compatible with the existing PDF pipeline
(WeasyPrint) and match the structure of hand-crafted templates in /templates/.
"""

from typing import Any, Dict, List

from .models import EditorBlock, TemplateJson

# ─── CSS that matches the existing hand-crafted templates ───

TEMPLATE_CSS = """\
@page { size: A4; margin: 5mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 210mm; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; color: #222; line-height: 1.15; }

/* ── Browser preview (iframe) ── */
@media screen {
  html, body { height: 297mm; overflow: hidden; }
  .page { height: 287mm; }
  .photo-section { flex: 1; min-height: 0; overflow: hidden; }
  .photo-grid { flex: 1; height: 100%; }
  .layout-2 .photo-item { height: 100%; }
  .layout-4 .photo-item { height: 100%; }
  .layout-3 { height: 100%; }
  .layout-3 .top-row { height: calc(50% - 1mm); }
  .layout-3 .bottom-row { height: calc(50% - 1mm); }
  .layout-3 .top-row .photo-item { height: 100%; }
  .layout-3 .bottom-row .photo-item { height: 100%; }
}

/* ── WeasyPrint (PDF) ── */
@media print {
  .page { min-height: 287mm; }
  .photo-section { min-height: 130mm; }
  .photo-grid { min-height: 120mm; }
  .photo-item { height: 9cm; }
  .layout-3 .top-row .photo-item { height: 9cm; }
  .layout-3 .bottom-row .photo-item { height: 9cm; width: 50%; }
  .layout-4 .photo-item { height: 8cm; }
}

.page {
    width: 200mm; padding: 3mm;
    display: flex; flex-direction: column;
    page-break-after: always;
}

/* Header */
.header { display: flex; justify-content: space-between; align-items: center; height: 20mm; border-bottom: 1.5px solid #ddd; margin-bottom: 2mm; flex-shrink: 0; }
.logo { width: 55mm; height: 18mm; display: flex; align-items: center; }
.logo img, .logo svg { max-width: 100%; max-height: 100%; object-fit: contain; }
.title { flex: 1; text-align: center; font-size: 13pt; font-weight: 700; text-transform: uppercase; color: #333; }

/* Info Bar */
.info-bar { display: flex; justify-content: space-between; background: #f5f5f5; border: 1px solid #ddd; padding: 1.5mm 3mm; margin-bottom: 2mm; font-size: 7.5pt; flex-shrink: 0; }
.info-item { display: flex; gap: 1mm; }
.info-label { font-weight: 700; color: #555; }

/* Section Title */
.section-title { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid; padding-bottom: 0.5mm; margin: 1.5mm 0 1mm 0; flex-shrink: 0; }

/* Data Grids */
.grid-6 { display: grid; grid-template-columns: auto 1fr auto 1fr auto 1fr; gap: 1mm 2mm; margin-bottom: 1.5mm; flex-shrink: 0; }
.grid-4 { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 1mm 2mm; margin-bottom: 1.5mm; flex-shrink: 0; }
.lbl { font-weight: 600; text-align: right; font-size: 6.5pt; color: #555; white-space: nowrap; align-self: center; }
.val { border: 1px dotted #888; background: #fefefe; padding: 0.8mm 1.5mm; font-size: 7pt; min-height: 4mm; display: flex; align-items: center; }
.span3 { grid-column: span 3; }

/* Photo Section */
.photo-section { border: 2px solid #333; padding: 2mm; display: flex; flex-direction: column; }
.photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; width: 100%; }
.photo-item { border: 1px solid #ddd; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; height: 9cm; padding: 2mm; }
.photo-item img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }
.layout-2 { grid-template-columns: 1fr 1fr; grid-template-rows: auto; }
.layout-3 { display: flex; flex-direction: column; gap: 2mm; width: 100%; }
.layout-3 .top-row { display: flex; flex-direction: row; gap: 2mm; }
.layout-3 .top-row .photo-item { flex: 1; }
.layout-3 .bottom-row { display: flex; justify-content: center; }
.layout-3 .bottom-row .photo-item { width: 50%; }
.layout-4 { grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; }
.layout-grid { grid-template-columns: 1fr 1fr; grid-auto-rows: 9cm; }
.no-photos { min-height: 60mm; display: flex; align-items: center; justify-content: center; border: 1px dashed #ccc; color: #999; font-style: italic; }

/* Photo labels */
.photo-container { display: flex; flex-direction: column; align-items: center; }
.photo-label { font-weight: bold; font-size: 10pt; text-transform: uppercase; margin-top: 2mm; }

/* Text block */
.text-block { margin: 2mm 0; }

/* Table */
.data-table { width: 100%; border-collapse: collapse; margin: 2mm 0; font-size: 7.5pt; }
.data-table th, .data-table td { border: 1px solid #cbd5e1; padding: 1.5mm 2mm; text-align: left; }
.data-table th { background: #f5f5f5; font-weight: 700; color: #555; font-size: 7pt; }

/* Signatures */
.signatures { display: grid; gap: 15mm; margin-top: auto; padding-top: 10mm; }
.signature-block { text-align: center; }
.signature-line { border-top: 1px solid #333; width: 55mm; margin: 0 auto 2mm auto; }
.signature-title { font-weight: 700; font-size: 8pt; text-transform: uppercase; color: #333; }
.signature-name { font-size: 7.5pt; color: #555; }

/* Footer */
.template-footer { margin-top: auto; padding-top: 3mm; border-top: 1px solid #ddd; text-align: center; }

/* Spacer */
.spacer { flex-shrink: 0; }
"""


# ─── Block compilation functions ───


def _get_meta(block: EditorBlock, key: str, default: Any = None) -> Any:
    return block.metadata.get(key, default)


def _compile_header(block: EditorBlock) -> str:
    title = _get_meta(block, "title", "PANEL FOTOGRÁFICO")
    show_logos = _get_meta(block, "showLogos", True)

    logo_left_html = (
        '{% if logo_left %}<img src="{{ logo_left }}" alt="Logo">{% else %}'
        '<svg width="100%" height="100%" viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg"></svg>'
        '{% endif %}'
    ) if show_logos else ''

    logo_right_html = (
        '{% if logo_right %}<img src="{{ logo_right }}" alt="Logo">{% else %}'
        '<svg width="100%" height="100%" viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg"></svg>'
        '{% endif %}'
    ) if show_logos else ''

    return (
        '<div class="header">'
        f'<div class="logo">{logo_left_html}</div>'
        f'<div class="title">{title}</div>'
        f'<div class="logo" style="justify-content: flex-end;">{logo_right_html}</div>'
        '</div>'
    )


def _compile_info_bar(block: EditorBlock) -> str:
    fields = _get_meta(block, "fields", [])
    items = []
    for field in fields:
        label = field.get("label", "")
        variable = field.get("variable", "")
        items.append(
            f'<div class="info-item"><span class="info-label">{label}:</span> '
            f"{{{{ report.data.get('{variable}', '-') }}}}</div>"
        )
    return f'<div class="info-bar">{"".join(items)}</div>'


def _compile_section_title(block: EditorBlock) -> str:
    number = _get_meta(block, "number", "")
    text = _get_meta(block, "text", "SECCIÓN")
    color = _get_meta(block, "color", "#0056b3")
    prefix = f"{number} " if number else ""
    return f'<div class="section-title" style="color: {color}; border-color: {color};">{prefix}{text}</div>'


def _compile_data_grid(block: EditorBlock) -> str:
    columns = _get_meta(block, "columns", 6)
    fields: List[Dict[str, str]] = _get_meta(block, "fields", [])
    span_fields: List[str] = _get_meta(block, "spanFields", [])
    css_class = "grid-6" if columns == 6 else "grid-4"

    cells: List[str] = []
    for field in fields:
        label = field.get("label", "")
        variable = field.get("variable", "")
        span_class = " span3" if variable in span_fields else ""
        cells.append(
            f'<span class="lbl">{label}:</span>'
            f'<div class="val{span_class}">{{{{ report.data.get(\'{variable}\', \'-\') }}}}</div>'
        )

    return f'<div class="{css_class}">{"".join(cells)}</div>'


def _compile_photo_grid(block: EditorBlock) -> str:
    show_labels = _get_meta(block, "showLabels", False)
    labels = _get_meta(block, "labels", [])

    if show_labels and labels:
        return _compile_labeled_photos(labels)

    return (
        '<div class="photo-section">'
        "{% if report.images %}"
        "{% set img_count = report.images|length %}"
        "{% if img_count == 3 %}"
        '<div class="photo-grid layout-3">'
        '<div class="top-row">'
        # Guard indexed access to avoid runtime errors with partial image lists.
        '{% if report.images|length > 0 %}'
        '<div class="photo-item"><img src="{{ report.images[0].path }}" alt="{{ report.images[0].name }}"></div>'
        '{% endif %}'
        '{% if report.images|length > 1 %}'
        '<div class="photo-item"><img src="{{ report.images[1].path }}" alt="{{ report.images[1].name }}"></div>'
        '{% endif %}'
        "</div>"
        '<div class="bottom-row">'
        '{% if report.images|length > 2 %}'
        '<div class="photo-item"><img src="{{ report.images[2].path }}" alt="{{ report.images[2].name }}"></div>'
        '{% endif %}'
        "</div>"
        "</div>"
        "{% else %}"
        '<div class="photo-grid layout-{{ img_count if img_count in [2, 4] else \'grid\' }}">'
        "{% for img in report.images %}"
        '<div class="photo-item"><img src="{{ img.path }}" alt="{{ img.name }}"></div>'
        "{% endfor %}"
        "</div>"
        "{% endif %}"
        "{% else %}"
        '<div class="no-photos">No se encontraron imágenes asociadas a esta orden.</div>'
        "{% endif %}"
        "</div>"
    )


def _compile_labeled_photos(labels: List[str]) -> str:
    """Labeled photo grid where each position has a name (ANTES, DURANTE, etc.)."""
    photo_cells: List[str] = []
    for i, label in enumerate(labels):
        photo_cells.append(
            f'{{% set ns{i} = namespace(found=false) %}}'
            f'{{% for img in report.images %}}'
            f'{{% if not ns{i}.found and "_{i + 1}." in img.name %}}'
            f'{{% set ns{i}.found = true %}}'
            '<div class="photo-container">'
            f'<div class="photo-item"><img src="{{{{ img.path }}}}" alt="{{{{ img.name }}}}"></div>'
            f'<div class="photo-label">{label}</div>'
            '</div>'
            '{% endif %}'
            '{% endfor %}'
            f'{{% if not ns{i}.found %}}'
            '<div class="photo-container">'
            '<div class="photo-item" style="background: #f0f0f0;"><span style="color:#999;">Sin foto</span></div>'
            f'<div class="photo-label">{label}</div>'
            '</div>'
            '{% endif %}'
        )

    return (
        '<div class="photo-section">'
        '<div class="photo-grid layout-4">'
        + "".join(photo_cells)
        + '</div>'
        '</div>'
    )


def _compile_text(block: EditorBlock) -> str:
    content = block.content or _get_meta(block, "content", "")
    font_size = _get_meta(block, "fontSize", 9)
    align = _get_meta(block, "align", "left")
    bold = _get_meta(block, "bold", False)
    weight = "font-weight: 700;" if bold else ""
    return (
        f'<div class="text-block" style="font-size: {font_size}pt; text-align: {align}; {weight}">'
        f'{content}'
        '</div>'
    )


def _compile_table(block: EditorBlock) -> str:
    headers: List[str] = _get_meta(block, "headers", ["Campo", "Valor"])
    rows: List[List[str]] = _get_meta(block, "rows", [])
    border_color = _get_meta(block, "borderColor", "#cbd5e1")
    header_bg = _get_meta(block, "headerBg", "#f5f5f5")

    header_cells = "".join(f"<th>{h}</th>" for h in headers)
    body_rows = []
    for row in rows:
        cells = "".join(f"<td>{c}</td>" for c in row)
        body_rows.append(f"<tr>{cells}</tr>")

    return (
        f'<table class="data-table" style="border-color: {border_color};">'
        f'<thead style="background: {header_bg};"><tr>{header_cells}</tr></thead>'
        f'<tbody>{"".join(body_rows)}</tbody>'
        '</table>'
    )


def _compile_signatures(block: EditorBlock) -> str:
    sigs: List[Dict[str, str]] = _get_meta(block, "signatures", [])
    gap = _get_meta(block, "gap", 15)
    cols = len(sigs)
    grid_cols = " ".join(["1fr"] * cols) if cols > 0 else "1fr 1fr"

    sig_blocks = []
    for sig in sigs:
        title = sig.get("title", "")
        name = sig.get("name", "")
        name_html = f'<div class="signature-name">{name}</div>' if name else ""
        sig_blocks.append(
            '<div class="signature-block">'
            '<div class="signature-line"></div>'
            f'<div class="signature-title">{title}</div>'
            f'{name_html}'
            '</div>'
        )

    return (
        f'<div class="signatures" style="grid-template-columns: {grid_cols}; gap: {gap}mm;">'
        f'{"".join(sig_blocks)}'
        '</div>'
    )


def _compile_footer(block: EditorBlock) -> str:
    content = block.content or _get_meta(block, "content", "")
    font_family = _get_meta(block, "fontFamily", "Arial")
    color = _get_meta(block, "color", "#555")
    font_size = _get_meta(block, "fontSize", 8)
    return (
        f'<div class="template-footer" style="font-family: \'{font_family}\', sans-serif; '
        f'color: {color}; font-size: {font_size}pt;">'
        f'{content}'
        '</div>'
    )


def _compile_spacer(block: EditorBlock) -> str:
    height = _get_meta(block, "height", 5)
    return f'<div class="spacer" style="height: {height}mm;"></div>'


# ─── Block type dispatch ───

BLOCK_COMPILERS = {
    "header": _compile_header,
    "info-bar": _compile_info_bar,
    "info_bar": _compile_info_bar,
    "section-title": _compile_section_title,
    "section_title": _compile_section_title,
    "data-grid": _compile_data_grid,
    "data_grid": _compile_data_grid,
    "photo-grid": _compile_photo_grid,
    "photo_grid": _compile_photo_grid,
    "text": _compile_text,
    "table": _compile_table,
    "signatures": _compile_signatures,
    "footer": _compile_footer,
    "spacer": _compile_spacer,
    "protected": lambda b: (
        f'<div class="text-block protected-block" '
        f'data-block-id="{b.id}" '
        'data-block-type="protected" '
        'data-protected="true" '
        'style="border-left: 3px solid #b91c1c; padding-left: 8px;">'
        f'{b.content or ""}'
        '</div>'
    ),
    "image": lambda b: f'<div>{b.content or ""}</div>',
    "variables": lambda b: f'<span>{b.content or ""}</span>',
}


def _render_block(block: EditorBlock) -> str:
    """Render a single block to Jinja2 HTML."""
    compiler = BLOCK_COMPILERS.get(block.type)
    if compiler:
        return compiler(block)
    css_class = "protected-block" if block.type == "protected" or block.locked else "editor-block"
    return f'<div class="{css_class}" data-block-id="{block.id}">{block.content or ""}</div>'


def _is_block_based(template_json: TemplateJson) -> bool:
    """Detect if this template was created with the block editor (vs legacy canvas)."""
    if template_json.metadata.get("source") == "block-editor":
        return True
    for section in template_json.sections:
        for block in section.blocks:
            if block.type in ("header", "info-bar", "info_bar", "section-title",
                              "section_title", "data-grid", "data_grid",
                              "photo-grid", "photo_grid", "signatures",
                              "footer", "spacer"):
                return True
    return False


def compileTemplateJsonToJinja(template_json: TemplateJson) -> str:
    """
    Deterministic compiler from canonical JSON editor model to HTML/Jinja2.

    For block-editor templates: produces full production HTML matching
    the structure of hand-crafted templates in /templates/.

    For legacy canvas templates: produces basic HTML (backwards compatible).
    """
    if not _is_block_based(template_json):
        return _compile_legacy(template_json)

    return _compile_block_template(template_json)


def _compile_block_template(template_json: TemplateJson) -> str:
    """Compile a block-based template to full Jinja2 HTML."""
    blocks_html: List[str] = []
    for section in template_json.sections:
        for block in section.blocks:
            blocks_html.append(_render_block(block))

    page_content = "\n".join(blocks_html)

    return (
        '<!DOCTYPE html>\n'
        '<html lang="es">\n'
        '<head>\n'
        '<meta charset="UTF-8">\n'
        '<title>{{ title }}</title>\n'
        f'<style>\n{TEMPLATE_CSS}\n</style>\n'
        '</head>\n'
        '<body>\n'
        '{# Handle both single data/images (legacy) and reports list #}\n'
        "{% set report_list = reports if reports else [{'data': data, 'images': images, "
        "'layout_mode': layout_mode, 'img_count': img_count}] %}\n"
        '\n'
        '{% for report in report_list %}\n'
        '<div class="page">\n'
        f'{page_content}\n'
        '</div>\n'
        '{% endfor %}\n'
        '</body>\n'
        '</html>'
    )


def _compile_legacy(template_json: TemplateJson) -> str:
    """Backwards-compatible compiler for old canvas-style templates."""
    section_html: List[str] = []
    for section in template_json.sections:
        blocks = "".join(_render_block(block) for block in section.blocks)
        section_html.append(
            f'<section data-section-id="{section.id}" data-section-type="{section.type}">'
            f"{blocks}"
            "</section>"
        )

    html_body = "".join(section_html)
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8">'
        "<style>"
        "@page { size: A4; margin: 10mm; }"
        "body { font-family: Arial, sans-serif; font-size: 11px; }"
        ".editor-block { margin: 4px 0; }"
        ".protected-block { margin: 4px 0; border-left: 3px solid #b91c1c; padding-left: 8px; }"
        "</style></head><body>"
        f"{html_body}"
        "</body></html>"
    )
