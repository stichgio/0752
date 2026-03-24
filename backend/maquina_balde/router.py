# -*- coding: utf-8 -*-
"""
Router independiente para la herramienta "Maquina de Balde".

Genera un PDF A4 multi-pagina con 4 imagenes por hoja a partir de datos de
cabecera manuales e imagenes subidas en memoria.

Endpoints expuestos (montados en /api/maquina-balde):
  POST /render-pdf  -> genera el PDF final
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import traceback
from concurrent.futures import ThreadPoolExecutor
from html import escape
from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from config import settings

logger = logging.getLogger("maquina_balde")

router = APIRouter(prefix="/api/maquina-balde", tags=["maquina-balde"])


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
    logger.warning("WeasyPrint no disponible para maquina-balde: %s", exc)

_PILLOW_IMPORT_ERROR: Optional[Exception] = None
try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps

    PILLOW_AVAILABLE = True
except ImportError as exc:
    Image = ImageDraw = ImageFont = ImageOps = None
    PILLOW_AVAILABLE = False
    _PILLOW_IMPORT_ERROR = exc
    logger.warning("Pillow no disponible para maquina-balde: %s", exc)

CHROME_PATH = _detect_browser_pdf_path()

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
    titulo = _safe(header.get("titulo"), "Maquina de Balde")
    fecha_trabajo = _safe(header.get("FECHA_TRABAJO"))
    nis = _safe(header.get("NIS"))
    sgio = _safe(header.get("SGIO"))
    direcciones = _safe(header.get("DIRECCION"))
    localidad = _safe(header.get("LOCALIDAD"))
    distrito = _safe(header.get("DISTRITO"))
    actividad = _safe(header.get("ACTIVIDAD"))

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

    page_label = f"Pagina {page_num}/{total_pages}" if total_pages > 1 else ""

    cells_html = ""
    valid_count = len(image_uris)

    if valid_count == 3:
        for idx in range(3):
            safe_uri = escape(str(image_uris[idx]), quote=True)
            extra_style = ' style="grid-column: span 2; justify-self: center; width: calc(50% - 1mm);"' if idx == 2 else ' style="width: 100%;"'
            cells_html += (
                f'<div class="photo-cell"{extra_style}>'
                f'<img src="{safe_uri}" alt="Foto {idx + 1}">'
                f"</div>"
            )
    else:
        for idx in range(4):
            if idx < valid_count:
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
    border: 1px solid #ccc; background: #f5f5f5;
    margin-bottom: 2mm; -ms-flex-negative: 0; flex-shrink: 0;
}}
.info-item {{
    -webkit-box-flex: 1; -ms-flex: 1; flex: 1;
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-align: center; -ms-flex-align: center; align-items: center;
    padding: 1.5mm 2mm; border-right: 1px solid #ccc;
    gap: 1mm;
    white-space: nowrap;
}}
.info-item:last-child {{ border-right: none; }}
.info-label {{ font-size: 9pt; font-weight: bold; text-transform: uppercase; color: #000; }}
.info-value {{ font-size: 9pt; font-weight: normal; color: #000; }}
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
    font-size: 9pt; font-weight: bold; text-transform: uppercase;
    color: #000; white-space: nowrap; padding-right: 6px;
}}
.loc-value {{ font-size: 9pt; color: #000; word-break: break-word; }}
.actividad-section {{ margin-bottom: 3mm; -ms-flex-negative: 0; flex-shrink: 0; }}
.actividad-table {{ width: 100%; border-collapse: collapse; }}
.actividad-table td {{ padding: 1.5px 0; vertical-align: baseline; }}
.panel-fotografico {{
    -webkit-box-flex: 1; -ms-flex: 1; flex: 1;
    display: -webkit-box; display: -ms-flexbox; display: flex;
    -webkit-box-orient: vertical; -webkit-box-direction: normal;
    -ms-flex-direction: column; flex-direction: column;
    min-height: 0; overflow: hidden;
}}
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
    background: #ffffff; border: 1px solid #ddd;
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
            <span class="info-label">Fecha de Trabajo:</span>
            <span class="info-value">{fecha_trabajo}</span>
        </div>
        <div class="info-item">
            <span class="info-label">NIS:</span>
            <span class="info-value">{nis}</span>
        </div>
        <div class="info-item">
            <span class="info-label">SGIO:</span>
            <span class="info-value">{sgio}</span>
        </div>
    </div>

    <section class="localizacion">
        <div class="section-title">1.0 Localizacion</div>
        <table class="loc-table">
            <tr>
                <td class="loc-label">Direccion:</td>
                <td class="loc-value" colspan="3">{direcciones}</td>
            </tr>
            <tr>
                <td style="width:50%">
                    <span class="loc-label">Localidad:</span>
                    <span class="loc-value">{localidad}</span>
                </td>
                <td style="width:50%">
                    <span class="loc-label">Distrito:</span>
                    <span class="loc-value">{distrito}</span>
                </td>
            </tr>
        </table>
    </section>

    <section class="actividad-section">
        <div class="section-title">2.0 Detalles de Orden de Trabajo</div>
        <table class="actividad-table">
            <tr>
                <td class="loc-label">Actividad:</td>
                <td class="loc-value" colspan="3">{actividad}</td>
            </tr>
        </table>
    </section>

    <section class="panel-fotografico">
        <div class="section-title">3.0 Panel Fotografico</div>
        <div class="photo-grid">
            {cells_html}
        </div>
    </section>
</div>
</body>
</html>"""


