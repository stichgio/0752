"""
Router independiente para la herramienta "Panel Fotográfico Manual".

Genera un PDF A4 multi-página con 4 imágenes por hoja a partir de datos de
cabecera manuales e imágenes subidas en memoria.

Endpoints expuestos (montados en /api/panel-fotografico):
  POST /render-pdf  → genera el PDF final
"""

from __future__ import annotations

import asyncio
import base64
import functools
import io
import json
import logging
import os
import tempfile
import traceback
from concurrent.futures import ThreadPoolExecutor
from html import escape
from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from config import settings

logger = logging.getLogger("panel_fotografico")

# â”€â”€ Router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router = APIRouter(prefix="/api/panel-fotografico", tags=["panel-fotografico"])

# â”€â”€ PDF engine (same pattern as multi_sheet_report.py) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _configure_windows_gtk_runtime() -> None:
    if os.name != "nt":
        return
    gtk_path = settings.gtk_runtime_bin.strip()
    if not gtk_path or not os.path.isdir(gtk_path):
        return
    os.environ["PATH"] = gtk_path + os.pathsep + os.environ.get("PATH", "")
    add_dll_directory = getattr(os, "add_dll_directory", None)
    if callable(add_dll_directory):
        try:
            add_dll_directory(gtk_path)
        except Exception:
            pass


def _detect_browser_pdf_path() -> Optional[str]:
    windows_candidates = [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ]
    linux_candidates = [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
    ]
    candidates = windows_candidates if os.name == "nt" else linux_candidates
    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate
    return None


_configure_windows_gtk_runtime()

_WEASYPRINT_IMPORT_ERROR: Optional[Exception] = None
try:
    from weasyprint import HTML as WEASYPRINT_HTML

    WEASYPRINT_AVAILABLE = True
except (ImportError, OSError) as exc:
    WEASYPRINT_HTML = None
    WEASYPRINT_AVAILABLE = False
    _WEASYPRINT_IMPORT_ERROR = exc
    logger.warning("WeasyPrint no disponible para panel-fotografico: %s", exc)

_PILLOW_IMPORT_ERROR: Optional[Exception] = None
try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps

    PILLOW_AVAILABLE = True
except ImportError as exc:
    Image = ImageDraw = ImageFont = ImageOps = None
    PILLOW_AVAILABLE = False
    _PILLOW_IMPORT_ERROR = exc
    logger.warning("Pillow no disponible para panel-fotografico: %s", exc)

CHROME_PATH = _detect_browser_pdf_path()

# â”€â”€ MIME helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

_MIME_MAP: dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}


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


# â”€â”€ HTML builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _safe(value: Any, fallback: str = "-") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return escape(text, quote=True) if text else fallback


