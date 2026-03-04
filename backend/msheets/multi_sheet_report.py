"""
Router independiente para la herramienta "Informe Multi-Hoja".

Genera un PDF multi-sección con grillas de imágenes en formato A4.
NO depende de backend/templates/ — genera su propio HTML internamente.

Endpoints expuestos (montados en /api/multi-sheet/):
  GET  /templates/independent → lista plantillas independientes publicadas
  GET  /templates        → lista layouts base + plantillas independientes
  POST /generate-pdf     → genera el PDF final
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from html import escape
import json
import math
import os
import re
import shutil
import tempfile
import traceback
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile  # pyre-ignore
from fastapi.responses import StreamingResponse, HTMLResponse  # pyre-ignore

from template_editor.service import (  # type: ignore
    get_all_published_templates,
    get_published_template_by_name,
)

# ── Router ────────────────────────────────────────────────────────────────────
router = APIRouter(tags=["multi-sheet-report"])

# Tipos MIME para imágenes
_MIME_MAP: dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}


# ── Grid helpers ──────────────────────────────────────────────────────────────

def _grid_cols(images_per_page: int) -> int:
    """Columnas óptimas para N imágenes en A4 portrait."""
    mapping = {1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 4, 9: 3}
    return mapping.get(images_per_page, 3)


def _sort_image_filenames_by_seq(filenames: list[str]) -> list[str]:
    """Ordena imágenes por su sufijo secuencial de 3 dígitos (ID_001 < ID_010 < ID_100).

    Formato normalizado esperado: {COLUMNA_ID}_{NNN}.ext
    Ejemplo: NIS_001.jpg, NIS_010.jpg, NIS_100.jpg
    Imágenes sin sufijo secuencial se ordenan primero, por nombre.
    """
    _SEQ_RE = re.compile(r'^(.+?)_(\d{3})\.[^.]+$', re.IGNORECASE)

    def _key(name: str) -> tuple[str, int, str]:
        m = _SEQ_RE.match(name)
        if m:
            return (m.group(1).lower(), int(m.group(2)), name.lower())
        return ("", 0, name.lower())

    return sorted(filenames, key=_key)


# ── Constructores de bloques HTML de encabezado ───────────────────────────────

def _build_main_header_html(header_config: dict[str, Any]) -> str:
    title: str = header_config.get("title") or "INFORME TÉCNICO"
    subtitle: str = header_config.get("subtitle") or ""
    logo_left: str = header_config.get("logoLeft") or ""
    logo_right: str = header_config.get("logoRight") or ""

    logo_left_html = (
        f'<img src="{logo_left}" '
        f'style="max-height:55px;max-width:110px;object-fit:contain;display:block;" />'
        if logo_left
        else '<div style="width:110px;"></div>'
    )
    logo_right_html = (
        f'<img src="{logo_right}" '
        f'style="max-height:55px;max-width:110px;object-fit:contain;display:block;" />'
        if logo_right
        else '<div style="width:110px;"></div>'
    )
    subtitle_html = (
        f'<div style="font-size:9pt;color:#555;margin-top:3px;">{subtitle}</div>'
        if subtitle
        else ""
    )

    return (
        '<div style="display:table;width:100%;border-bottom:2px solid #222;'
        'padding-bottom:8px;margin-bottom:6px;font-family:Arial,sans-serif;">'
        f'<div style="display:table-cell;vertical-align:middle;width:120px;'
        f'text-align:left;">{logo_left_html}</div>'
        '<div style="display:table-cell;vertical-align:middle;text-align:center;">'
        f'<div style="font-size:14pt;font-weight:bold;text-transform:uppercase;'
        f'letter-spacing:0.5pt;color:#111;">{title}</div>'
        f"{subtitle_html}"
        "</div>"
        f'<div style="display:table-cell;vertical-align:middle;width:120px;'
        f'text-align:right;">{logo_right_html}</div>'
        "</div>\n"
    )


def _build_alt_header_html(
    alt_header_config: dict[str, Any], row_data: dict[str, Any]
) -> str:
    id_field: str = alt_header_config.get("idField") or ""
    date_field: str = alt_header_config.get("dateField") or ""
    extra_text: str = alt_header_config.get("extraText") or ""
    height: str = alt_header_config.get("height") or "compact"

    id_value = str(row_data.get(id_field, "")) if id_field else ""
    date_value = str(row_data.get(date_field, "")) if date_field else ""

    padding_map = {"very-compact": "3px 10px", "compact": "5px 12px", "normal": "8px 14px"}
    font_map = {"very-compact": "7.5pt", "compact": "8.5pt", "normal": "9.5pt"}
    padding = padding_map.get(height, "5px 12px")
    font_size = font_map.get(height, "8.5pt")

    parts: list[str] = []
    if id_value:
        parts.append(f"<b>ID:</b>&nbsp;{id_value}")
    if date_value:
        parts.append(f"<b>Fecha:</b>&nbsp;{date_value}")
    if extra_text:
        parts.append(extra_text)

    inner = "&nbsp;&nbsp;|&nbsp;&nbsp;".join(parts) if parts else "&nbsp;"

    return (
        f'<div style="border:1px solid #bbb;border-radius:3px;padding:{padding};'
        f"margin-bottom:6px;font-size:{font_size};background:#f5f5f5;"
        f'font-family:Arial,sans-serif;color:#333;line-height:1.4;">'
        f"{inner}</div>\n"
    )


# ── Generador de página HTML con grilla de imágenes ──────────────────────────

def _build_image_grid_html(image_data_uris: list[str], images_per_page: int) -> str:
    """Grilla de imágenes usando tabla HTML (máxima compatibilidad WeasyPrint)."""
    n = len(image_data_uris)
    if n == 0:
        return (
            '<div style="text-align:center;color:#999;padding:60px 20px;'
            'font-family:Arial;font-size:11pt;">Sin imágenes para esta página</div>'
        )

    cols = _grid_cols(images_per_page)
    rows = math.ceil(n / cols)
    cell_width_pct = 100.0 / cols
    # A4 usable ≈ 273mm, header ≈ 30mm, title ≈ 12mm → grid ≈ 225mm
    row_height_mm = min(225.0 / rows, 130.0)

    table_rows = []
    for r in range(rows):
        cells = []
        for c in range(cols):
            img_idx = r * cols + c
            if img_idx < n:
                uri = image_data_uris[img_idx]  # pyre-ignore
                cells.append(
                    f'<td style="width:{cell_width_pct:.1f}%;text-align:center;'
                    f'vertical-align:middle;padding:2px;height:{row_height_mm:.1f}mm;">'
                    f'<img src="{uri}" style="max-width:100%;max-height:{row_height_mm - 4:.1f}mm;'
                    f'object-fit:contain;border:0.5px solid #ddd;border-radius:2px;" />'
                    f'</td>'
                )
            else:
                cells.append(f'<td style="width:{cell_width_pct:.1f}%;"></td>')
        table_rows.append(f'<tr>{"".join(cells)}</tr>')

    return (
        '<table style="width:100%;border-collapse:separate;border-spacing:3px;'
        'table-layout:fixed;">'
        f'{"".join(table_rows)}'
        '</table>'
    )


def _build_page_html(
    header_html: str,
    title: str,
    image_data_uris: list[str],
    images_per_page: int,
    page_num: int,
    total_pages: int,
) -> str:
    """Construye una página HTML completa A4 con encabezado + título + grilla."""
    grid_html = _build_image_grid_html(image_data_uris, images_per_page)

    page_indicator = f" &mdash; Pág. {page_num}/{total_pages}" if total_pages > 1 else ""
    title_html = ""
    if title:
        title_html = (
            f'<div style="font-size:10pt;font-weight:bold;text-align:center;'
            f'margin:4px 0 6px;font-family:Arial,sans-serif;color:#333;">'
            f'{title}{page_indicator}</div>'
        )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
@page {{
    size: A4 portrait;
    margin: 12mm 15mm 10mm 15mm;
}}
html, body {{
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
}}
</style>
</head><body>
{header_html}
{title_html}
{grid_html}
</body></html>"""


