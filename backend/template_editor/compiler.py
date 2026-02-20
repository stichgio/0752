"""
Compiler: converts canonical JSON editor model to production Jinja2 HTML.

The generated HTML must be fully compatible with the existing PDF pipeline
(WeasyPrint) and match the structure of hand-crafted templates in /templates/.
"""

import re
from typing import Any, Dict, List, Optional

from .models import EditorBlock, TemplateJson
from .utils import url_to_base64

# ─── CSS that matches the existing hand-crafted templates ───

TEMPLATE_CSS = """\
@page { size: A4; margin: 5mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { margin: 0; padding: 0; }
body { font-family: Arial, 'Segoe UI', Helvetica, sans-serif; font-size: 8pt; color: #222; line-height: 1.15;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }

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

/* Data Grids — table layout for WeasyPrint compatibility */
.grid-6, .grid-4 { width: 100%; border-collapse: separate; border-spacing: 2mm 1mm; margin-bottom: 1.5mm; table-layout: auto; }
.lbl { font-weight: 600; text-align: right; font-size: 6.5pt; color: #555; white-space: nowrap; vertical-align: middle; padding: 0; }
.val { border: 1px dotted #888; background: #fefefe; padding: 0.8mm 1.5mm; font-size: 7pt; min-height: 4mm; vertical-align: middle; }
.span3 { /* handled via colspan in table layout */ }

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

    # Determine pairs per row: 6-col = 3 label-value pairs, 4-col = 2 pairs
    pairs_per_row = 3 if columns == 6 else 2

    rows_html: List[str] = []
    current_row: List[str] = []
    col_pos = 0

    for field in fields:
        label = field.get("label", "")
        variable = field.get("variable", "")
        is_span = variable in span_fields

        if is_span and columns == 6:
            # Spanning field takes remaining columns in current row
            if col_pos > 0:
                # Pad remaining cells with empty
                while col_pos < pairs_per_row:
                    current_row.append('<td class="lbl"></td><td class="val"></td>')
                    col_pos += 1
                rows_html.append(f'<tr>{"".join(current_row)}</tr>')
                current_row = []
                col_pos = 0
            # Span field gets full row with colspan
            remaining_val_cols = pairs_per_row * 2 - 1
            current_row.append(
                f'<td class="lbl">{label}:</td>'
                f'<td class="val" colspan="{remaining_val_cols}">'
                f"{{{{ report.data.get('{variable}', '-') }}}}</td>"
            )
            rows_html.append(f'<tr>{"".join(current_row)}</tr>')
            current_row = []
            col_pos = 0
        else:
            current_row.append(
                f'<td class="lbl">{label}:</td>'
                f'<td class="val">{{{{ report.data.get(\'{variable}\', \'-\') }}}}</td>'
            )
            col_pos += 1
            if col_pos >= pairs_per_row:
                rows_html.append(f'<tr>{"".join(current_row)}</tr>')
                current_row = []
                col_pos = 0

    # Flush remaining cells
    if current_row:
        while col_pos < pairs_per_row:
            current_row.append('<td class="lbl"></td><td class="val"></td>')
            col_pos += 1
        rows_html.append(f'<tr>{"".join(current_row)}</tr>')

    return f'<table class="{css_class}">{"".join(rows_html)}</table>'


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


def _normalize_percentages(values: Any, count: int) -> List[float]:
    if count <= 0:
        return []

    raw: List[float] = []
    if isinstance(values, list):
        for idx in range(count):
            try:
                parsed = float(values[idx])
            except (TypeError, ValueError, IndexError):
                parsed = 0.0
            raw.append(parsed if parsed > 0 else 0.0)
    else:
        raw = [0.0 for _ in range(count)]

    total = sum(raw)
    if total <= 0:
        return [100.0 / count for _ in range(count)]

    normalized = [(value / total) * 100.0 for value in raw]
    normalized[-1] += 100.0 - sum(normalized)
    return normalized


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
# fix: imagen-cortada — added object-fit: contain for WeasyPrint
PHOTO_IMAGE_STYLE = "max-width: 100%; max-height: 85%; margin: 0 auto; display: block; object-fit: contain;"
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
    # Check photoConfig in metadata (canvas editor) or direct metadata keys (block editor)
    photo_config = _get_meta(block, "photoConfig") or {}
    show_labels = photo_config.get("showLabels", _get_meta(block, "showLabels", False))
    labels = photo_config.get("labels", _get_meta(block, "labels", []))
    panel_title = str(photo_config.get("panelTitle", _get_meta(block, "panelTitle", "")) or "").strip()
    tag_html = f'<span class="photo-tag">{panel_title}</span>' if panel_title else ""
    configured_count = _normalize_photo_count(
        photo_config.get("count", _get_meta(block, "count", 0))
    )
    odd_position = _normalize_odd_position(
        photo_config.get("oddPosition",
            _get_meta(block, "oddPosition", _get_meta(block, "oddAlignment", "center")))
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
    layout = (block.metadata or {}).get("layout")
    style_meta = (block.metadata or {}).get("style") or {}

    # Canvas-style text with absolute positioning
    if layout and ("x" in layout or "y" in layout):
        layout_css = _layout_style(block)
        style_css = _style_css(block)
        return (
            f'<div class="element text" style="{layout_css} {style_css} overflow: hidden;">'
            f'{content}'
            '</div>'
        )

    # Block-style text (flow layout)
    font_size = style_meta.get("fontSize", _get_meta(block, "fontSize", 9))
    align = style_meta.get("textAlign", _get_meta(block, "align", "left"))
    bold = _get_meta(block, "bold", False) or style_meta.get("fontWeight") == "bold"
    weight = "font-weight: 700;" if bold else ""
    color_css = f"color: {style_meta['color']};" if style_meta.get("color") else ""
    return (
        f'<div class="text-block" style="font-size: {font_size}pt; text-align: {align}; {weight} {color_css}">'
        f'{content}'
        '</div>'
    )


def _compile_table(block: EditorBlock) -> str:
    metadata = block.metadata or {}
    table_meta = metadata.get("tableData") if isinstance(metadata.get("tableData"), dict) else {}
    layout = metadata.get("layout") if isinstance(metadata.get("layout"), dict) else {}

    def _to_positive_int(value: Any, default: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return parsed if parsed > 0 else default

    def _to_string_matrix(value: Any) -> List[List[str]]:
        if not isinstance(value, list):
            return []
        matrix: List[List[str]] = []
        for row in value:
            if isinstance(row, list):
                matrix.append(["" if cell is None else str(cell) for cell in row])
            else:
                matrix.append([])
        return matrix

    has_table_cells_shape = any(
        key in table_meta for key in ("rowCount", "colCount", "data", "colWidths", "rowHeights")
    ) or any(
        key in metadata for key in ("rowCount", "colCount", "data", "colWidths", "rowHeights")
    )

    if has_table_cells_shape:
        table_data = _to_string_matrix(table_meta.get("data", metadata.get("data", [])))

        inferred_row_count = len(table_data) if table_data else 2
        inferred_col_count = max((len(row) for row in table_data), default=0) or 2

        row_count = _to_positive_int(
            table_meta.get("rowCount", metadata.get("rowCount")),
            inferred_row_count,
        )
        col_count = _to_positive_int(
            table_meta.get("colCount", metadata.get("colCount")),
            inferred_col_count,
        )
        border_color = _escape_html(table_meta.get("borderColor") or metadata.get("borderColor") or "#cbd5e1")
        col_widths = _normalize_percentages(
            table_meta.get("colWidths", metadata.get("colWidths", [])),
            col_count,
        )
        row_heights = _normalize_percentages(
            table_meta.get("rowHeights", metadata.get("rowHeights", [])),
            row_count,
        )

        colgroup_html = (
            "<colgroup>"
            + "".join(f'<col style="width: {width:.4f}%;">' for width in col_widths)
            + "</colgroup>"
        )

        body_rows: List[str] = []
        for r in range(row_count):
            row_height = row_heights[r] if r < len(row_heights) else (100.0 / row_count if row_count > 0 else 100.0)
            cells: List[str] = []
            for c in range(col_count):
                text = table_data[r][c] if r < len(table_data) and c < len(table_data[r]) else ""
                cells.append(
                    f'<td style="border: 1px solid {border_color}; padding: 2px;">'
                    f'{_escape_html(text)}</td>'
                )
            body_rows.append(f'<tr style="height: {row_height:.4f}%;">{"".join(cells)}</tr>')

        table_html = (
            '<table class="data-table" style="width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed;">'
            f"{colgroup_html}"
            f'<tbody>{"".join(body_rows)}</tbody>'
            '</table>'
        )

        if layout:
            x = _to_float(layout.get("x"), 0.0)
            y = _to_float(layout.get("y"), 0.0)
            w = _to_float(layout.get("width"), 100.0)
            h = _to_float(layout.get("height"), 30.0)
            return (
                '<div class="element table" '
                f'style="position: absolute; left: {x}mm; top: {y}mm; width: {w}mm; height: {h}mm;">'
                f"{table_html}"
                '</div>'
            )

        return table_html

    # Legacy block-table support (headers + rows)
    headers: List[str] = _get_meta(block, "headers", ["Campo", "Valor"])
    rows: List[List[str]] = _get_meta(block, "rows", [])
    border_color = _escape_html(_get_meta(block, "borderColor", "#cbd5e1") or "#cbd5e1")
    header_bg = _escape_html(_get_meta(block, "headerBg", "#f5f5f5") or "#f5f5f5")

    header_cells = "".join(f"<th>{_escape_html('' if h is None else h)}</th>" for h in headers)
    body_rows = []
    for row in rows:
        safe_row = row if isinstance(row, list) else []
        cells = "".join(f"<td>{_escape_html('' if c is None else c)}</td>" for c in safe_row)
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


# ─── Canvas element helpers ───


def _layout_style(block: EditorBlock) -> str:
    """Generate position: absolute style from layout metadata (canvas elements)."""
    layout = (block.metadata or {}).get("layout") or {}
    if not layout:
        return ""
    x = _to_float(layout.get("x"), 0.0)
    y = _to_float(layout.get("y"), 0.0)
    w = _to_float(layout.get("width"), 0.0)
    h = _to_float(layout.get("height"), 0.0)
    rotation = _to_float(layout.get("rotation"), 0.0)

    parts = [
        f"position: absolute; left: {x}mm; top: {y}mm;",
        f"width: {w}mm; height: {h}mm;",
    ]
    if rotation:
        parts.append(f"transform: rotate({rotation}deg); transform-origin: center center;")
    return " ".join(parts)


def _style_css(block: EditorBlock) -> str:
    """Generate inline CSS from style metadata (canvas elements)."""
    style = (block.metadata or {}).get("style") or {}
    parts: List[str] = []
    if style.get("backgroundColor") and style["backgroundColor"] != "transparent":
        parts.append(f"background-color: {style['backgroundColor']};")
    if style.get("color"):
        parts.append(f"color: {style['color']};")
    if style.get("fontSize"):
        parts.append(f"font-size: {style['fontSize']}pt;")
    if style.get("fontFamily"):
        parts.append(f"font-family: '{style['fontFamily']}', sans-serif;")
    if style.get("fontWeight"):
        parts.append(f"font-weight: {style['fontWeight']};")
    if style.get("textAlign"):
        parts.append(f"text-align: {style['textAlign']};")
    if style.get("textTransform"):
        parts.append(f"text-transform: {style['textTransform']};")
    if style.get("lineHeight"):
        parts.append(f"line-height: {style['lineHeight']};")
    if style.get("letterSpacing"):
        parts.append(f"letter-spacing: {style['letterSpacing']}px;")
    if style.get("padding"):
        parts.append(f"padding: {style['padding']}px;")
    if style.get("borderWidth") and style.get("borderStyle") != "none":
        bw = style["borderWidth"]
        bs = style.get("borderStyle", "solid")
        bc = style.get("borderColor", "#000")
        parts.append(f"border: {bw}px {bs} {bc};")
    if style.get("borderRadius"):
        parts.append(f"border-radius: {style['borderRadius']}mm;")
    if style.get("opacity") is not None and float(style.get("opacity", 1)) != 1:
        parts.append(f"opacity: {style['opacity']};")
    return " ".join(parts)


# fix: imagen-cortada — Generate WeasyPrint-compatible image CSS with objectFit fallback
def _image_css(object_fit: str, width_mm: float = 0, height_mm: float = 0) -> str:
    """Generate inline CSS for images that works reliably in WeasyPrint."""
    base = "display: block"
    if object_fit == "fill":
        return f"{base}; width: 100%; height: 100%; object-fit: fill"
    if object_fit == "none":
        return f"{base}; object-fit: none"
    if object_fit == "cover":
        return f"{base}; width: 100%; height: 100%; object-fit: cover"
    # contain (default): add max-width/height as WeasyPrint fallback
    css = f"{base}; width: 100%; height: 100%; object-fit: contain"
    if width_mm > 0:
        css += f"; max-width: {width_mm}mm"
    if height_mm > 0:
        css += f"; max-height: {height_mm}mm"
    return css


def _compile_heading(block: EditorBlock) -> str:
    """Canvas heading element."""
    layout = _layout_style(block)
    style = _style_css(block)
    content = block.content or _get_meta(block, "content", "")
    return f'<div class="element heading" style="{layout} {style} overflow: hidden;">{content}</div>'


def _compile_logo(block: EditorBlock) -> str:
    """Canvas logo element with Jinja2 variable binding."""
    layout = _layout_style(block)
    style = _style_css(block)
    image_url = _get_meta(block, "imageUrl", "")
    variable_name = _get_meta(block, "variableName", "logo_left")

    # fix: imagen-cortada — extract dimensions for CSS fallback
    layout_meta = (block.metadata or {}).get("layout") or {}
    w = _to_float(layout_meta.get("width"), 0)
    h = _to_float(layout_meta.get("height"), 0)
    img_css = _image_css("contain", w, h)

    if image_url:
        safe_url = url_to_base64(image_url)  # fix: imagen-cortada
        return (
            f'<div class="element logo" style="{layout} {style} overflow: hidden;">'
            f'<img src="{_escape_html(safe_url)}" style="{img_css}" />'
            '</div>'
        )
    return (
        f'{{% if {variable_name} %}}'
        f'<div class="element logo" style="{layout} {style} overflow: hidden;">'
        f'<img src="{{{{ {variable_name} }}}}" style="{img_css}" />'
        '</div>'
        '{% endif %}'
    )


def _compile_canvas_image(block: EditorBlock) -> str:
    """Canvas image element."""
    layout = _layout_style(block)
    style = _style_css(block)
    image_url = _get_meta(block, "imageUrl", "")
    # fix: imagen-cortada — default to contain instead of cover
    object_fit = ((block.metadata or {}).get("style") or {}).get("objectFit", "contain")

    # fix: imagen-cortada — extract dimensions for CSS fallback
    layout_meta = (block.metadata or {}).get("layout") or {}
    w = _to_float(layout_meta.get("width"), 0)
    h = _to_float(layout_meta.get("height"), 0)
    img_css = _image_css(object_fit, w, h)

    if image_url:
        safe_url = url_to_base64(image_url)  # fix: imagen-cortada
        return (
            f'<div class="element image" style="{layout} {style} overflow: hidden;">'
            f'<img src="{_escape_html(safe_url)}" style="{img_css}" />'
            '</div>'
        )
    return f'<div class="element image" style="{layout} {style} overflow: hidden;">{block.content or ""}</div>'


def _compile_rectangle(block: EditorBlock) -> str:
    """Canvas rectangle element — rendered via CSS only."""
    layout = _layout_style(block)
    style = _style_css(block)
    shape_config = _get_meta(block, "shapeConfig") or {}
    fill = shape_config.get("fill", "")
    stroke = shape_config.get("stroke", "")
    stroke_width = _to_float(shape_config.get("strokeWidth"), 0)
    extra = ""
    if fill:
        extra += f"background-color: {fill};"
    if stroke and stroke_width:
        extra += f"border: {stroke_width}px solid {stroke};"
    return f'<div class="element rectangle" style="{layout} {style} {extra}"></div>'


def _compile_circle(block: EditorBlock) -> str:
    """Canvas circle element."""
    layout = _layout_style(block)
    style = _style_css(block)
    shape_config = _get_meta(block, "shapeConfig") or {}
    fill = shape_config.get("fill", "")
    stroke = shape_config.get("stroke", "")
    stroke_width = _to_float(shape_config.get("strokeWidth"), 0)
    extra = "border-radius: 50%;"
    if fill:
        extra += f"background-color: {fill};"
    if stroke and stroke_width:
        extra += f"border: {stroke_width}px solid {stroke};"
    return f'<div class="element circle" style="{layout} {style} {extra}"></div>'


def _compile_shape(block: EditorBlock) -> str:
    """Canvas shape element (line, arrow, rectangle, circle)."""
    shape_config = _get_meta(block, "shapeConfig") or {}
    kind = shape_config.get("kind", "rectangle")
    if kind == "circle":
        return _compile_circle(block)
    if kind == "line":
        layout = _layout_style(block)
        stroke = shape_config.get("stroke", "#000")
        stroke_width = _to_float(shape_config.get("strokeWidth"), 1)
        return (
            f'<div class="element shape" style="{layout} overflow: hidden;">'
            f'<div style="width: 100%; height: 0; border-top: {stroke_width}px solid {stroke};"></div>'
            '</div>'
        )
    if kind == "arrow":
        layout = _layout_style(block)
        stroke = shape_config.get("stroke", "#000")
        stroke_width = _to_float(shape_config.get("strokeWidth"), 2)
        return (
            f'<div class="element shape" style="{layout} overflow: hidden;">'
            f'<svg viewBox="0 0 100 50" preserveAspectRatio="none" style="width: 100%; height: 100%;">'
            f'<defs><marker id="ah" orient="auto" markerWidth="4" markerHeight="4" refX="3" refY="2">'
            f'<path d="M0,0 V4 L4,2 Z" fill="{stroke}"/></marker></defs>'
            f'<line x1="2" y1="25" x2="94" y2="25" stroke="{stroke}" stroke-width="{stroke_width}" marker-end="url(#ah)"/>'
            '</svg></div>'
        )
    # Default: rectangle
    return _compile_rectangle(block)


def _compile_divider(block: EditorBlock) -> str:
    """Canvas divider element."""
    layout = _layout_style(block)
    div_config = _get_meta(block, "dividerConfig") or {}
    orientation = div_config.get("orientation", "horizontal")
    color = div_config.get("color", "#374151")
    thickness = _to_float(div_config.get("thickness"), 1)
    line_style = div_config.get("style", "solid")

    if orientation == "vertical":
        inner = f'<div style="width: 0; height: 100%; border-left: {thickness}px {line_style} {color};"></div>'
    else:
        inner = f'<div style="width: 100%; height: 0; border-top: {thickness}px {line_style} {color};"></div>'

    return f'<div class="element divider" style="{layout} overflow: hidden;">{inner}</div>'


def _compile_variable(block: EditorBlock) -> str:
    """Canvas variable element with Jinja2 expression."""
    layout = _layout_style(block)
    style = _style_css(block)
    variable_name = _get_meta(block, "variableName", "variable")
    return f'<div class="element variable" style="{layout} {style} overflow: hidden;">{{{{ {variable_name} }}}}</div>'


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
    "heading": _compile_heading,
    "table": _compile_table,
    "signature": _compile_signature,
    "signatures": _compile_signatures,
    "footer": _compile_footer,
    "spacer": _compile_spacer,
    "logo": _compile_logo,
    "image": _compile_canvas_image,
    "rectangle": _compile_rectangle,
    "circle": _compile_circle,
    "shape": _compile_shape,
    "divider": _compile_divider,
    "variable": _compile_variable,
    "protected": lambda b: (
        f'<div class="text-block protected-block" '
        f'data-block-id="{b.id}" '
        'data-block-type="protected" '
        'data-protected="true" '
        'style="border-left: 3px solid #b91c1c; padding-left: 8px;">'
        f'{b.content or ""}'
        '</div>'
    ),
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
    """Detect if this template was created with the block or canvas editor (vs legacy)."""
    source = template_json.metadata.get("source", "")
    if source in ("block-editor", "canvas-editor-v3"):
        return True
    for section in template_json.sections:
        for block in section.blocks:
            if block.type in ("header", "info-bar", "info_bar", "section-title",
                              "section_title", "data-grid", "data_grid",
                              "photo-grid", "photo_grid", "signatures",
                              "footer", "spacer",
                              # Canvas editor types
                              "heading", "logo", "rectangle", "circle",
                              "shape", "divider", "variable", "container"):
                return True
    return False


# ─── Canvas compilation pipeline (matches frontend exportToJinja2 output) ─────


CANVAS_CSS_TEMPLATE = """\
    @page {{
      size: {width}mm {height}mm;
      margin: 0;
    }}

    * {{
      box-sizing: border-box;
    }}

    body {{
      margin: 0;
      padding: 0;
      font-family: Arial, 'Segoe UI', Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}

    .template-container {{
      position: relative;
      width: {width}mm;
      height: {height}mm;
      background: {background};
      overflow: hidden;
      page-break-after: always;
    }}

    .element {{
      position: absolute;
      overflow: hidden;
    }}

    /* WeasyPrint-compatible photo grid using table layout */
    .photo-grid-table {{
      width: 100%;
      height: 100%;
      border-collapse: separate;
      border-spacing: 2mm;
      table-layout: fixed;
    }}

    .photo-cell {{
      text-align: center;
      vertical-align: middle;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 1.4mm;
      padding: 1mm;
    }}

    .photo-cell img {{
      max-width: 100%;
      max-height: 85%;
      display: block;
      margin: 0 auto;
      object-fit: contain;
    }}

    .photo-cell-empty {{
      border: 1px solid transparent;
      background: transparent;
    }}

    .photo-label {{
      font-weight: 700;
      font-size: 7.5pt;
      text-transform: uppercase;
      margin-top: 1mm;
      letter-spacing: 0.02em;
    }}

    table {{
      width: 100%;
      border-collapse: collapse;
    }}

    th, td {{
      border: 1px solid #d1d5db;
      padding: 1.5mm 2mm;
      font-size: 7.5pt;
    }}

    th {{
      background: #f3f4f6;
      font-weight: 700;
      color: #555;
    }}

    .signature-line {{
      border-top: 1px solid #374151;
      width: 100%;
      padding-top: 2mm;
      text-align: center;
    }}

    .signature-title {{
      font-weight: 700;
      font-size: 8pt;
      text-transform: uppercase;
      color: #333;
    }}

    .signature-name {{
      font-size: 7.5pt;
      color: #555;
    }}"""


def _escape_html_preserve_jinja(text: str) -> str:
    """Escape HTML entities while preserving Jinja2 {{ }} expressions."""
    result: List[str] = []
    pos = 0
    for match in re.finditer(r'\{\{[^}]*\}\}', text):
        before = text[pos:match.start()]
        result.append(_escape_html(before))
        result.append(match.group())
        pos = match.end()
    result.append(_escape_html(text[pos:]))
    return ''.join(result)


def _canvas_element_style(block: EditorBlock) -> str:
    """Generate full inline style for a canvas element.

    Mirrors frontend ``generateElementStyle()`` — positioning, typography,
    borders, opacity, rotation — all in one inline string.
    The ``position: absolute`` is NOT included here because the CSS class
    ``.element`` already sets it (matching frontend behaviour).
    """
    layout = (block.metadata or {}).get("layout") or {}
    style_meta = (block.metadata or {}).get("style") or {}

    parts: List[str] = [
        f"left: {_to_float(layout.get('x'), 0)}mm",
        f"top: {_to_float(layout.get('y'), 0)}mm",
        f"width: {_to_float(layout.get('width'), 0)}mm",
        f"height: {_to_float(layout.get('height'), 0)}mm",
        f"z-index: {int(_to_float(layout.get('zIndex'), 1))}",
    ]

    # Background colour — skip default/neutral backgrounds on media elements
    is_media = block.type in ("logo", "image")
    bg = str(style_meta.get("backgroundColor", "") or "")
    if bg and bg.lower().strip() != "transparent":
        neutral_bgs = {"", "transparent", "#fff", "#ffffff", "#f3f4f6", "#e5e7eb"}
        if not is_media or bg.lower().strip() not in neutral_bgs:
            parts.append(f"background-color: {bg}")

    if style_meta.get("color"):
        parts.append(f"color: {style_meta['color']}")
    if style_meta.get("fontSize"):
        parts.append(f"font-size: {style_meta['fontSize']}pt")
    if style_meta.get("fontFamily"):
        parts.append(f"font-family: '{style_meta['fontFamily']}', sans-serif")
    if style_meta.get("fontWeight"):
        parts.append(f"font-weight: {style_meta['fontWeight']}")
    if style_meta.get("textAlign"):
        parts.append(f"text-align: {style_meta['textAlign']}")
    if style_meta.get("textTransform"):
        parts.append(f"text-transform: {style_meta['textTransform']}")
    if style_meta.get("lineHeight"):
        parts.append(f"line-height: {style_meta['lineHeight']}")
    if style_meta.get("letterSpacing"):
        parts.append(f"letter-spacing: {style_meta['letterSpacing']}px")
    if style_meta.get("padding"):
        parts.append(f"padding: {style_meta['padding']}px")

    # Full border shorthand — skip defaults on media elements
    bw = style_meta.get("borderWidth")
    if bw and style_meta.get("borderStyle") != "none" and not is_media:
        parts.append(
            f"border: {bw}px {style_meta.get('borderStyle', 'solid')} "
            f"{style_meta.get('borderColor', '#000')}"
        )

    # Individual border sides
    if not bw:
        btw = style_meta.get("borderTopWidth")
        if btw:
            parts.append(
                f"border-top: {btw}px {style_meta.get('borderStyle', 'solid')} "
                f"{style_meta.get('borderColor', '#000')}"
            )
        bbw = style_meta.get("borderBottomWidth")
        if bbw:
            parts.append(
                f"border-bottom: {bbw}px {style_meta.get('borderStyle', 'solid')} "
                f"{style_meta.get('borderColor', '#000')}"
            )

    br = style_meta.get("borderRadius")
    if br:
        unit = "%" if block.type == "circle" else "mm"
        parts.append(f"border-radius: {br}{unit}")

    opacity = style_meta.get("opacity")
    if opacity is not None and float(opacity) != 1:
        parts.append(f"opacity: {opacity}")

    rotation = _to_float(layout.get("rotation"), 0.0)
    if rotation:
        parts.append(f"transform: rotate({rotation}deg)")
        parts.append("transform-origin: center center")

    return "; ".join(parts)


def _build_canvas_photo_grid(
    count: int,
    odd_position: str,
    labels: List[str],
    show_labels: bool,
) -> str:
    """Build a WeasyPrint-compatible photo grid table (matches frontend buildPhotoGridTable)."""
    count = max(int(count), 0) if isinstance(count, (int, float)) else 0
    if count == 0:
        count = 2
    if odd_position not in ("left", "center", "right"):
        odd_position = "center"

    # Organise photos into rows of 2
    rows: List[Dict[str, Any]] = []
    for i in range(0, count - 1, 2):
        rows.append({"type": "pair", "slots": [i, i + 1]})

    if count % 2 == 1:
        last = count - 1
        if odd_position == "center":
            rows.append({"type": "center", "slot": last})
        elif odd_position == "right":
            rows.append({"type": "pair", "slots": [None, last]})
        else:
            rows.append({"type": "pair", "slots": [last, None]})

    row_height = f"{100 // len(rows)}%" if rows else "100%"
    html = '<table class="photo-grid-table"><tbody>'

    for row in rows:
        html += f'<tr style="height: {row_height};">'

        if row["type"] == "center":
            i = row["slot"]
            label = labels[i] if i < len(labels) and labels[i] else f"Foto {i + 1}"
            label_html = (
                f'<div class="photo-label">{_escape_html(label)}</div>' if show_labels else ""
            )
            html += '<td class="photo-cell-empty" style="width: 25%;"></td>'
            html += '<td class="photo-cell" colspan="1" style="width: 50%;">'
            html += f'{{% if report.images|length > {i} %}}'
            html += (
                f'<img src="{{{{ report.images[{i}].path }}}}" '
                f'alt="{{{{ report.images[{i}].name | default(\'{_escape_html(label)}\') }}}}" />'
            )
            html += '{% else %}<span style="color:#999;">Sin foto</span>{% endif %}'
            html += label_html
            html += '</td>'
            html += '<td class="photo-cell-empty" style="width: 25%;"></td>'
        else:
            for slot in row["slots"]:
                if slot is None:
                    html += '<td class="photo-cell-empty" style="width: 50%;"></td>'
                else:
                    label = labels[slot] if slot < len(labels) and labels[slot] else f"Foto {slot + 1}"
                    label_html = (
                        f'<div class="photo-label">{_escape_html(label)}</div>' if show_labels else ""
                    )
                    html += '<td class="photo-cell" style="width: 50%;">'
                    html += f'{{% if report.images|length > {slot} %}}'
                    html += (
                        f'<img src="{{{{ report.images[{slot}].path }}}}" '
                        f'alt="{{{{ report.images[{slot}].name | default(\'{_escape_html(label)}\') }}}}" />'
                    )
                    html += '{% else %}<span style="color:#999;">Sin foto</span>{% endif %}'
                    html += label_html
                    html += '</td>'

        html += '</tr>'

    html += '</tbody></table>'
    return html


def _canvas_element_content(block: EditorBlock) -> Optional[str]:
    """Generate inner HTML content for a canvas element.

    Mirrors frontend ``generateElementContent()``.
    Returns ``None`` for element types that should be skipped entirely (groups).
    Returns empty string for CSS-only elements (rectangle, circle, container).
    """
    t = block.type
    meta = block.metadata or {}

    if t == "group":
        return None

    if t in ("text", "heading"):
        return _escape_html(block.content or "")

    if t == "variable":
        vn = _get_meta(block, "variableName", "variable")
        return f"{{{{ {vn} }}}}"

    if t == "logo":
        image_url = _get_meta(block, "imageUrl", "")
        variable_name = _get_meta(block, "variableName", "logo_left")
        layout_meta = meta.get("layout") or {}
        w = _to_float(layout_meta.get("width"), 0)
        h = _to_float(layout_meta.get("height"), 0)
        img_css = _image_css("contain", w, h)
        if image_url:
            safe_url = url_to_base64(image_url)
            return f'<img src="{_escape_html(safe_url)}" style="{img_css}" />'
        return (
            f'{{% if {variable_name} %}}'
            f'<img src="{{{{ {variable_name} }}}}" style="{img_css}" />'
            '{% endif %}'
        )

    if t == "image":
        image_url = _get_meta(block, "imageUrl", "")
        if image_url:
            style_meta = meta.get("style") or {}
            object_fit = style_meta.get("objectFit", "contain")
            layout_meta = meta.get("layout") or {}
            w = _to_float(layout_meta.get("width"), 0)
            h = _to_float(layout_meta.get("height"), 0)
            img_css = _image_css(object_fit, w, h)
            safe_url = url_to_base64(image_url)
            return f'<img src="{_escape_html(safe_url)}" style="{img_css}" />'
        return ""

    if t == "photo-grid":
        photo_config = _get_meta(block, "photoConfig") or {}
        count = photo_config.get("count", 2)
        odd_position = photo_config.get("oddPosition", "center")
        show_labels = photo_config.get("showLabels", False)
        labels = photo_config.get("labels", [])
        panel_title = (block.content or "").strip()
        title_html = ""
        if panel_title:
            title_html = (
                '<div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 1mm; '
                f'text-transform: uppercase;">{_escape_html(panel_title)}</div>'
            )
        grid_html = _build_canvas_photo_grid(count, odd_position, labels, show_labels)
        return title_html + grid_html

    if t == "table":
        table_meta = meta.get("tableData") if isinstance(meta.get("tableData"), dict) else {}
        # Merge top-level metadata keys used by table data
        for key in ("rowCount", "colCount", "data", "colWidths", "rowHeights", "borderColor"):
            if key not in table_meta and key in meta:
                table_meta[key] = meta[key]

        data_matrix = table_meta.get("data", [])
        if not isinstance(data_matrix, list):
            data_matrix = []

        inferred_rows = len(data_matrix) if data_matrix else 2
        inferred_cols = max((len(r) for r in data_matrix if isinstance(r, list)), default=0) or 2

        row_count = int(table_meta.get("rowCount", inferred_rows) or inferred_rows)
        col_count = int(table_meta.get("colCount", inferred_cols) or inferred_cols)
        border_color = _escape_html(str(table_meta.get("borderColor", "#cbd5e1") or "#cbd5e1"))
        col_widths = _normalize_percentages(table_meta.get("colWidths", []), col_count)
        row_heights = _normalize_percentages(table_meta.get("rowHeights", []), row_count)

        table_html = (
            '<table style="width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed;">'
            '<colgroup>'
        )
        for w_pct in col_widths:
            table_html += f'<col style="width: {w_pct:.4f}%;">'
        table_html += '</colgroup><tbody>'

        for r in range(row_count):
            rh = row_heights[r] if r < len(row_heights) else (100.0 / row_count)
            table_html += f'<tr style="height: {rh:.4f}%;">'
            for c in range(col_count):
                cell = ""
                if r < len(data_matrix) and isinstance(data_matrix[r], list) and c < len(data_matrix[r]):
                    cell = data_matrix[r][c] if data_matrix[r][c] is not None else ""
                cell_html = _escape_html_preserve_jinja(str(cell)).replace("\n", "<br>")
                table_html += (
                    f'<td style="border: 1px solid {border_color}; '
                    f'padding: 1.5mm 2mm; vertical-align: middle;">{cell_html}</td>'
                )
            table_html += '</tr>'
        table_html += '</tbody></table>'
        return table_html

    if t == "signature":
        sig_config = meta.get("signatureConfig")
        legacy_sig = {}
        if isinstance(sig_config, list) and sig_config:
            legacy_sig = sig_config[0] if isinstance(sig_config[0], dict) else {}
        title = meta.get("title", legacy_sig.get("title", "SUPERVISOR"))
        name = meta.get("signatureName", meta.get("name", legacy_sig.get("name", "")))
        name_html = (
            f'<div class="signature-name">{_escape_html(str(name))}</div>' if name else ""
        )
        return (
            '<div class="signature-line">'
            f'<div class="signature-title">{_escape_html(str(title or "SUPERVISOR"))}</div>'
            f'{name_html}'
            '</div>'
        )

    if t == "divider":
        div_config = _get_meta(block, "dividerConfig") or {}
        orientation = div_config.get("orientation", "horizontal")
        color = div_config.get("color", "#374151")
        thickness = _to_float(div_config.get("thickness"), 1)
        line_style = div_config.get("style", "solid")
        if orientation == "vertical":
            return f'<div style="width: 0; height: 100%; border-left: {thickness}px {line_style} {color};"></div>'
        return f'<div style="width: 100%; height: 0; border-top: {thickness}px {line_style} {color};"></div>'

    if t in ("rectangle", "circle", "container"):
        return ""

    if t == "shape":
        shape_config = _get_meta(block, "shapeConfig") or {}
        kind = shape_config.get("kind", "rectangle")
        if kind == "line":
            stroke = shape_config.get("stroke", "#000")
            stroke_width = _to_float(shape_config.get("strokeWidth"), 1)
            return f'<div style="width: 100%; height: 0; border-top: {stroke_width}px solid {stroke};"></div>'
        if kind == "arrow":
            stroke = shape_config.get("stroke", "#000")
            stroke_width = _to_float(shape_config.get("strokeWidth"), 2)
            return (
                '<svg viewBox="0 0 100 50" preserveAspectRatio="none" style="width: 100%; height: 100%;">'
                f'<defs><marker id="ah" orient="auto" markerWidth="4" markerHeight="4" refX="3" refY="2">'
                f'<path d="M0,0 V4 L4,2 Z" fill="{stroke}"/></marker></defs>'
                f'<line x1="2" y1="25" x2="94" y2="25" stroke="{stroke}" '
                f'stroke-width="{stroke_width}" marker-end="url(#ah)"/>'
                '</svg>'
            )
        return ""

    if t == "qr":
        qr_config = _get_meta(block, "qrConfig") or {}
        qr_content = _escape_html(str(qr_config.get("content", "")))
        return (
            '<div style="width: 100%; height: 100%; display: flex; align-items: center; '
            f'justify-content: center; border: 1px dashed #ccc; color: #999; font-size: 8pt;">'
            f'[QR: {qr_content}]</div>'
        )

    return ""


def _compile_canvas_template(template_json: TemplateJson) -> str:
    """Compile a canvas-editor-v3 template to HTML/Jinja2.

    Produces output that matches the frontend ``exportToJinja2()`` function
    so that PreviewPanel.jsx can process it identically.
    """
    page_settings = template_json.metadata.get("pageSettings") or {}
    page_w = page_settings.get("width", 210)
    page_h = page_settings.get("height", 297)
    page_bg = page_settings.get("backgroundColor", "#ffffff")

    css = CANVAS_CSS_TEMPLATE.format(width=page_w, height=page_h, background=page_bg)

    # Collect all blocks, filter invisible, sort by zIndex
    blocks: List[EditorBlock] = []
    for section in template_json.sections:
        for block in section.blocks:
            visible = (block.metadata or {}).get("visible")
            if visible is False:
                continue
            blocks.append(block)

    blocks.sort(
        key=lambda b: _to_float(((b.metadata or {}).get("layout") or {}).get("zIndex"), 0)
    )

    # Generate element HTML
    elements_html: List[str] = []
    for block in blocks:
        content = _canvas_element_content(block)
        if content is None:
            continue
        style = _canvas_element_style(block)
        elements_html.append(
            f'    <div class="element {block.type}" style="{style}">{content}</div>'
        )

    page_content = "\n".join(elements_html)

    template_name = _escape_html(str(template_json.metadata.get("canvasDocumentId", "Template")))

    return (
        '<!DOCTYPE html>\n'
        '<html>\n'
        '<head>\n'
        '  <meta charset="UTF-8">\n'
        f"  <title>{{{{ report.title | default('{template_name}') }}}}</title>\n"
        f'  <style>\n{css}\n  </style>\n'
        '</head>\n'
        '<body>\n'
        '  {% for report in reports %}\n'
        '  <div class="template-container">\n'
        f'{page_content}\n'
        '  </div>\n'
        '  {% endfor %}\n'
        '</body>\n'
        '</html>'
    )


def compile_canvas_to_html(canvas_doc: dict, variables: Optional[dict] = None) -> str:
    """Compile a canvas document dict to production HTML."""
    from .utils import url_to_base64
    import re

    variables = variables or {}
    
    # IMPORTANTE: Valores base de dimensions
    page_width = canvas_doc.get('pageSize', {}).get('width', 210)
    page_height = canvas_doc.get('pageSize', {}).get('height', 297)

    elements = canvas_doc.get("elements", [])
    if "sections" in canvas_doc:
        elements = []
        for sec in canvas_doc.get("sections", []):
            elements.extend(sec.get("blocks", []))

    # VALIDACIONES 2) Loguear dimensiones de página para debug:
    print(f"[compiler] Page: {page_width}mm x {page_height}mm, Elements: {len(elements)}")

    def resolve_logo_src(element: dict, variables: dict) -> str:
        # Intentar primero el imageUrl guardado en el elemento del canvas
        src = element.get('imageUrl', '')
        
        # Detectar si es logo izquierdo o derecho
        elem_id = (element.get('id', '') + element.get('variableName', '')).lower()
        
        if 'right' in elem_id or 'der' in elem_id:
            # Logo derecho: buscar en variables en orden de prioridad
            src = (variables.get('logo_right') or
                   variables.get('logoRight') or
                   variables.get('logo_der') or
                   src or '')
        elif 'left' in elem_id or 'izq' in elem_id:
            # Logo izquierdo
            src = (variables.get('logo_left') or
                   variables.get('logoLeft') or
                   variables.get('logo_izq') or
                   src or '')
        
        # Si src es URL externa o ruta relativa → convertir a base64
        if src and not src.startswith('data:'):
            try:
                from .utils import url_to_base64
                src = url_to_base64(src)
            except Exception as e:
                print(f"[compiler] Warning: no se pudo convertir logo a base64: {e}")
                src = ''

        return src

    elementos_html = []
    
    for el in elements:
        t = str(el.get("type", "text"))
        meta = el.get("metadata", {})
        
        if "layout" in meta:
            pos = meta.get("layout", {})
            size = pos
        else:
            pos = el.get("position", {})
            size = el.get("size", {})
            
        x = float(pos.get("x", 0))
        y = float(pos.get("y", 0))
        w = float(size.get("width", 100))
        h = float(size.get("height", 100))
        
        style = el.get("style", meta.get("style", {}))
        z_index = style.get("zIndex", meta.get("layout", {}).get("zIndex", 1))
        rot = el.get("rotation", meta.get("layout", {}).get("rotation", 0))
        
        base_style = f"position: absolute; left: {x}mm; top: {y}mm; width: {w}mm; height: {h}mm; z-index: {z_index};"
        if rot:
            base_style += f" transform: rotate({rot}deg); transform-origin: center center;"
            
        bg = style.get("backgroundColor", "")
        if bg and bg.lower() != "transparent":
            base_style += f" background-color: {bg};"
            
        color = style.get("color", "")
        if color: base_style += f" color: {color};"
        font_size = style.get("fontSize", "")
        if font_size: base_style += f" font-size: {font_size}pt;"
        font_weight = style.get("fontWeight", "")
        if font_weight: base_style += f" font-weight: {font_weight};"
        text_align = style.get("textAlign", "")
        if text_align: base_style += f" text-align: {text_align};"
        
        bw = style.get("borderWidth", 0)
        if bw:
            bs = style.get("borderStyle", "solid")
            bc = style.get("borderColor", "#000")
            base_style += f" border: {bw}px {bs} {bc};"
            
        br = style.get("borderRadius", 0)
        if br:
            unit = "%" if t == "circle" else "mm"
            base_style += f" border-radius: {br}{unit};"
            
        content_html = ""

        # ------------- PHOTO GRID HANDLER -------------
        if t in ("photo-grid", "photo_grid"):
            cfg = el.get("photoConfig", meta.get("photoConfig", {}))
            
            # Calcular dimensiones de celda en mm
            cols = int(el.get("columns", cfg.get("columns", 2)) or 2)
            rows = int(el.get("rows", cfg.get("rows", 2)) or 2)
            if cols <= 0: cols = 2
            if rows <= 0: rows = 2
            
            cell_width = w / cols
            cell_height = h / rows
            
            # CSS de tabla
            table_style = f"""
              width: {w}mm;
              height: {h}mm;
              border-collapse: collapse;
              table-layout: fixed;
            """
            
            # CSS de cada celda <td>
            td_style = f"""
              width: {cell_width}mm;
              height: {cell_height}mm;
              overflow: hidden;
              padding: 1mm;
              vertical-align: middle;
              border: 0.3mm solid #e0e0e0;
            """
            
            # CSS de la imagen dentro de la celda
            img_wrapper_style = f"""
              width: {cell_width - 2}mm;
              height: {cell_height - 4}mm;
              overflow: hidden;
              display: block;
            """
            
            # CRÍTICO para WeasyPrint: NO usar object-fit:cover (no soportado bien).
            # Usar este patrón alternativo:
            img_style = f"""
              display: block;
              width: 100%;
              height: 100%;
              max-width: {cell_width}mm;
              max-height: {cell_height}mm;
              object-fit: contain;
            """
            
            # Label debajo de la foto (ANTES/DURANTE/DESPUÉS/DETALLE)
            label_style = """
              display: block;
              text-align: center;
              font-size: 7pt;
              font-weight: bold;
              font-family: Arial, sans-serif;
              color: #333;
              margin-top: 0.5mm;
              height: 4mm;
            """

            labels = cfg.get("labels", [])
            show_labels = cfg.get("showLabels", False)
            
            imgs = []
            if variables.get("reports"):
                imgs = variables["reports"][0].get("images", [])
            else:
                imgs = variables.get("images", [])
                
            tbl = f'<table style="{table_style}">\n'
            idx = 0
            for r in range(rows):
                tbl += "<tr>\n"
                for c in range(cols):
                    if idx < len(imgs):
                        img_path = imgs[idx].get("path", "")
                        img_name = imgs[idx].get("name", "")
                        
                        img_tag = f'<img src="{img_path}" alt="{img_name}" style="{img_style}">'
                        
                        label = labels[idx] if idx < len(labels) and labels[idx] else img_name
                        if not show_labels: label = ""
                        
                        # Estructura HTML de cada celda:
                        cell_html = f"""
                        <td style="{td_style}">
                          <div style="{img_wrapper_style}">
                            {img_tag}  <!-- o placeholder si no hay imagen -->
                          </div>
                          <span style="{label_style}">{label}</span>
                        </td>
                        """
                    else:
                        # Si no hay imagen para esa celda → placeholder:
                        placeholder_html = f"""
                        <div style="width:100%;height:100%;background:#f5f5f5;
                                    display:flex;align-items:center;justify-content:center;
                                    font-size:7pt;color:#aaa;font-family:Arial;">
                          Sin foto
                        </div>
                        """
                        cell_html = f'<td style="{td_style}">\n{placeholder_html}\n</td>'
                        
                    tbl += cell_html + "\n"
                    idx += 1
                tbl += "</tr>\n"
            tbl += "</table>\n"
            content_html = tbl

        # ------------- LOGO HANDLER -------------
        elif t == "logo":
            el_for_logo = {**el, **({"imageUrl": el.get("imageUrl", meta.get("imageUrl", ""))})}
            el_for_logo["id"] = el.get("id", meta.get("id", ""))
            el_for_logo["variableName"] = el.get("variableName", meta.get("variableName", ""))
            src = resolve_logo_src(el_for_logo, variables)
            img_style_logo = f"display: block; width: 100%; height: 100%; max-width: {w}mm; max-height: {h}mm; object-fit: contain;"
            content_html = f'<img src="{src}" style="{img_style_logo}">' if src else ''
            
        # ------------- TEXT HANDLER -------------
        elif t in ("text", "heading"):
            content_html = str(el.get("content", meta.get("content", "")))
            
        # ------------- VARIABLE HANDLER -------------
        elif t == "variable":
            var_name = el.get("variableName", meta.get("variableName", ""))
            val = variables.get(var_name, f"{{{{ {var_name} }}}}")
            content_html = str(val)

        # ------------- TABLE HANDLER -------------
        elif t == "table":
            table_data = el.get("tableData", meta.get("tableData", {}))
            data_matrix = table_data.get("data", [])
            row_count = table_data.get("rowCount", len(data_matrix))
            col_count = table_data.get("colCount", len(data_matrix[0]) if data_matrix else 2)
            border_col = table_data.get("borderColor", "#cbd5e1")
            tbl = f'<table style="width:100%; height:100%; border-collapse:collapse; font-size: 7.5pt; table-layout:fixed;"><tbody>'
            for r in range(row_count):
                tbl += "<tr>"
                for c in range(col_count):
                    val = data_matrix[r][c] if r < len(data_matrix) and c < len(data_matrix[r]) else ""
                    tbl += f'<td style="border: 1px solid {border_col}; padding: 1.5mm;">{val}</td>'
                tbl += "</tr>"
            tbl += "</tbody></table>"
            content_html = tbl

        # ------------- IMAGE HANDLER -------------
        elif t == "image":
            img_url = el.get("imageUrl", meta.get("imageUrl", ""))
            if img_url:
                try:
                    from .utils import url_to_base64
                    safe_url = url_to_base64(img_url)
                    img_style_local = f"display: block; width: 100%; height: 100%; max-width: {w}mm; max-height: {h}mm; object-fit: contain;"
                    content_html = f'<img src="{safe_url}" style="{img_style_local}">'
                except: pass

        # ------------- SIGNATURE -------------
        elif t == "signature":
            cfg = meta.get("signatureConfig", [{}])[0] if isinstance(meta.get("signatureConfig"), list) and meta.get("signatureConfig") else meta.get("signatureConfig", {})
            if not isinstance(cfg, dict): cfg = {}
            title = el.get("title", meta.get("title", cfg.get("title", "FIRMA")))
            name = el.get("name", meta.get("signatureName", meta.get("name", cfg.get("name", ""))))
            content_html = f'<div style="border-top: 1px solid #333; text-align: center; padding-top: 2mm; font-weight: bold; font-size: 8pt; text-transform: uppercase;">{title}</div>'
            if name: content_html += f'<div style="font-size: 7.5pt; color: #555; text-align: center;">{name}</div>'

        # ------------- DIVIDER -------------
        elif t == "divider":
             div_config = el.get("dividerConfig", meta.get("dividerConfig", {}))
             thickness = div_config.get("thickness", 1)
             col = div_config.get("color", "#000")
             content_html = f'<div style="width: 100%; height: 0; border-top: {thickness}px solid {col};"></div>'
             
        elif t == "shape":
            kind = el.get("shapeConfig", meta.get("shapeConfig", {})).get("kind", "rectangle")
            if kind == "circle":
                base_style += " border-radius: 50%;"
        
        elif t in ("rectangle", "circle", "container"):
            if t == "circle":
                base_style += " border-radius: 50%;"

        if not content_html and t not in ("photo-grid", "photo_grid", "logo", "text", "heading", "variable", "table", "image", "divider", "shape", "rectangle", "circle", "container", "signature"):
            content_html = ""
            
        elementos_html.append(f'<div class="element {t}" style="{base_style} overflow: hidden;">{content_html}</div>')

    elementos_str = "\n".join(elementos_html)

    # HTML base correcto
    html = f'''<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  @page {{
    size: {page_width}mm {page_height}mm;
    margin: 0mm;   /* ← CRÍTICO: sin márgenes para que el canvas controle todo */
  }}
  html, body {{
    width: {page_width}mm;
    height: {page_height}mm;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }}
  .canvas-page {{
    position: relative;
    width: {page_width}mm;
    height: {page_height}mm;
    overflow: hidden;
    background: white;
  }}
</style>
</head>
<body>
  <div class="canvas-page">
    {elementos_str}
  </div>
</body>
</html>'''

    # Procesar plantillas dinamicas de Jinja si las variables estan present
    if variables:
        from jinja2 import Template as J2Template
        try:
            html = J2Template(html).render(**variables)
        except Exception:
            pass

    # VALIDACIONES ANTES DEL PDF
    # 1) Verificar que el HTML tiene contenido:
    if len(html.strip()) < 100:
        raise ValueError("El HTML compilado está vacío o incompleto")
       
    # 3) Convertir TODAS las imágenes a base64 antes de pasar a WeasyPrint
    def replace_src(match):
        url = match.group(1)
        if url.startswith('data:'):
            return match.group(0)
        try:
            from .utils import url_to_base64
            return f'src="{url_to_base64(url)}"'
        except:
            return match.group(0)
    html = re.sub(r'src="(https?://[^"]+)"', replace_src, html)

    return html


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


def _has_canvas_layout(template_json: TemplateJson) -> bool:
    """Check if any block uses absolute positioning (canvas-style layout)."""
    for section in template_json.sections:
        for block in section.blocks:
            layout = (block.metadata or {}).get("layout")
            if layout and ("x" in layout or "y" in layout):
                return True
    return False


def _compile_block_template(template_json: TemplateJson) -> str:
    """Compile a block-based template to full Jinja2 HTML."""
    is_canvas = _has_canvas_layout(template_json)

    # Canvas templates use the dedicated canvas pipeline that matches
    # the frontend exportToJinja2() output exactly.
    if is_canvas:
        return _compile_canvas_template(template_json)

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