def _chunk_images(images: list[str], size: int = 4) -> list[list[str]]:
    return [images[i : i + size] for i in range(0, len(images), size)]


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
            while _text_size(draw, clipped, font)[0] > max_width and len(clipped) > 1:
                clipped = clipped[:-1]
            lines.append(clipped)
        if len(lines) >= max_lines:
            break

    if current and len(lines) < max_lines:
        lines.append(current)

    while len(lines) < max_lines:
        lines.append("")
    return lines[:max_lines]


def _render_panel_pdf_with_pillow(
    header: dict[str, Any],
    logo_left_bytes: Optional[bytes],
    logo_right_bytes: Optional[bytes],
    image_data_list: list[tuple[bytes, str]],
    page_num: int,
    total_pages: int,
) -> bytes:
    if not PILLOW_AVAILABLE:
        raise RuntimeError("Pillow no esta disponible para el fallback.")

    W_MM, H_MM = 210, 297
    DPI = 150
    w_px = int(W_MM * DPI / 25.4)
    h_px = int(H_MM * DPI / 25.4)
    pad = int(8 * DPI / 25.4)

    img = Image.new("RGB", (w_px, h_px), "white")
    draw = ImageDraw.Draw(img)

    title_font = _load_font(int(16 * DPI / 72))
    label_font = _load_font(int(9 * DPI / 72), bold=True)
    value_font = _load_font(int(9 * DPI / 72))
    section_font = _load_font(int(10 * DPI / 72), bold=True)

    header_h = int(20 * DPI / 25.4)
    info_h = int(8 * DPI / 25.4)
    section_h = int(12 * DPI / 25.4)

    y = pad
    if logo_left_bytes or logo_right_bytes:
        logo_size = int(18 * DPI / 25.4)
        if logo_left_bytes:
            try:
                logo_img = Image.open(io.BytesIO(logo_left_bytes)).convert("RGBA")
                logo_img.thumbnail((logo_size, logo_size), Image.LANCZOS)
                img.paste(logo_img, (pad, y), logo_img)
            except Exception:
                pass
        if logo_right_bytes:
            try:
                logo_img = Image.open(io.BytesIO(logo_right_bytes)).convert("RGBA")
                logo_img.thumbnail((logo_size, logo_size), Image.LANCZOS)
                img.paste(logo_img, (w_px - pad - logo_img.width, y), logo_img)
            except Exception:
                pass
        y += header_h

    draw.rectangle([(pad, y), (w_px - pad, y + 2)], fill="#333")
    y += 6

    title = header.get("titulo", "Maquina de Balde")
    tw, th = _text_size(draw, title, title_font)
    draw.text(((w_px - tw) // 2, y + (header_h - th) // 2), title, font=title_font, fill="black")
    y += header_h + int(4 * DPI / 25.4)

    bar_items = [
        ("Fecha de Trabajo:", header.get("FECHA_TRABAJO", "")),
        ("NIS:", header.get("NIS", "")),
        ("SGIO:", header.get("SGIO", "")),
    ]
    bar_w = (w_px - 2 * pad) // len(bar_items)
    draw.rectangle([(pad, y), (w_px - pad, y + info_h)], fill="#f5f5f5")
    for i, (lbl, val) in enumerate(bar_items):
        x = pad + i * bar_w
        draw.text((x + int(2 * DPI / 25.4), y + int(1.5 * DPI / 25.4)), lbl, font=label_font, fill="black")
        lbl_w = _text_size(draw, lbl, label_font)[0]
        draw.text((x + int(2 * DPI / 25.4) + lbl_w + int(1 * DPI / 25.4), y + int(1.5 * DPI / 25.4)), str(val) or "-", font=value_font, fill="black")
    y += info_h + int(2 * DPI / 25.4)

    def draw_section(title_text: str, y_pos: int) -> int:
        draw.text((pad, y_pos), title_text, font=section_font, fill="#0066cc")
        y_pos += section_h
        draw.line([(pad, y_pos), (w_px - pad, y_pos)], fill="#0066cc", width=1)
        return y_pos + int(2 * DPI / 25.4)

    y = draw_section("1.0 Localizacion", y)
    draw.text((pad, y), "Direccion:", font=label_font, fill="black")
    lbl_w = _text_size(draw, "Direccion:", label_font)[0]
    dir_val = str(header.get("DIRECCION", "") or "-")
    val_lines = _wrap_text(draw, dir_val, value_font, w_px - 2 * pad - lbl_w - int(6 * DPI / 25.4))
    draw.text((pad + lbl_w + int(6 * DPI / 25.4), y), val_lines[0], font=value_font, fill="black")
    y += int(10 * DPI / 72) + int(2 * DPI / 25.4)

    half_w = (w_px - 2 * pad) // 2
    draw.text((pad, y), "Localidad:", font=label_font, fill="black")
    loc_lbl_w = _text_size(draw, "Localidad:", label_font)[0]
    loc_val = str(header.get("LOCALIDAD", "") or "-")
    draw.text((pad + loc_lbl_w + int(4 * DPI / 25.4), y), loc_val, font=value_font, fill="black")

    dist_x = pad + half_w
    draw.text((dist_x, y), "Distrito:", font=label_font, fill="black")
    dist_lbl_w = _text_size(draw, "Distrito:", label_font)[0]
    dist_val = str(header.get("DISTRITO", "") or "-")
    draw.text((dist_x + dist_lbl_w + int(4 * DPI / 25.4), y), dist_val, font=value_font, fill="black")
    y += int(10 * DPI / 72) + int(2 * DPI / 25.4)

    y += int(2 * DPI / 25.4)
    y = draw_section("2.0 Detalles de Orden de Trabajo", y)
    draw.text((pad, y), "Actividad:", font=label_font, fill="black")
    lbl_w = _text_size(draw, "Actividad:", label_font)[0]
    act_val = str(header.get("ACTIVIDAD", "") or "-")
    act_lines = _wrap_text(draw, act_val, value_font, w_px - 2 * pad - lbl_w - int(6 * DPI / 25.4))
    draw.text((pad + lbl_w + int(6 * DPI / 25.4), y), act_lines[0], font=value_font, fill="black")
    y += int(12 * DPI / 25.4)

    y += int(2 * DPI / 25.4)
    y = draw_section("3.0 Panel Fotografico", y)

    grid_top = y
    grid_h = h_px - pad - grid_top - int(2 * DPI / 25.4)
    grid_w = w_px - 2 * pad
    cell_gap = int(2 * DPI / 25.4)
    cols, rows_num = 2, 2
    cell_w = (grid_w - cell_gap * (cols - 1)) // cols
    cell_h = (grid_h - cell_gap * (rows_num - 1)) // rows_num

    draw.rectangle([(pad, grid_top), (w_px - pad, grid_top + grid_h)], outline="#0066cc", width=1)

    valid_images = [(data, mime) for data, mime in image_data_list]
    if len(valid_images) == 3:
        positions = [(0, 0), (1, 0), (0, 1)]
        sizes = [(cell_w, cell_h), (cell_w, cell_h), (cell_w * 2 + cell_gap, cell_h)]
    else:
        positions = [(c, r) for r in range(rows_num) for c in range(cols)]
        sizes = [(cell_w, cell_h)] * 4

    for idx, ((data, mime), (cx, cy), (cw, ch)) in enumerate(zip(valid_images, positions, sizes)):
        x_cell = pad + cx * (cell_w + cell_gap) + int(2 * DPI / 25.4)
        y_cell = grid_top + cy * (cell_h + cell_gap) + int(2 * DPI / 25.4)
        inner_w = cw - 2 * int(2 * DPI / 25.4)
        inner_h = ch - 2 * int(2 * DPI / 25.4)
        try:
            cell_img = Image.open(io.BytesIO(data)).convert("RGBA")
            cell_img.thumbnail((inner_w, inner_h), Image.LANCZOS)
            img.paste(cell_img, (x_cell + (inner_w - cell_img.width) // 2, y_cell + (inner_h - cell_img.height) // 2), cell_img)
        except Exception:
            draw.rectangle([(x_cell, y_cell), (x_cell + inner_w, y_cell + inner_h)], fill="#ddd")
            draw.text((x_cell + int(2 * DPI / 25.4), y_cell + int(2 * DPI / 25.4)), f"Imagen {idx + 1}", font=value_font, fill="#999")

    buf = io.BytesIO()
    img.save(buf, format="PDF", resolution=150.0)
    return buf.getvalue()


@router.post("/render-pdf")
async def render_pdf(
    background_tasks: BackgroundTasks,
    header_config: str = Form(...),
    images: List[UploadFile] = File(default=[]),
    logo_left: Optional[UploadFile] = File(default=None),
    logo_right: Optional[UploadFile] = File(default=None),
):
    try:
        header = json.loads(header_config)
    except Exception:
        raise HTTPException(status_code=400, detail="header_config must be valid JSON")

    logo_left_b64 = await _upload_to_b64(logo_left) if logo_left else None
    logo_right_b64 = await _upload_to_b64(logo_right) if logo_right else None

    image_uris: List[str] = []
    image_data_list: List[tuple[bytes, str]] = []
    for img_file in images or []:
        mime = img_file.content_type or "image/jpeg"
        raw = await img_file.read()
        if raw:
            image_uris.append(f"data:{mime};base64,{base64.b64encode(raw).decode()}")
            image_data_list.append((raw, mime))

    chunks = _chunk_images(image_uris, 4)
    total_pages = max(len(chunks), 1)

    logo_left_bytes = None
    logo_right_bytes = None
    if logo_left:
        raw = await logo_left.read()
        logo_left_bytes = raw if raw else None
    if logo_right:
        raw = await logo_right.read()
        logo_right_bytes = raw if raw else None

    def generate() -> StreamingResponse:
        try:
            if WEASYPRINT_AVAILABLE and WEASYPRINT_HTML:
                try:
                    pages_html = ""
                    for i, chunk in enumerate(chunks):
                        page_html = _build_panel_page_html(
                            header,
                            logo_left_b64,
                            logo_right_b64,
                            chunk,
                            i + 1,
                            total_pages,
                        )
                        pages_html += page_html

                    weasy_doc = WEASYPRINT_HTML(string=pages_html)
                    weasy_bytes = weasy_doc.write_pdf()

                    return StreamingResponse(
                        io.BytesIO(weasy_bytes),
                        media_type="application/pdf",
                        headers={
                            "Content-Disposition": 'attachment; filename="maquina_balde.pdf"',
                            "X-Filename": "maquina_balde.pdf",
                        },
                    )
                except Exception as exc:
                    logger.warning("WeasyPrint fallo para maquina-balde; intentando fallback", exc_info=True)
                    if CHROME_PATH:
                        try:
                            import tempfile

                            with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as tmp_html:
                                all_html = ""
                                for i, chunk in enumerate(chunks):
                                    all_html += _build_panel_page_html(header, logo_left_b64, logo_right_b64, chunk, i + 1, total_pages)
                                tmp_html.write(all_html)
                                tmp_path = tmp_html.name

                            output_fd, output_path = tempfile.mkstemp(suffix=".pdf")
                            os.close(output_fd)
                            try:
                                subprocess.run(
                                    [
                                        CHROME_PATH,
                                        "--headless",
                                        "--no-sandbox",
                                        "--disable-gpu",
                                        "--print-to-pdf=" + output_path,
                                        "--print-to-pdf-no-header",
                                        tmp_path,
                                    ],
                                    timeout=60,
                                    check=True,
                                )
                                with open(output_path, "rb") as f:
                                    pdf_bytes = f.read()
                                return StreamingResponse(
                                    io.BytesIO(pdf_bytes),
                                    media_type="application/pdf",
                                    headers={
                                        "Content-Disposition": 'attachment; filename="maquina_balde.pdf"',
                                        "X-Filename": "maquina_balde.pdf",
                                    },
                                )
                            finally:
                                os.unlink(tmp_path)
                                if os.path.exists(output_path):
                                    os.unlink(output_path)
                        except Exception as exc2:
                            logger.warning("Fallback de navegador fallo para maquina-balde", exc_info=True)

            if PILLOW_AVAILABLE and image_data_list:
                pages_bytes = []
                for i, chunk in enumerate(chunks):
                    chunk_data = image_data_list[i * 4 : (i + 1) * 4]
                    while len(chunk_data) < 4:
                        chunk_data.append((bytes(), "image/jpeg"))
                    page_bytes = _render_panel_pdf_with_pillow(
                        header,
                        logo_left_bytes,
                        logo_right_bytes,
                        chunk_data,
                        i + 1,
                        total_pages,
                    )
                    pages_bytes.append(page_bytes)

                if len(pages_bytes) == 1:
                    final_bytes = pages_bytes[0]
                else:
                    try:
                        from pypdf import PdfWriter

                        writer = PdfWriter()
                        for page_bytes in pages_bytes:
                            from pypdf import PdfReader

                            reader = PdfReader(io.BytesIO(page_bytes))
                            for page in reader.pages:
                                writer.add_page(page)
                        buf = io.BytesIO()
                        writer.write(buf)
                        final_bytes = buf.getvalue()
                    except Exception:
                        final_bytes = pages_bytes[0]

                return StreamingResponse(
                    io.BytesIO(final_bytes),
                    media_type="application/pdf",
                    headers={
                        "Content-Disposition": 'attachment; filename="maquina_balde.pdf"',
                        "X-Filename": "maquina_balde.pdf",
                    },
                )

            raise HTTPException(status_code=500, detail="No se pudo generar el PDF")

        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Error generando maquina-balde PDF:\n%s", traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Error generando PDF: {exc}")

    return generate()