def _safe_text(value: Any, fallback: str = "-") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    if not text:
        return fallback
    return escape(text, quote=True)


def _build_volanteo_page_html(
    header_config: dict[str, Any],
    row_data: dict[str, Any],
    image_data_uris: list[str],
) -> str:
    """Single-page volanteo layout based on backend/templates/report_volanteo.html."""
    logo_left = str(header_config.get("logoLeft") or "").strip()
    logo_right = str(header_config.get("logoRight") or "").strip()

    logo_left_html = (
        f'<img src="{escape(logo_left, quote=True)}" alt="Logo Izquierdo">'
        if logo_left
        else '<span class="header-logo-placeholder"></span>'
    )
    logo_right_html = (
        f'<img src="{escape(logo_right, quote=True)}" alt="Logo Derecho">'
        if logo_right
        else '<span class="header-logo-placeholder"></span>'
    )

    centro = _safe_text(row_data.get("CENTRO"))
    nis = _safe_text(row_data.get("NIS"))
    sector = _safe_text(row_data.get("SECTOR"))
    fecha_corte = _safe_text(row_data.get("FECHA CORTE"))
    direcciones_afectadas = _safe_text(row_data.get("DIRECCIONES AFECTADAS"))
    distrito = _safe_text(row_data.get("DISTRITO"))
    codigo_componente = _safe_text(row_data.get("CODIGO COMPONENTE"))
    estado = _safe_text(row_data.get("ESTADO"))

    image_cells: list[str] = []
    for idx, uri in enumerate(image_data_uris[:4]):  # pyre-ignore
        safe_uri = escape(str(uri), quote=True)
        image_cells.append(
            '<div class="photo-cell">'
            f'<img src="{safe_uri}" alt="Foto {idx + 1}">'
            '</div>'
        )

    if image_cells:
        for _ in range(len(image_cells), 4):
            image_cells.append(
                '<div class="photo-cell">'
                '<div class="photo-placeholder">Sin imagen</div>'
                '</div>'
            )
        photos_html = '<div class="photo-grid">' + "".join(image_cells) + '</div>'
    else:
        photos_html = '<div class="no-photos">No se encontraron imágenes asociadas a este registro.</div>'

    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