def _build_panel_page_html(
    header: dict[str, Any],
    logo_left_uri: Optional[str],
    logo_right_uri: Optional[str],
    image_uris: list[str],
    page_num: int,
    total_pages: int,
) -> str:
    """Build one A4 HTML page with header + 4-slot photo grid."""
    titulo = _safe(header.get("titulo"), "Panel Fotográfico")
    centro = _safe(header.get("CENTRO"))
    nis = _safe(header.get("NIS"))
    fecha_trabajo = _safe(header.get("FECHA_TRABAJO"))
    direcciones = _safe(header.get("DIRECCIONES_AFECTADAS"))
    distrito = _safe(header.get("DISTRITO"))
    estado = _safe(header.get("ESTADO"))
    actividad = _safe(header.get("ACTIVIDAD"))
    cuadrilla = _safe(header.get("CUADRILLA"))

    # logo HTML
    logo_left_html = (
        f'<img src="{escape(logo_left_uri, quote=True)}" alt="Logo Izquierdo">'
        if logo_left_uri
        else '<span class="header-logo-placeholder"></span>'
    )
    logo_right_html = (
        f'<img src="{escape(logo_right_uri, quote=True)}" alt="Logo Derecho">'
        if logo_right_uri
        else '<span class="header-logo-placeholder"></span>'
    )

    # page indicator
    page_label = f"Hoja {page_num}/{total_pages}" if total_pages > 1 else ""

    # photo grid â€” always 4 slots
    cells_html = ""
    for idx in range(4):
        if idx < len(image_uris):
            safe_uri = escape(str(image_uris[idx]), quote=True)
            cells_html += (
                f'<div class="photo-cell">'
                f'<img src="{safe_uri}" alt="Foto {idx + 1}">'
                f"</div>"
            )
        else:
            cells_html += (
                '<div class="photo-cell">'
                '<div class="photo-placeholder">Sin imagen</div>'
                "</div>"
            )

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
@page {{ size: A4 portrait; margin: 0; }}
html, body {{
    margin: 0; padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px; line-height: 1.3; color: #222; background: #fff;
    width: 210mm; height: 297mm;
}}
.page {{
    width: 210mm; height: 297mm; max-height: 297mm;
    margin: 0 auto; padding: 8mm;
    background: #fff;
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-orient: vertical; -webkit-box-direction: normal;
    -ms-flex-direction: column; flex-direction: column;
    page-break-after: always; page-break-inside: avoid;
    -webkit-box-sizing: border-box; box-sizing: border-box; overflow: hidden;
}}
.page:last-child {{ page-break-after: auto; }}
.header {{
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-pack: justify; -ms-flex-pack: justify; justify-content: space-between;
    -webkit-box-align: center; -ms-flex-align: center; align-items: center;
    height: 20mm; padding-bottom: 4mm;
    border-bottom: 2px solid #333; margin-bottom: 3mm; -ms-flex-negative: 0; flex-shrink: 0;
}}
.header-logo {{
    width: 55mm; height: 18mm;
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-align: center; -ms-flex-align: center; align-items: center;
    -webkit-box-pack: center; -ms-flex-pack: center; justify-content: center;
}}
.header-logo img {{ max-width: 100%; max-height: 100%; object-fit: contain; }}
.header-logo-placeholder {{ font-size: 14px; font-weight: bold; color: #666; }}
.header-title {{ -webkit-box-flex: 1; -ms-flex: 1; flex: 1; text-align: center; }}
.header-title h1 {{
    font-size: 16px; font-weight: bold;
    text-transform: uppercase; letter-spacing: 1px; color: #000;
}}
.header-title .page-label {{
    font-size: 9px; color: #777; margin-top: 2px;
}}
.info-bar {{
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-pack: justify; -ms-flex-pack: justify; justify-content: space-between;
    border: 1px solid #ccc; margin-bottom: 2mm; -ms-flex-negative: 0; flex-shrink: 0;
}}
.info-item {{
    -webkit-box-flex: 1; -ms-flex: 1; flex: 1;
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-orient: vertical; -webkit-box-direction: normal;
    -ms-flex-direction: column; flex-direction: column;
    padding: 1.5mm 2mm; border-right: 1px solid #ccc; line-height: 1.2;
}}
.info-item:last-child {{ border-right: none; }}
.info-label {{ font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #666; }}
.info-value {{ font-size: 9pt; font-weight: 600; color: #000; }}
.section-title {{
    font-size: 10pt; font-weight: bold; color: #0066cc;
    text-transform: uppercase; margin-bottom: 3mm;
    padding-bottom: 3px; border-bottom: 1px solid #0066cc;
    -ms-flex-negative: 0; flex-shrink: 0;
}}
.localizacion {{ margin-bottom: 3mm; -ms-flex-negative: 0; flex-shrink: 0; }}
.loc-table {{ width: 100%; border-collapse: collapse; }}
.loc-table td {{ padding: 1.5px 0; vertical-align: baseline; }}
.loc-label {{
    font-size: 8pt; font-weight: bold; text-transform: uppercase;
    color: #333; white-space: nowrap; padding-right: 6px;
}}
.loc-value {{ font-size: 8pt; color: #000; word-break: break-word; }}
.panel-fotografico {{
    -webkit-box-flex: 1; -ms-flex: 1; flex: 1;
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-orient: vertical; -webkit-box-direction: normal;
    -ms-flex-direction: column; flex-direction: column;
    min-height: 0; overflow: hidden;
}}
/* 2x2 grid aligned with the backend/templates panel layout */
.photo-grid {{
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 2mm;
    width: 100%;
    height: 100%;
    border: 1px solid #0066cc;
    padding: 2mm;
    -webkit-box-flex: 1; -ms-flex: 1; flex: 1;
    min-height: 0;
    overflow: hidden;
    -webkit-box-sizing: border-box; box-sizing: border-box;
}}
.photo-cell {{
    background: #f5f5f5; border: 1px solid #ddd;
    width: 100%; height: 100%;
    min-width: 0; min-height: 0;
    overflow: hidden;
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-align: center; -ms-flex-align: center; align-items: center;
    -webkit-box-pack: center; -ms-flex-pack: center; justify-content: center;
    -webkit-box-sizing: border-box; box-sizing: border-box;
}}
.photo-cell img {{
    max-width: 100%; max-height: 100%;
    object-fit: contain; object-position: center; display: block;
}}
.photo-placeholder {{
    width: 100%; height: 100%;
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-align: center; -ms-flex-align: center; align-items: center;
    -webkit-box-pack: center; -ms-flex-pack: center; justify-content: center;
    color: #999; font-size: 10px; font-style: italic;
}}
</style>
</head>
<body>
<div class="page">
    <header class="header">
        <div class="header-logo">{logo_left_html}</div>
        <div class="header-title">
            <h1>{titulo}</h1>
            {f'<div class="page-label">{page_label}</div>' if page_label else ""}
        </div>
        <div class="header-logo">{logo_right_html}</div>
    </header>

    <div class="info-bar">
        <div class="info-item">
            <div class="info-label">Centro de Servicios:</div>
            <div class="info-value">{centro}</div>
        </div>
        <div class="info-item">
            <div class="info-label">NIS:</div>
            <div class="info-value">{nis}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Fecha de Trabajo:</div>
            <div class="info-value">{fecha_trabajo}</div>
        </div>
    </div>

    <section class="localizacion">
        <div class="section-title">1.0 Localización</div>
        <table class="loc-table">
            <tr>
                <td class="loc-label">Direcciones Afectadas:</td>
                <td class="loc-value" colspan="3">{direcciones}</td>
            </tr>
            <tr>
                <td class="loc-label">Distrito:</td>
                <td class="loc-value" colspan="3">{distrito}</td>
            </tr>
            <tr>
                <td class="loc-label">Estado:</td>
                <td class="loc-value" colspan="3">{estado}</td>
            </tr>
        </table>
    </section>

    <section class="localizacion">
        <div class="section-title">2.0 Detalles de Orden de Trabajo</div>
        <table class="loc-table">
            <tr>
                <td class="loc-label">Actividad:</td>
                <td class="loc-value">{actividad}</td>
                <td class="loc-label" style="padding-left:8px">Cuadrilla:</td>
                <td class="loc-value">{cuadrilla}</td>
            </tr>
        </table>
    </section>

    <section class="panel-fotografico">
        <div class="section-title">3.0 Panel Fotográfico</div>
        <div class="photo-grid">
            {cells_html}
        </div>
    </section>
</div>
</body>
</html>"""


def _chunk_images(images: list[str], size: int = 4) -> list[list[str]]:
    """Split image list into chunks of `size`, preserving order."""
    return [images[i : i + size] for i in range(0, len(images), size)]


# â”€â”€ PDF rendering engine (same fallback chain as multi_sheet_report.py) â”€â”€â”€â”€â”€â”€â”€â”€

import shutil
import subprocess


def _load_font(size: int, bold: bool = False):
    if not PILLOW_AVAILABLE or ImageFont is None:
        raise RuntimeError("Pillow no esta disponible.")
    font_candidates = (
        ("arialbd.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf")
        if bold
        else ("arial.ttf", "DejaVuSans.ttf", "DejaVuSans-Bold.ttf")
    )
    for candidate in font_candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def _text_size(draw, text: str, font) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def _wrap_text(draw, text: str, font, max_width: int, max_lines: int = 2) -> list[str]:
    normalized = " ".join(str(text or "-").split()) or "-"
    words = normalized.split(" ")
    lines: list[str] = []
    current = ""

    for word in words:
        trial = word if not current else f"{current} {word}"
        if _text_size(draw, trial, font)[0] <= max_width:
            current = trial
            continue
        if current:
            lines.append(current)
            current = word
        else:
            clipped = word
            while clipped and _text_size(draw, clipped, font)[0] > max_width:
                clipped = clipped[:-1]
            lines.append((clipped or word[:1]).rstrip() + "...")
            current = ""
        if len(lines) >= max_lines:
            break

    if len(lines) < max_lines and current:
        lines.append(current)

    if len(lines) > max_lines:
        lines = lines[:max_lines]
    if lines and len(lines) == max_lines:
        consumed = " ".join(lines)
        if consumed != normalized and not lines[-1].endswith("..."):
            trimmed = lines[-1]
            while trimmed and _text_size(draw, trimmed + "...", font)[0] > max_width:
                trimmed = trimmed[:-1]
            lines[-1] = (trimmed or lines[-1][:1]).rstrip() + "..."
    return lines or ["-"]


def _draw_wrapped_text(draw, text: str, font, fill: str, x: int, y: int, max_width: int, line_gap: int = 4, max_lines: int = 2) -> int:
    lines = _wrap_text(draw, text, font, max_width=max_width, max_lines=max_lines)
    current_y = y
    for line in lines:
        draw.text((x, current_y), line, font=font, fill=fill)
        current_y += _text_size(draw, line, font)[1] + line_gap
    return current_y


def _decode_data_uri_image(data_uri: str):
    if not PILLOW_AVAILABLE or Image is None or ImageOps is None:
        raise RuntimeError("Pillow no esta disponible.")
    if "," not in data_uri:
        raise ValueError("Data URI invalida.")
    payload = data_uri.split(",", 1)[1]
    raw = base64.b64decode(payload)
    image = Image.open(io.BytesIO(raw))
    image = ImageOps.exif_transpose(image)
    return image.convert("RGBA")


def _paste_contained(canvas, image, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    target_w = max(1, x1 - x0)
    target_h = max(1, y1 - y0)
    fitted = image.copy()
    fitted.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    paste_x = x0 + max(0, (target_w - fitted.width) // 2)
    paste_y = y0 + max(0, (target_h - fitted.height) // 2)
    if fitted.mode == "RGBA":
        canvas.paste(fitted, (paste_x, paste_y), fitted)
    else:
        canvas.paste(fitted, (paste_x, paste_y))


def _render_panel_pdf_with_pillow(
    header: dict[str, Any],
    logo_left_uri: Optional[str],
    logo_right_uri: Optional[str],
    image_uris: list[str],
    output_path: str,
) -> None:
    if not PILLOW_AVAILABLE or Image is None or ImageDraw is None:
        reason = f": {_PILLOW_IMPORT_ERROR}" if _PILLOW_IMPORT_ERROR is not None else "."
        raise RuntimeError("Pillow no esta disponible para el fallback PDF" + reason)

    page_width = 1240
    page_height = 1754
    margin = 48
    blue = "#0066cc"
    border = "#d4d4d8"
    placeholder_bg = "#f5f5f5"
    text_color = "#111827"
    muted = "#6b7280"

    title_font = _load_font(34, bold=True)
    section_font = _load_font(24, bold=True)
    label_font = _load_font(16, bold=True)
    value_font = _load_font(18, bold=False)
    page_font = _load_font(16, bold=False)
    placeholder_font = _load_font(22, bold=False)

    chunks = _chunk_images(image_uris, size=4)
    pages = []

    for page_num, chunk in enumerate(chunks, start=1):
        page = Image.new("RGB", (page_width, page_height), "white")
        draw = ImageDraw.Draw(page)

        y = margin
        header_bottom = y + 118
        draw.line((margin, header_bottom, page_width - margin, header_bottom), fill="#2f2f2f", width=3)

        logo_box_w = 260
        logo_box_h = 90
        logo_left_box = (margin, y + 10, margin + logo_box_w, y + 10 + logo_box_h)
        logo_right_box = (page_width - margin - logo_box_w, y + 10, page_width - margin, y + 10 + logo_box_h)
        title_left = logo_left_box[2] + 20
        title_right = logo_right_box[0] - 20
        title_text = _safe(header.get("titulo"), "Panel Fotografico")
        title_w, title_h = _text_size(draw, title_text, title_font)
        title_x = title_left + max(0, (title_right - title_left - title_w) // 2)
        title_y = y + 20
        draw.text((title_x, title_y), title_text, font=title_font, fill=text_color)

        if len(chunks) > 1:
            page_label = f"Hoja {page_num}/{len(chunks)}"
            label_w, _ = _text_size(draw, page_label, page_font)
            label_x = title_left + max(0, (title_right - title_left - label_w) // 2)
            draw.text((label_x, title_y + title_h + 8), page_label, font=page_font, fill=muted)

        for box, uri in ((logo_left_box, logo_left_uri), (logo_right_box, logo_right_uri)):
            draw.rounded_rectangle(box, radius=8, outline=border, width=1)
            if uri:
                try:
                    _paste_contained(page, _decode_data_uri_image(uri), (box[0] + 6, box[1] + 6, box[2] - 6, box[3] - 6))
                except Exception:
                    pass

        y = header_bottom + 22

        info_items = [
            ("Centro de Servicios", _safe(header.get("CENTRO"))),
            ("NIS", _safe(header.get("NIS"))),
            ("Fecha de Trabajo", _safe(header.get("FECHA_TRABAJO"))),
        ]
        info_top = y
        info_bottom = info_top + 84
        info_width = page_width - (margin * 2)
        col_width = info_width // len(info_items)
        for idx, (label, value) in enumerate(info_items):
            x0 = margin + idx * col_width
            x1 = margin + info_width if idx == len(info_items) - 1 else x0 + col_width
            draw.rectangle((x0, info_top, x1, info_bottom), outline=border, width=1)
            draw.text((x0 + 14, info_top + 12), label.upper(), font=label_font, fill=muted)
            _draw_wrapped_text(draw, value, value_font, text_color, x0 + 14, info_top + 38, x1 - x0 - 28, max_lines=2)
        y = info_bottom + 28

        draw.text((margin, y), "1.0 LOCALIZACION", font=section_font, fill=blue)
        y += 34
        draw.line((margin, y, page_width - margin, y), fill=blue, width=2)
        y += 14
        localizacion = [
            ("Direcciones Afectadas:", _safe(header.get("DIRECCIONES_AFECTADAS"))),
            ("Distrito:", _safe(header.get("DISTRITO"))),
            ("Estado:", _safe(header.get("ESTADO"))),
        ]
        for label, value in localizacion:
            draw.text((margin, y), label.upper(), font=label_font, fill="#374151")
            y = _draw_wrapped_text(draw, value, value_font, text_color, margin + 220, y - 2, page_width - margin * 2 - 220, max_lines=2)
            y += 8

        y += 10
        draw.text((margin, y), "2.0 DETALLES DE ORDEN DE TRABAJO", font=section_font, fill=blue)
        y += 34
        draw.line((margin, y, page_width - margin, y), fill=blue, width=2)
        y += 14
        draw.text((margin, y), "ACTIVIDAD:", font=label_font, fill="#374151")
        _draw_wrapped_text(draw, _safe(header.get("ACTIVIDAD")), value_font, text_color, margin + 140, y - 2, 520, max_lines=2)
        draw.text((margin + 700, y), "CUADRILLA:", font=label_font, fill="#374151")
        _draw_wrapped_text(draw, _safe(header.get("CUADRILLA")), value_font, text_color, margin + 830, y - 2, page_width - margin - (margin + 830), max_lines=2)

        y += 68
        draw.text((margin, y), "3.0 PANEL FOTOGRAFICO", font=section_font, fill=blue)
        y += 34
        draw.line((margin, y, page_width - margin, y), fill=blue, width=2)
        y += 16

        grid_left = margin
        grid_top = y
        grid_right = page_width - margin
        grid_bottom = page_height - margin
        draw.rectangle((grid_left, grid_top, grid_right, grid_bottom), outline=blue, width=2)

        cell_gap = 20
        inner_pad = 18
        cell_width = (grid_right - grid_left - inner_pad * 2 - cell_gap) // 2
        cell_height = (grid_bottom - grid_top - inner_pad * 2 - cell_gap) // 2

        for idx in range(4):
            row = idx // 2
            col = idx % 2
            x0 = grid_left + inner_pad + col * (cell_width + cell_gap)
            y0 = grid_top + inner_pad + row * (cell_height + cell_gap)
            x1 = x0 + cell_width
            y1 = y0 + cell_height
            draw.rectangle((x0, y0, x1, y1), fill=placeholder_bg, outline=border, width=1)
            if idx < len(chunk):
                try:
                    _paste_contained(page, _decode_data_uri_image(chunk[idx]), (x0 + 10, y0 + 10, x1 - 10, y1 - 10))
                except Exception:
                    placeholder_w, placeholder_h = _text_size(draw, "Imagen invalida", placeholder_font)
                    draw.text((x0 + (cell_width - placeholder_w) // 2, y0 + (cell_height - placeholder_h) // 2), "Imagen invalida", font=placeholder_font, fill=muted)
            else:
                placeholder = "Sin imagen"
                placeholder_w, placeholder_h = _text_size(draw, placeholder, placeholder_font)
                draw.text((x0 + (cell_width - placeholder_w) // 2, y0 + (cell_height - placeholder_h) // 2), placeholder, font=placeholder_font, fill=muted)

        pages.append(page)

    if not pages:
        raise RuntimeError("No hay paginas para exportar.")

    first_page = pages[0]
    remaining_pages = pages[1:]
    first_page.save(output_path, "PDF", resolution=150.0, save_all=bool(remaining_pages), append_images=remaining_pages)


def _render_html_to_pdf_with_browser(html_string: str, base_url: str, output_path: str) -> None:
    if not CHROME_PATH:
        raise RuntimeError("No hay navegador disponible para el fallback PDF.")

    browser_tmp_dir = tempfile.mkdtemp(prefix="panel_foto_browser_")
    html_path: Optional[str] = None
    profile_dir = os.path.join(browser_tmp_dir, "profile")
    os.makedirs(profile_dir, exist_ok=True)

    try:
        html_dir = base_url if base_url and os.path.isdir(base_url) else browser_tmp_dir
        html_file = tempfile.NamedTemporaryFile(
            delete=False, suffix=".html", dir=html_dir, mode="w", encoding="utf-8"
        )
        html_file.write(html_string)
        html_file.close()
        html_path = html_file.name

        browser_args = [
            arg
            for arg in [
                CHROME_PATH,
                "--headless",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-software-rasterizer",
                "--disable-crash-reporter",
                "--disable-breakpad",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-extensions",
                "--allow-file-access-from-files",
                f"--crash-dumps-dir={browser_tmp_dir}",
                f"--user-data-dir={profile_dir}",
                f"--print-to-pdf={output_path}",
                "--print-to-pdf-no-header",
                "--no-margins",
                "--paper-width=8.27",
                "--paper-height=11.69",
                html_path,
            ]
            if arg is not None
        ]
        result = subprocess.run(browser_args, capture_output=True, text=True, timeout=90)
        if result.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            error_output = (result.stderr or result.stdout or "").strip()
            suffix = f": {error_output}" if error_output else "."
            raise RuntimeError(f"Chrome/Edge headless no pudo generar el PDF{suffix}")
    finally:
        if html_path and os.path.exists(html_path):
            try:
                os.remove(html_path)
            except Exception:
                pass
        shutil.rmtree(browser_tmp_dir, ignore_errors=True)


def _render_html_to_pdf(html_string: str, base_url: str, output_path: str) -> None:
    errors: list[str] = []

    if WEASYPRINT_AVAILABLE and WEASYPRINT_HTML is not None:
        try:
            WEASYPRINT_HTML(string=html_string, base_url=base_url).write_pdf(output_path)
            return
        except Exception as exc:
            logger.warning("WeasyPrint falló para panel-fotografico; intentando fallback", exc_info=True)
            errors.append(f"WeasyPrint: {exc}")
    elif _WEASYPRINT_IMPORT_ERROR is not None:
        errors.append(f"WeasyPrint: {_WEASYPRINT_IMPORT_ERROR}")

    if CHROME_PATH:
        try:
            _render_html_to_pdf_with_browser(html_string, base_url, output_path)
            return
        except Exception as exc:
            logger.warning("Fallback de navegador falló para panel-fotografico", exc_info=True)
            errors.append(f"Navegador: {exc}")

    if errors:
        raise RuntimeError(
            "No se pudo generar el PDF. "
            + " | ".join(errors)
            + " | En Windows configure GTK_RUNTIME_BIN o instale Chrome/Edge para el fallback."
        )

    raise RuntimeError("No hay un motor PDF disponible. Instale WeasyPrint o Chrome/Edge.")


_pdf_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="panel_foto_wp")


async def _render_html_to_pdf_async(html_string: str, base_url: str, output_path: str) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        _pdf_executor,
        functools.partial(_render_html_to_pdf, html_string, base_url, output_path),
    )


async def _render_panel_pdf_with_pillow_async(
    header: dict[str, Any],
    logo_left_uri: Optional[str],
    logo_right_uri: Optional[str],
    image_uris: list[str],
    output_path: str,
) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        _pdf_executor,
        functools.partial(
            _render_panel_pdf_with_pillow,
            header,
            logo_left_uri,
            logo_right_uri,
            image_uris,
            output_path,
        ),
    )


# â”€â”€ Cleanup helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _safe_remove(path: str) -> None:
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except Exception as err:
        logger.warning("Error removing temp file %s: %s", path, err)


# â”€â”€ Endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post(
    "/render-pdf",
summary="Genera un PDF de panel fotográfico manual",
    response_description="PDF con 4 imágenes por hoja (A4)",
)
async def render_pdf(
    background_tasks: BackgroundTasks,
    header_config: str = Form(..., description="JSON con los campos de la cabecera global"),
    images: List[UploadFile] = File(default=[], description="Imágenes a incluir en el panel"),
    logoLeft: Optional[UploadFile] = File(None, description="Logo izquierdo opcional"),
    logoRight: Optional[UploadFile] = File(None, description="Logo derecho opcional"),
):
    """
    Recibe `header_config` (JSON), una lista de `images` y logos opcionales.
Genera y devuelve un PDF A4 con 4 fotos por hoja, placeholders para slots vacíos,
    y la cabecera global repetida en todas las páginas.
    """
    # 1. Validar cabecera
    try:
        header_dict: dict[str, Any] = json.loads(header_config)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"header_config JSON inválido: {exc}")

    # Normalize key variants the frontend might send
    if "FECHA TRABAJO" in header_dict and "FECHA_TRABAJO" not in header_dict:
        header_dict["FECHA_TRABAJO"] = header_dict.pop("FECHA TRABAJO")
    if "DIRECCIONES AFECTADAS" in header_dict and "DIRECCIONES_AFECTADAS" not in header_dict:
        header_dict["DIRECCIONES_AFECTADAS"] = header_dict.pop("DIRECCIONES AFECTADAS")

    # 2. Validar que haya al menos 1 imagen
    valid_images = [img for img in images if img and img.filename]
    if not valid_images:
        raise HTTPException(
            status_code=400,
            detail="Se requiere al menos 1 imagen para generar el panel fotográfico.",
        )

    # 3. Convertir imágenes a data URIs (en memoria — sin disco)
    image_uris: list[str] = []
    for upload in valid_images:
        uri = await _upload_to_b64(upload)
        if uri:
            image_uris.append(uri)

    if not image_uris:
        raise HTTPException(status_code=400, detail="No se pudieron leer las imágenes subidas.")

    # 4. Convertir logos a data URIs
    logo_left_uri: Optional[str] = None
    logo_right_uri: Optional[str] = None
    if logoLeft and logoLeft.filename:
        logo_left_uri = await _upload_to_b64(logoLeft)
    if logoRight and logoRight.filename:
        logo_right_uri = await _upload_to_b64(logoRight)

    # 5. Partir imágenes en chunks de 4
    chunks = _chunk_images(image_uris, size=4)
    total_pages = len(chunks)

    # 6. Construir HTML multi-página (una página por chunk)
    pages_html: list[str] = []
    for page_num, chunk in enumerate(chunks, start=1):
        page_html = _build_panel_page_html(
            header=header_dict,
            logo_left_uri=logo_left_uri,
            logo_right_uri=logo_right_uri,
            image_uris=chunk,
            page_num=page_num,
            total_pages=total_pages,
        )
        pages_html.append(page_html)

    # For multi-page output WeasyPrint requires a single HTML document with
    # all pages inside it (using page-break-after on each page div).
    # We stitch the <body> contents together.
    if len(pages_html) == 1:
        full_html = pages_html[0]
    else:
        # Extract body content from each page and wrap in a single document
        body_parts: list[str] = []
        for page_html in pages_html:
            start = page_html.find('<div class="page">')
            end = page_html.rfind("</div>") + len("</div>")
            if start != -1 and end > start:
                body_parts.append(page_html[start:end])

        # Use the first page as the template (has all CSS) and replace its body
        template = pages_html[0]
        body_start = template.find("<body>") + len("<body>")
        body_end = template.rfind("</body>")
        combined_body = "\n".join(body_parts)
        full_html = template[:body_start] + "\n" + combined_body + "\n" + template[body_end:]

    # 7. Renderizar a PDF en un archivo temporal
    output_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            output_path = tmp.name

        try:
            await _render_html_to_pdf_async(full_html, "", output_path)
        except Exception as html_exc:
            logger.warning("HTML PDF engines failed for panel-fotografico; trying Pillow fallback", exc_info=True)
            try:
                await _render_panel_pdf_with_pillow_async(
                    header_dict,
                    logo_left_uri,
                    logo_right_uri,
                    image_uris,
                    output_path,
                )
            except Exception as pillow_exc:
                raise RuntimeError(
                    "No se pudo generar el PDF. "
                    f"HTML render: {html_exc} | Pillow: {pillow_exc}"
                ) from pillow_exc

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise RuntimeError("El PDF generado está vacío o no existe.")

    except HTTPException:
        if output_path:
            _safe_remove(output_path)
        raise
    except Exception as exc:
        if output_path:
            _safe_remove(output_path)
        logger.error("Error generando panel fotográfico PDF:\n%s", traceback.format_exc())
        error_msg = str(exc)
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Error al generar el Panel Fotográfico PDF",
                "reason": error_msg,
                "type": type(exc).__name__,
            },
        )

    # 8. Programar limpieza y devolver el PDF como stream
    background_tasks.add_task(_safe_remove, output_path)

    pdf_bytes = open(output_path, "rb").read()  # read once before cleanup

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="panel_fotografico.pdf"',
            "Content-Length": str(len(pdf_bytes)),
            "X-Filename": "panel_fotografico.pdf",
        },
    )






