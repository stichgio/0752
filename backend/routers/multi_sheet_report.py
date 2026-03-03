"""
Router independiente para la herramienta "Informe Multi-Hoja".

Genera un PDF multi-sección combinando N hojas/plantillas Jinja2 bajo un
encabezado principal común y, opcionalmente, un mini-encabezado compacto en
hojas intermedias.

Endpoints expuestos (montados en /api/multi-sheet/):
  GET  /templates        → lista plantillas disponibles
  POST /generate-pdf     → genera el PDF final

Cómo añadir soporte a un nuevo motor PDF:
  Reemplazar la función _render_html_to_pdf() por la implementación deseada.
  La interfaz esperada es (html_string: str, base_url: str, output_path: str) → None.
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import tempfile
import traceback
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile  # pyre-ignore
from fastapi.responses import StreamingResponse  # pyre-ignore

# ── Router ────────────────────────────────────────────────────────────────────
router = APIRouter(tags=["multi-sheet-report"])

# ── Rutas de templates ────────────────────────────────────────────────────────
# Los templates están en backend/templates/ (padre de backend/routers/)
_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(os.path.dirname(_ROUTER_DIR), "templates")

# Tipos MIME para imágenes
_MIME_MAP: Dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}

# ── Constructores de bloques HTML de encabezado ───────────────────────────────


def _build_main_header_html(header_config: Dict[str, Any]) -> str:
    """
    Construye el bloque HTML del encabezado principal (logos + título + subtítulo).

    Cómo extender el encabezado principal:
      Añadir campos al dict header_config (ej. "projectCode", "inspector") y
      referenciarlos aquí para incluirlos en el HTML generado.
    """
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
        'padding-bottom:8px;margin-bottom:10px;font-family:Arial,sans-serif;">'
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
    alt_header_config: Dict[str, Any], row_data: Dict[str, Any]
) -> str:
    """
    Construye el mini-encabezado compacto para hojas intermedias.

    Cómo extender el mini-encabezado:
      Añadir campos al dict alt_header_config (ej. "supervisorField") y
      construir el fragmento HTML correspondiente en la lista `parts`.
    """
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

    parts: List[str] = []
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


def _inject_header_into_html(template_html: str, header_html: str) -> str:
    """Inyecta el bloque de encabezado justo después de <body ...>."""
    body_tag_re = re.compile(r"(<body[^>]*>)", re.IGNORECASE)
    if body_tag_re.search(template_html):
        return body_tag_re.sub(r"\1" + header_html, template_html, count=1)
    return header_html + template_html


# ── Motor PDF ─────────────────────────────────────────────────────────────────


def _render_html_to_pdf(html_string: str, base_url: str, output_path: str) -> None:
    """
    Convierte una cadena HTML a PDF usando WeasyPrint.

    Para cambiar de motor PDF (pdfkit, xhtml2pdf, etc.) reemplazar únicamente
    esta función manteniendo la misma firma.
    """
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
    """Convierte una imagen en disco a data URI base64."""
    ext = os.path.splitext(img_path)[1].lower().lstrip(".")
    mime = _MIME_MAP.get(ext, "image/jpeg")
    try:
        with open(img_path, "rb") as f:
            raw = f.read()
        b64 = base64.b64encode(raw).decode()
        return f"data:{mime};base64,{b64}"
    except Exception:
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/templates")
async def list_templates_multi_sheet():
    """Lista las plantillas HTML disponibles en backend/templates/."""
    if not os.path.exists(TEMPLATES_DIR):
        return {"templates": []}
    templates = sorted(
        f
        for f in os.listdir(TEMPLATES_DIR)
        if f.endswith(".html") and f != "report.html"
    )
    return {"templates": templates}


@router.post("/generate-pdf")
async def generate_multi_sheet_pdf(
    background_tasks: BackgroundTasks,
    sheets_config: str = Form(...),
    header_config: str = Form(...),
    alt_header_config: str = Form(...),
    files: List[UploadFile] = File(default=[]),
):
    """
    Genera un PDF multi-sección.

    Cómo añadir una nueva hoja al informe desde el cliente:
      Incluir un objeto adicional en sheets_config con los campos:
        { order, title, templateName, useAltHeader, rowData, imageFilenames }
      y adjuntar las imágenes referenciadas en imageFilenames dentro del
      campo 'files' del FormData.

    Modos de exportación:
      - Registro único:   sheets_config contiene M hojas con el rowData del registro.
      - Todos los registros: sheets_config contiene N×M entradas (N registros × M hojas),
        generando un PDF continuo con todos los registros concatenados.
    """
    # ── Parsear campos JSON ───────────────────────────────────────────────────
    try:
        sheets: List[Any] = json.loads(sheets_config)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400, detail=f"sheets_config JSON inválido: {exc}"
        ) from exc

    try:
        header: Dict[str, Any] = json.loads(header_config)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400, detail=f"header_config JSON inválido: {exc}"
        ) from exc

    try:
        alt_header: Dict[str, Any] = json.loads(alt_header_config)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400, detail=f"alt_header_config JSON inválido: {exc}"
        ) from exc

    active_sheets = [s for s in sheets if s.get("templateName")]
    if not active_sheets:
        raise HTTPException(
            status_code=400, detail="Ninguna hoja tiene una plantilla asignada"
        )

    # ── Crear directorio temporal de trabajo ─────────────────────────────────
    tmp_dir = tempfile.mkdtemp(prefix="multi_sheet_")
    output_path: Optional[str] = None

    try:
        # ── Guardar imágenes adjuntas ─────────────────────────────────────────
        for upload_file in files:
            if upload_file.filename:
                dest = os.path.join(tmp_dir, upload_file.filename)
                content = await upload_file.read()
                with open(dest, "wb") as fout:
                    fout.write(content)

        from jinja2 import Template  # type: ignore
        from pypdf import PdfWriter  # type: ignore

        # ── Ordenar hojas y generar un PDF por hoja ───────────────────────────
        sorted_sheets = sorted(active_sheets, key=lambda s: s.get("order", 0))
        temp_pdf_paths: List[str] = []

        for sheet in sorted_sheets:
            template_name: str = sheet["templateName"]
            template_path = os.path.join(TEMPLATES_DIR, template_name)

            if not os.path.exists(template_path):
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"Plantilla '{template_name}' no encontrada en "
                        f"{TEMPLATES_DIR}"
                    ),
                )

            row_data: Dict[str, Any] = sheet.get("rowData") or {}
            image_filenames: List[str] = sheet.get("imageFilenames") or []
            use_alt_header: bool = bool(sheet.get("useAltHeader", False))

            # Leer HTML de la plantilla
            with open(template_path, "r", encoding="utf-8") as tf:
                raw_html = tf.read()

            # Construir e inyectar encabezado apropiado
            if use_alt_header:
                header_html = _build_alt_header_html(alt_header, row_data)
            else:
                header_html = _build_main_header_html(header)

            raw_html = _inject_header_into_html(raw_html, header_html)

            # Resolver imágenes a data URIs base64 para WeasyPrint
            images_b64: List[str] = []
            for fname in image_filenames:
                img_path = os.path.join(tmp_dir, fname)
                if os.path.exists(img_path):
                    data_uri = _image_to_b64(img_path)
                    if data_uri:
                        images_b64.append(data_uri)

            # Renderizar template Jinja2
            try:
                jinja_tpl = Template(raw_html)
                rendered_html = jinja_tpl.render(
                    data=row_data,
                    images=images_b64,
                    # Compatibilidad con plantillas batch (report_list / reports)
                    reports=[{"data": row_data, "images": images_b64}],
                    report_list=[{"data": row_data, "images": images_b64}],
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=500,
                    detail=f"Error al renderizar '{template_name}': {exc}",
                ) from exc

            # Convertir HTML renderizado a PDF
            try:
                tmp_pdf_file = tempfile.NamedTemporaryFile(
                    delete=False, suffix=".pdf", dir=tmp_dir
                )
                tmp_pdf_path = tmp_pdf_file.name
                tmp_pdf_file.close()
                _render_html_to_pdf(rendered_html, TEMPLATES_DIR, tmp_pdf_path)
                temp_pdf_paths.append(tmp_pdf_path)
            except Exception as exc:
                raise HTTPException(
                    status_code=500,
                    detail=f"Error al generar PDF para '{template_name}': {exc}",
                ) from exc

        if not temp_pdf_paths:
            raise HTTPException(
                status_code=400, detail="No se pudo generar ninguna hoja PDF"
            )

        # ── Concatenar PDFs con pypdf ─────────────────────────────────────────
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

        # ── Respuesta streaming + limpieza en background ──────────────────────
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