@page {{ size: A4; margin: 0; }}
html, body {{
    margin: 0;
    padding: 0;
    width: 210mm;
    height: 297mm;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    line-height: 1.3;
    color: #222;
    background: #fff;
}}
.page {{
    width: 210mm;
    height: 297mm;
    max-height: 297mm;
    margin: 0;
    padding: 8mm;
    background: #fff;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}}
.header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 20mm;
    padding-bottom: 4mm;
    border-bottom: 2px solid #333;
    margin-bottom: 3mm;
    flex-shrink: 0;
}}
.header-logo {{
    width: 55mm;
    height: 18mm;
    display: flex;
    align-items: center;
    justify-content: center;
}}
.header-logo img {{ max-width: 100%; max-height: 100%; object-fit: contain; }}
.header-logo-placeholder {{ font-size: 14px; font-weight: bold; color: #666; }}
.header-title {{ flex: 1; text-align: center; }}
.header-title h1 {{
    font-size: 20px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #000;
}}
.info-bar {{
    display: flex;
    justify-content: space-between;
    border: 1px solid #ccc;
    margin-bottom: 2mm;
    flex-shrink: 0;
}}
.info-item {{
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.5mm 2mm;
    border-right: 1px solid #ccc;
    line-height: 1.2;
}}
.info-item:last-child {{ border-right: none; }}
.info-label {{
    font-size: 9pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #666;
}}
.info-value {{ font-size: 9pt; font-weight: 600; color: #000; }}
.section-title {{
    font-size: 10pt;
    font-weight: bold;
    color: #0066cc;
    text-transform: uppercase;
    margin-bottom: 3mm;
    padding-bottom: 3px;
    border-bottom: 1px solid #0066cc;
    flex-shrink: 0;
}}
.localizacion {{ margin-bottom: 3mm; flex-shrink: 0; }}
.loc-row {{ display: flex; margin-bottom: 4px; }}
.loc-row.full {{ display: block; }}
.loc-field {{ display: flex; align-items: baseline; margin-right: 30px; }}
.loc-field.full {{ width: 100%; margin-right: 0; }}
.loc-label {{
    font-size: 9pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #333;
    margin-right: 8px;
    white-space: nowrap;
}}
.loc-value {{ font-size: 9pt; color: #000; }}
.panel-fotografico {{
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}}
.photo-grid {{
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 2mm;
    flex: 1;
    min-height: 0;
    border: 1px solid #0066cc;
    padding: 2mm;
    overflow: hidden;
}}
.photo-cell {{
    position: relative;
    background: #f5f5f5;
    border: 1px solid #ddd;
    overflow: hidden;
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}}
.photo-cell img {{
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center;
    display: block;
}}
.photo-placeholder {{
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
    font-size: 11px;
    font-style: italic;
}}
.no-photos {{
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    color: #999;
    font-style: italic;
    border: 1px solid #0066cc;
}}
</style></head><body>
<div class="page">
    <header class="header">
        <div class="header-logo">{logo_left_html}</div>
        <div class="header-title"><h1>Panel Fotográfico Volanteo</h1></div>
        <div class="header-logo">{logo_right_html}</div>
    </header>
    <div class="info-bar">
        <div class="info-item"><div class="info-label">Centro de Servicios:</div><div class="info-value">{centro}</div></div>
        <div class="info-item"><div class="info-label">NIS:</div><div class="info-value">{nis}</div></div>
        <div class="info-item"><div class="info-label">Sector:</div><div class="info-value">{sector}</div></div>
        <div class="info-item"><div class="info-label">Fecha de Corte:</div><div class="info-value">{fecha_corte}</div></div>
    </div>
    <section class="localizacion">
        <div class="section-title">1.0 Localización</div>
        <div class="loc-row full">
            <div class="loc-field full">
                <span class="loc-label">Direcciones Afectadas:</span>
                <span class="loc-value">{direcciones_afectadas}</span>
            </div>
        </div>
        <div class="loc-row">
            <div class="loc-field"><span class="loc-label">Distrito:</span><span class="loc-value">{distrito}</span></div>
            <div class="loc-field"><span class="loc-label">Codigo de Componente:</span><span class="loc-value">{codigo_componente}</span></div>
            <div class="loc-field"><span class="loc-label">Estado:</span><span class="loc-value">{estado}</span></div>
        </div>
    </section>
    <section class="panel-fotografico">
        <div class="section-title">2.0 Panel Fotográfico</div>
        {photos_html}
    </section>
</div>
</body></html>"""


# ── Local template renderer ────────────────────────────────────────────────────

def _render_local_template(
    template_name: str,
    header: dict[str, Any],
    row_data: dict[str, Any],
    images_b64: list[str],
    image_filenames: list[str],
) -> str:
    """Render a local HTML template (Jinja2) with row data and images."""
    try:
        from jinja2 import Environment, select_autoescape  # type: ignore
    except ImportError as exc:
        raise RuntimeError("Jinja2 no está instalado.") from exc

    record = _find_local_template(template_name)
    if record is None:
        raise RuntimeError(f"Plantilla local no encontrada: {template_name}")

    with open(record.file_path, "r", encoding="utf-8") as fh:
        template_source = fh.read()

    env = Environment(autoescape=select_autoescape(["html"]))
    tmpl = env.from_string(template_source)

    images_list = [
        {"path": uri, "name": fname}
        for uri, fname in zip(images_b64, image_filenames)
    ]

    return tmpl.render(
        logo_left=header.get("logoLeft") or "",
        logo_right=header.get("logoRight") or "",
        data=row_data,
        images=images_list,
    )


# ── Motor PDF ─────────────────────────────────────────────────────────────────

def _render_html_to_pdf(html_string: str, base_url: str, output_path: str) -> None:
    try:
        from weasyprint import HTML  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "WeasyPrint no está instalado. Ejecuta: pip install weasyprint"
        ) from exc
    HTML(string=html_string, base_url=base_url).write_pdf(output_path)


# ── Utilidades ────────────────────────────────────────────────────────────────

def _safe_remove(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as err:
        print(f"[MultiSheet] Error removing temp file {path}: {err}")


def _image_to_b64(img_path: str) -> Optional[str]:
    ext = os.path.splitext(img_path)[1].lower().lstrip(".")
    mime = _MIME_MAP.get(ext, "image/jpeg")
    try:
        with open(img_path, "rb") as f:
            raw = f.read()
        b64 = base64.b64encode(raw).decode()
        return f"data:{mime};base64,{b64}"
    except Exception:
        return None


async def _upload_to_b64(upload_file: UploadFile) -> Optional[str]:
    mime = upload_file.content_type
    if not mime or mime == "application/octet-stream":
        ext = os.path.splitext(upload_file.filename or "")[1].lower().lstrip(".")
        mime = _MIME_MAP.get(ext, "image/jpeg")
    try:
        raw = await upload_file.read()
        if not raw:
            return None
        b64 = base64.b64encode(raw).decode()
        return f"data:{mime};base64,{b64}"
    except Exception:
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────

# Built-in layouts supported by this router's HTML generator.
# The frontend uses this list to populate the sheet-template dropdown.
_GRID_TEMPLATE_NAME = "Grilla de Imágenes"
_VOLANTEO_TEMPLATE_NAME = "Panel Fotográfico Volanteo"
_BUILTIN_LAYOUTS: list[str] = [_GRID_TEMPLATE_NAME, _VOLANTEO_TEMPLATE_NAME]
_LOCAL_TEMPLATE_DIR_CANDIDATES: tuple[str, ...] = ("multi_sheet_templates", "mtemplates")
_VOLANTEO_TEMPLATE_FIELDS: tuple[str, ...] = (
    "CENTRO",
    "NIS",
    "SECTOR",
    "FECHA CORTE",
    "DIRECCIONES AFECTADAS",
    "DISTRITO",
    "CODIGO COMPONENTE",
    "ESTADO",
)
_TEMPLATE_DATA_GET_PATTERN = re.compile(
    r"(?:report\.)?data\.get\(\s*(['\"])([^'\"]+)\1",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class LocalTemplateRecord:
    name: str
    file_path: str
    directory: str


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        normalized = str(value or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
    return out


def _list_independent_template_names() -> list[str]:
    """Collect independent templates published via template-editor backend."""
    try:
        published = get_all_published_templates()
    except Exception as exc:
        print(f"[MultiSheet] Error listing independent templates: {exc}")
        return []

    names: list[str] = []
    for item in published:
        if isinstance(item, dict):
            name = str(item.get("name") or "").strip()
        else:
            name = str(item or "").strip()
        if name:
            names.append(name)

    independent_names = _dedupe_preserve_order(names)
    return [name for name in independent_names if name not in _BUILTIN_LAYOUTS]


def _extract_template_fields_from_source(template_source: str) -> list[str]:
    if not template_source:
        return []

    matches = [
        match.group(2).strip()
        for match in _TEMPLATE_DATA_GET_PATTERN.finditer(template_source)
        if match.group(2).strip()
    ]
    return _dedupe_preserve_order(matches)


def _resolve_template_mapping_fields(template_name: str) -> tuple[list[str], str]:
    normalized = str(template_name or "").strip()
    if not normalized:
        return [], "unknown"

    if normalized == _GRID_TEMPLATE_NAME:
        return [], "builtin"

    if normalized == _VOLANTEO_TEMPLATE_NAME:
        return list(_VOLANTEO_TEMPLATE_FIELDS), "builtin"

    record = _find_local_template(normalized)
    if record is not None:
        with open(record.file_path, "r", encoding="utf-8") as fh:
            return _extract_template_fields_from_source(fh.read()), "local"

    try:
        compiled_html = get_published_template_by_name(normalized)
    except Exception as exc:
        print(f"[MultiSheet] Error reading published template '{normalized}': {exc}")
        compiled_html = None

    if compiled_html:
        return _extract_template_fields_from_source(compiled_html), "independent"

    return [], "unknown"


def _local_template_directories() -> list[str]:
    """Return list of existing local template directories."""
    # Get the directory where this file (multi_sheet_report.py) is located
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dirs = []
    for candidate in _LOCAL_TEMPLATE_DIR_CANDIDATES:
        candidate_path = os.path.realpath(os.path.join(base_dir, candidate))
        dirs.append(candidate_path)
        # Debug logging
        print(f"[MultiSheet] Checking template directory: {candidate_path}")
        print(f"[MultiSheet]   Exists: {os.path.isdir(candidate_path)}")
        if os.path.isdir(candidate_path):
            try:
                files = os.listdir(candidate_path)
                html_files = [f for f in files if f.lower().endswith('.html')]
                print(f"[MultiSheet]   HTML files found: {html_files}")
            except Exception as e:
                print(f"[MultiSheet]   Error listing: {e}")
    return [path for path in dirs if os.path.isdir(path)]


def _scan_local_templates() -> list[LocalTemplateRecord]:
    records_by_name: dict[str, LocalTemplateRecord] = {}
    for directory in _local_template_directories():
        try:
            filenames = sorted(os.listdir(directory))
        except Exception as exc:
            print(f"[MultiSheet] Error listing local templates from {directory}: {exc}")
            continue
        for filename in filenames:
            if not filename.lower().endswith(".html"):
                continue
            name = os.path.splitext(filename)[0].strip()
            if not name or name in records_by_name:
                continue
            records_by_name[name] = LocalTemplateRecord(
                name=name,
                file_path=os.path.join(directory, filename),
                directory=directory,
            )
    return list(records_by_name.values())


def _find_local_template(template_name: str) -> Optional[LocalTemplateRecord]:
    normalized = str(template_name or "").strip()
    if not normalized:
        return None
    for record in _scan_local_templates():
        if record.name == normalized:
            return record
    return None


def _list_local_template_names() -> list[str]:
    """Return display names (filename without .html) of local HTML templates."""
    try:
        return [record.name for record in _scan_local_templates()]
    except Exception as exc:
        print(f"[MultiSheet] Error listing local templates: {exc}")
        return []


def _build_template_sections() -> list[dict[str, Any]]:
    independent = _list_independent_template_names()
    local = _list_local_template_names()
    return [
        {
            "id": "builtin",
            "label": "Plantillas base",
            "templates": list(_BUILTIN_LAYOUTS),
        },
        {
            "id": "local",
            "label": "Plantillas locales",
            "templates": local,
        },
        {
            "id": "independent",
            "label": "Plantillas independientes",
            "templates": independent,
        },
    ]


@router.get("/templates/independent")
async def list_independent_templates() -> dict:
    """Return only independent templates available for multi-sheet reports."""
    templates = _list_independent_template_names()
    return {"templates": templates, "count": len(templates)}


@router.get("/templates")
async def list_templates() -> dict:
    """Return built-in + independent sheet templates grouped by section."""
    sections = _build_template_sections()
    flattened: list[str] = []
    for section in sections:
        flattened.extend(section.get("templates", []))

    return {
        "templates": _dedupe_preserve_order(flattened),
        "sections": sections,
    }


@router.get("/templates/{template_name}/mapping-fields")
async def get_template_mapping_fields(template_name: str) -> dict:
    """Return detected Jinja data keys for the requested template name."""
    fields, source = _resolve_template_mapping_fields(template_name)
    return {
        "templateName": template_name,
        "fields": fields,
        "count": len(fields),
        "source": source,
    }


@router.get("/templates/{template_name}/html", response_class=HTMLResponse)
async def get_local_template_html(template_name: str):
    """Return the raw HTML of a local template file (for client-side preview)."""
    record = _find_local_template(template_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")
    with open(record.file_path, "r", encoding="utf-8") as fh:
        return HTMLResponse(content=fh.read())


@router.post("/generate-pdf")
async def generate_multi_sheet_pdf(
    background_tasks: BackgroundTasks,
    sheets_config: str = Form(...),
    header_config: str = Form(...),
    alt_header_config: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    logoLeftFile: Optional[UploadFile] = File(default=None),
    logoRightFile: Optional[UploadFile] = File(default=None),
):
    """
    Genera un PDF multi-sección con grillas de imágenes.

    Cada entrada en sheets_config representa una página del PDF con:
      { order, title, useAltHeader, rowData, imageFilenames,
        imagesPerPage, pageNum, totalPages }
    """
    try:
        sheets: list[Any] = json.loads(sheets_config)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400, detail=f"sheets_config JSON inválido: {exc}"
        ) from exc

    try:
        header: dict[str, Any] = json.loads(header_config)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400, detail=f"header_config JSON inválido: {exc}"
        ) from exc

    try:
        alt_header: dict[str, Any] = json.loads(alt_header_config)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400, detail=f"alt_header_config JSON inválido: {exc}"
        ) from exc

    if not sheets:
        raise HTTPException(status_code=400, detail="No hay páginas configuradas")

    if logoLeftFile is not None:
        logo_left_data = await _upload_to_b64(logoLeftFile)
        if logo_left_data:
            header["logoLeft"] = logo_left_data

    if logoRightFile is not None:
        logo_right_data = await _upload_to_b64(logoRightFile)
        if logo_right_data:
            header["logoRight"] = logo_right_data

    tmp_dir = tempfile.mkdtemp(prefix="multi_sheet_")
    output_path: Optional[str] = None

    try:
        # Guardar imágenes adjuntas
        for upload_file in files:
            if upload_file.filename:
                dest = os.path.join(tmp_dir, upload_file.filename)
                content = await upload_file.read()
                with open(dest, "wb") as fout:
                    fout.write(content)

        from pypdf import PdfWriter  # type: ignore

        sorted_sheets = sorted(sheets, key=lambda s: s.get("order", 0))
        local_names = _list_local_template_names()
        temp_pdf_paths: list[str] = []

        for sheet in sorted_sheets:
            row_data: dict[str, Any] = sheet.get("rowData") or {}
            image_filenames: list[str] = sheet.get("imageFilenames") or []
            template_name: str = str(sheet.get("templateName") or _GRID_TEMPLATE_NAME)
            use_alt_header: bool = bool(sheet.get("useAltHeader", False))
            title: str = sheet.get("title") or ""
            images_per_page: int = int(sheet.get("imagesPerPage", 4))
            if images_per_page < 1:
                images_per_page = 1
            configured_page_num: int = int(sheet.get("pageNum", 1))
            configured_total_pages: int = int(sheet.get("totalPages", 1))

            # Ordenar por sufijo secuencial 3 dígitos: COLUMNA_ID_001, _010, _100...
            image_filenames = _sort_image_filenames_by_seq(image_filenames)

            # Dividir en grupos de images_per_page → N páginas con los mismos datos de fila
            if image_filenames:
                image_groups: list[list[str]] = [
                    image_filenames[i : i + images_per_page]
                    for i in range(0, len(image_filenames), images_per_page)
                ]
            else:
                image_groups = [[]]

            if len(image_groups) > 1:
                page_ranges = [
                    (idx + 1, len(image_groups), group)
                    for idx, group in enumerate(image_groups)
                ]
            else:
                page_ranges = [
                    (configured_page_num, configured_total_pages, image_groups[0])
                ]

            for page_num, total_pages, page_filenames in page_ranges:
                # Resolver imágenes a data URIs
                images_b64: list[str] = []
                for fname in page_filenames:
                    img_path = os.path.join(tmp_dir, fname)
                    if os.path.exists(img_path):
                        data_uri = _image_to_b64(img_path)
                        if data_uri:
                            images_b64.append(data_uri)

                # Construir HTML de la página
                if template_name in local_names:
                    page_html = _render_local_template(
                        template_name=template_name,
                        header=header,
                        row_data=row_data,
                        images_b64=images_b64,
                        image_filenames=page_filenames,
                    )
                elif template_name == _VOLANTEO_TEMPLATE_NAME:
                    page_html = _build_volanteo_page_html(
                        header_config=header,
                        row_data=row_data,
                        image_data_uris=images_b64,
                    )
                else:
                    if use_alt_header:
                        header_html = _build_alt_header_html(alt_header, row_data)
                    else:
                        header_html = _build_main_header_html(header)

                    page_html = _build_page_html(
                        header_html=header_html,
                        title=title,
                        image_data_uris=images_b64,
                        images_per_page=images_per_page,
                        page_num=page_num,
                        total_pages=total_pages,
                    )

                # Renderizar a PDF
                try:
                    tmp_pdf_file = tempfile.NamedTemporaryFile(
                        delete=False, suffix=".pdf", dir=tmp_dir
                    )
                    tmp_pdf_path = tmp_pdf_file.name
                    tmp_pdf_file.close()
                    _render_html_to_pdf(page_html, tmp_dir, tmp_pdf_path)
                    temp_pdf_paths.append(tmp_pdf_path)
                except Exception as exc:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Error al generar PDF de página: {exc}",
                    ) from exc

        if not temp_pdf_paths:
            raise HTTPException(
                status_code=400, detail="No se generó ninguna página PDF"
            )

        # Concatenar PDFs
        output_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        output_path = output_file.name
        output_file.close()

        pdf_writer = PdfWriter()
        try:
            for pdf_path in temp_pdf_paths:
                pdf_writer.append(pdf_path)
            with open(output_path, "wb") as fout:
                pdf_writer.write(fout)
        finally:
            pdf_writer.close()

        def _iter_file(path: str):
            with open(path, "rb") as fread:
                yield from fread

        background_tasks.add_task(shutil.rmtree, tmp_dir, True)
        background_tasks.add_task(_safe_remove, output_path)

        return StreamingResponse(
            _iter_file(output_path),
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="informe_multi_hoja.pdf"'
            },
        )

    except HTTPException:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        if output_path:
            _safe_remove(output_path)
        raise
    except Exception as exc:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        if output_path:
            _safe_remove(output_path)
        print(f"[MultiSheet] Error inesperado:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno al generar el informe: {exc}",
        ) from exc
