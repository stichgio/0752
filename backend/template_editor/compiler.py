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
html, body { margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; color: #222; line-height: 1.15; }

/* ── WeasyPrint (PDF) ── */
@media print {
  html, body { width: 210mm; height: 297mm; overflow: hidden; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}

/* ── Browser preview (iframe) ── */
@media screen {
  html, body { width: 100%; height: auto; background: transparent; overflow: visible; }
  .page { margin: 0 auto; background: white; }
}

.page {
    width: 200mm; height: 287mm; padding: 3mm;
    display: flex; flex-direction: column;
    overflow: hidden;
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
.photo-section {
    position: relative;
    flex: 1;
    border: 1.2px solid #6d4cff;
    border-radius: 3mm;
    padding: 3.2mm 2mm 2mm 2mm;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: #f7f6ff;
}
.photo-tag {
    position: absolute;
    top: 0.6mm;
    left: 2.4mm;
    display: inline-block;
    padding: 0.6mm 2.2mm;
    border-radius: 999px;
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
    color: #8a4b00;
    background: #ffbe3b;
}
.photo-frame {
    flex: 1;
    min-height: 0;
    border: 1px solid #d8dce5;
    border-radius: 2mm;
    padding: 1.7mm;
    background: #ffffff;
}
.photo-grid {
    width: 100%;
    height: 100%;
    border-collapse: separate;
    border-spacing: 2mm;
    table-layout: fixed;
}
.photo-row { height: 48%; }
.photo-cell {
    width: 48%;
    height: 48%;
    box-sizing: border-box;
    text-align: center;
    vertical-align: middle;
    border: 1px solid #d1d5db;
    border-radius: 1.4mm;
    background: #f3f4f6;
    padding: 1mm;
}
.photo-cell-empty {
    width: 48%;
    height: 48%;
    box-sizing: border-box;
    border: 1px solid transparent;
    background: transparent;
}
.photo-cell-center {
    border: none;
    background: transparent;
    padding: 0;
}
.photo-cell-center .photo-cell-inner {
    width: 48%;
    height: 100%;
    margin: 0 auto;
    box-sizing: border-box;
    text-align: center;
    vertical-align: middle;
    border: 1px solid #d1d5db;
    border-radius: 1.4mm;
    background: #f3f4f6;
    padding: 1mm;
}
.photo-item { width: 100%; height: 100%; }
.photo-item img { max-width: 100%; max-height: 85%; margin: 0 auto; display: block; }
.no-photos { border: 1px dashed #ccc; color: #999; font-style: italic; border-radius: 1.2mm; text-align: center; padding: 8mm 2mm; }

/* Photo labels */
.photo-label { font-weight: 700; font-size: 7.5pt; text-transform: uppercase; margin-top: 2mm; letter-spacing: 0.02em; }

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


def _normalize_photo_count(value: Any) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError):
        return 0
    return count if count in {2, 3, 4, 5, 6} else 0


def _normalize_odd_position(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"left", "center", "right"}:
        return raw
    return "center"


def _escape_html(value: Any) -> str:
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _to_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


PHOTO_TABLE_STYLE = (
    "width: 100%; height: 100%; border-collapse: separate; "
    "border-spacing: 2mm; table-layout: fixed;"
)
PHOTO_ROW_STYLE = "height: 48%;"
PHOTO_CELL_STYLE = (
    "width: 48%; height: 48%; box-sizing: border-box; text-align: center; "
    "vertical-align: middle; background: #f3f4f6; border: 1px solid #d1d5db; padding: 1mm;"
)
PHOTO_EMPTY_CELL_STYLE = (
    "width: 48%; height: 48%; box-sizing: border-box; border: 1px solid transparent; "
    "background: transparent;"
)
PHOTO_CENTER_CELL_STYLE = "padding: 0; border: none; background: transparent;"
PHOTO_CENTER_INNER_STYLE = (
    "width: 48%; height: 100%; margin: 0 auto; box-sizing: border-box; text-align: center; "
    "vertical-align: middle; background: #f3f4f6; border: 1px solid #d1d5db; padding: 1mm;"
)
PHOTO_IMAGE_STYLE = "max-width: 100%; max-height: 85%; margin: 0 auto; display: block;"
PHOTO_LABEL_STYLE = (
    "font-weight: 700; font-size: 7.5pt; text-transform: uppercase; margin-top: 2mm; "
    "letter-spacing: 0.02em;"
)


def _resolve_photo_rows(count: int, odd_position: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    for slot_index in range(0, count - 1, 2):
        rows.append({"type": "pair", "slots": [slot_index, slot_index + 1]})

    if count % 2 == 1:
        last_slot = count - 1
        if odd_position == "center":
            rows.append({"type": "center", "slot": last_slot})
        elif odd_position == "right":
            rows.append({"type": "pair", "slots": [None, last_slot]})
        else:
            rows.append({"type": "pair", "slots": [last_slot, None]})

    return rows


def _compile_indexed_photo_content(index: int, label: str, show_labels: bool) -> str:
    label_html = _escape_html(label)
    label_jinja = label_html.replace("'", "\\'")
    alt_expr = (
        f"{{{{ report.images[{index}].name | default('{label_jinja}') }}}}"
        if show_labels
        else f"{{{{ report.images[{index}].name }}}}"
    )
    label_html_block = (
        f'<div class="photo-label" style="{PHOTO_LABEL_STYLE}">{label_html}</div>'
        if show_labels
        else ""
    )

    return (
        f'{{% if report.images|length > {index} %}}'
        f'<img src="{{{{ report.images[{index}].path }}}}" alt="{alt_expr}" style="{PHOTO_IMAGE_STYLE}">'
        '{% else %}'
        '<div style="color:#999;">Sin foto</div>'
        '{% endif %}'
        f"{label_html_block}"
    )


def _compile_table_photo_grid(
    count: int,
    odd_position: str,
    slot_content_by_index: Dict[int, str],
) -> str:
    rows_html: List[str] = []

    for row in _resolve_photo_rows(count, odd_position):
        if row["type"] == "center":
            slot_index = row["slot"]
            slot_html = slot_content_by_index.get(slot_index, '<div style="color:#999;">Sin foto</div>')
            rows_html.append(
                f'<tr class="photo-row" style="{PHOTO_ROW_STYLE}">'
                f'<td colspan="2" class="photo-cell photo-cell-center" style="{PHOTO_CENTER_CELL_STYLE}">'
                f'<div class="photo-cell-inner" style="{PHOTO_CENTER_INNER_STYLE}">{slot_html}</div>'
                '</td>'
                '</tr>'
            )
            continue

        cells_html: List[str] = []
        for slot_index in row["slots"]:
            if slot_index is None:
                cells_html.append(f'<td class="photo-cell-empty" style="{PHOTO_EMPTY_CELL_STYLE}"></td>')
                continue

            slot_html = slot_content_by_index.get(slot_index, '<div style="color:#999;">Sin foto</div>')
            cells_html.append(
                f'<td class="photo-cell" style="{PHOTO_CELL_STYLE}">{slot_html}</td>'
            )

        rows_html.append(
            f'<tr class="photo-row" style="{PHOTO_ROW_STYLE}">{"".join(cells_html)}</tr>'
        )

    return f'<table class="photo-grid" style="{PHOTO_TABLE_STYLE}">{"".join(rows_html)}</table>'


def _compile_fixed_photo_grid(
    count: int,
    labels: List[str],
    show_labels: bool,
    tag_html: str = "",
    odd_position: str = "center",
) -> str:
    safe_labels = [str(label) for label in labels]
    slot_content_by_index: Dict[int, str] = {}

    for i in range(count):
        label = safe_labels[i] if i < len(safe_labels) and safe_labels[i].strip() else f"FOTO {i + 1}"
        slot_content_by_index[i] = _compile_indexed_photo_content(i, label, show_labels)

    table_html = _compile_table_photo_grid(
        count=count,
        odd_position=odd_position,
        slot_content_by_index=slot_content_by_index,
    )

    return (
        '<div class="photo-section">'
        f"{tag_html}"
        '<div class="photo-frame">'
        f"{table_html}"
        '</div>'
        '</div>'
    )


def _compile_photo_grid(block: EditorBlock) -> str:
    show_labels = _get_meta(block, "showLabels", False)
    labels = _get_meta(block, "labels", [])
    panel_title = str(_get_meta(block, "panelTitle", "") or "").strip()
    tag_html = f'<span class="photo-tag">{panel_title}</span>' if panel_title else ""
    configured_count = _normalize_photo_count(_get_meta(block, "count", 0))
    odd_position = _normalize_odd_position(
        _get_meta(block, "oddPosition", _get_meta(block, "oddAlignment", "center"))
    )

    if configured_count:
        label_list = labels if isinstance(labels, list) else []
        return _compile_fixed_photo_grid(
            configured_count,
            label_list,
            bool(show_labels),
            tag_html,
            odd_position=odd_position,
        )

    if show_labels and labels:
        return _compile_labeled_photos(labels, tag_html)

    return (
        '<div class="photo-section">'
        f"{tag_html}"
        '<div class="photo-frame">'
        "{% if report.images %}"
        "{% set img_count = report.images|length %}"
        f'<table class="photo-grid" style="{PHOTO_TABLE_STYLE}">'
        "{% if img_count == 3 %}"
        f'<tr class="photo-row" style="{PHOTO_ROW_STYLE}">'
        f'<td class="photo-cell" style="{PHOTO_CELL_STYLE}">'
        "{% if report.images|length > 0 %}"
        f'<img src="{{{{ report.images[0].path }}}}" alt="{{{{ report.images[0].name }}}}" style="{PHOTO_IMAGE_STYLE}">'
        "{% else %}"
        '<div style="color:#999;">Sin foto</div>'
        "{% endif %}"
        "</td>"
        f'<td class="photo-cell" style="{PHOTO_CELL_STYLE}">'
        "{% if report.images|length > 1 %}"
        f'<img src="{{{{ report.images[1].path }}}}" alt="{{{{ report.images[1].name }}}}" style="{PHOTO_IMAGE_STYLE}">'
        "{% else %}"
        '<div style="color:#999;">Sin foto</div>'
        "{% endif %}"
        "</td>"
        "</tr>"
        f'<tr class="photo-row" style="{PHOTO_ROW_STYLE}">'
        f'<td colspan="2" class="photo-cell photo-cell-center" style="{PHOTO_CENTER_CELL_STYLE}">'
        f'<div class="photo-cell-inner" style="{PHOTO_CENTER_INNER_STYLE}">'
        "{% if report.images|length > 2 %}"
        f'<img src="{{{{ report.images[2].path }}}}" alt="{{{{ report.images[2].name }}}}" style="{PHOTO_IMAGE_STYLE}">'
        "{% else %}"
        '<div style="color:#999;">Sin foto</div>'
        "{% endif %}"
        "</div>"
        "</td>"
        "</tr>"
        "{% else %}"
        "{% for pair_start in range(0, img_count, 2) %}"
        f'<tr class="photo-row" style="{PHOTO_ROW_STYLE}">'
        f'<td class="photo-cell" style="{PHOTO_CELL_STYLE}">'
        "{% if report.images|length > pair_start %}"
        f'<img src="{{{{ report.images[pair_start].path }}}}" alt="{{{{ report.images[pair_start].name }}}}" style="{PHOTO_IMAGE_STYLE}">'
        "{% else %}"
        '<div style="color:#999;">Sin foto</div>'
        "{% endif %}"
        "</td>"
        f'<td class="photo-cell" style="{PHOTO_CELL_STYLE}">'
        "{% if report.images|length > pair_start + 1 %}"
        f'<img src="{{{{ report.images[pair_start + 1].path }}}}" alt="{{{{ report.images[pair_start + 1].name }}}}" style="{PHOTO_IMAGE_STYLE}">'
        "{% else %}"
        '<div style="color:#999;">Sin foto</div>'
        "{% endif %}"
        "</td>"
        "</tr>"
        "{% endfor %}"
        "{% endif %}"
        "</table>"
        "{% else %}"
        '<div class="no-photos">No se encontraron imágenes asociadas a esta orden.</div>'
        "{% endif %}"
        "</div>"
        "</div>"
    )


def _compile_labeled_photos(labels: List[str], tag_html: str = "") -> str:
    """Labeled photo grid where each position has a name (ANTES, DURANTE, etc.)."""
    slot_content_by_index: Dict[int, str] = {}
    for i, label in enumerate(labels):
        label_html = _escape_html(label)
        slot_content_by_index[i] = (
            f'{{% set ns{i} = namespace(found=false) %}}'
            f'{{% for img in report.images %}}'
            f'{{% if not ns{i}.found and "_{i + 1}." in img.name %}}'
            f'{{% set ns{i}.found = true %}}'
            f'<img src="{{{{ img.path }}}}" alt="{{{{ img.name }}}}" style="{PHOTO_IMAGE_STYLE}">'
            '{% endif %}'
            '{% endfor %}'
            f'{{% if not ns{i}.found %}}'
            '<div style="color:#999;">Sin foto</div>'
            '{% endif %}'
            f'<div class="photo-label" style="{PHOTO_LABEL_STYLE}">{label_html}</div>'
        )

    table_html = _compile_table_photo_grid(
        count=len(labels),
        odd_position="center",
        slot_content_by_index=slot_content_by_index,
    )

    return (
        '<div class="photo-section">'
        f"{tag_html}"
        '<div class="photo-frame">'
        f"{table_html}"
        '</div>'
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


def _compile_signature(block: EditorBlock) -> str:
    metadata = block.metadata or {}
    layout = metadata.get("layout") or {}
    style = metadata.get("style") or {}
    legacy_sig = (metadata.get("signatureConfig") or [{}])[0] if isinstance(metadata.get("signatureConfig"), list) else {}

    x = _to_float(layout.get("x"), 0.0)
    y = _to_float(layout.get("y"), 0.0)
    w = _to_float(layout.get("width"), 55.0)
    h = _to_float(layout.get("height"), 20.0)

    border_color = style.get("borderColor", "#333")
    border_top_width = _to_float(style.get("borderTopWidth", style.get("borderWidth", 1)), 1.0)
    text_align = style.get("textAlign", "center")

    raw_title = metadata.get("title", legacy_sig.get("title", "FIRMA"))
    raw_name = metadata.get("name", metadata.get("signatureName", legacy_sig.get("name", "")))
    title = _escape_html(raw_title or "")
    name = _escape_html(raw_name or "")
    name_html = f'<div style="font-size: 7.5pt; color: #555;">{name}</div>' if name else ""

    return (
        '<div class="element signature" '
        f'style="position: absolute; left: {x}mm; top: {y}mm; width: {w}mm; height: {h}mm; '
        f'text-align: {text_align}; border-top: {border_top_width}px solid {border_color};">'
        '<div style="padding-top: 2mm; font-weight: bold; font-size: 8pt; text-transform: uppercase;">'
        f"{title}"
        '</div>'
        f"{name_html}"
        '</div>'
    )


def _compile_signatures(block: EditorBlock) -> str:
    sigs: List[Dict[str, str]] = _get_meta(block, "signatures", [])
    gap = _get_meta(block, "gap", 15)
    cols = len(sigs)
    grid_cols = " ".join(["1fr"] * cols) if cols > 0 else "1fr 1fr"

    sig_blocks = []
    for sig in sigs:
        title = _escape_html(sig.get("title", ""))
        name = _escape_html(sig.get("name", ""))
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
    "signature": _compile_signature,
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

