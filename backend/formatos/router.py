"""
# -*- coding: utf-8 -*-
Router for the Formatos module with multiple format support.
Preserves the legacy XObject strategy for template-d.b64 and
uses visual overlay for the other builtin formats.
"""
from __future__ import annotations

import base64
import io
import logging
import os
import re
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, IndirectObject, NameObject, create_string_object

from .catalog import catalog
from .models import FormatEntry, FormatInfo, GenerateRequest, MappingStrategy, UpdateMappingRequest, VisualMapping

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/formatos", tags=["formatos"])

_TEMPLATE_NUMBER_TEXT = "0000001"
_NUMBER_XOBJECT_DRAW_COUNT = 7
_NUMBER_XOBJECT_MARKERS = (
    b"3.7440772 0 0 3.7440772",
    b"1 0 0 rg",
    b"/H2 <</MCID 93 >> BDC",
)
_NUMBER_FONT_NAME = "/FZD"
_NUMBER_FONT_SIZE = 10.6599998


def _escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _find_number_xobject(page):
    xobjects = page["/Resources"].get("/XObject")
    if xobjects is None:
        raise ValueError("Template sin XObjects")

    for _, ref in xobjects.get_object().items():
        xobject = ref.get_object()
        if xobject.get("/Subtype") != "/Form":
            continue
        data = xobject.get_data()
        if data.count(b"Tj") != _NUMBER_XOBJECT_DRAW_COUNT:
            continue
        if all(marker in data for marker in _NUMBER_XOBJECT_MARKERS):
            return xobject

    raise ValueError("No se encontro el XObject del correlativo en el template")


def _ensure_number_font(xobject) -> None:
    resources = xobject["/Resources"].get_object()
    fonts = resources["/Font"].get_object()
    font_name = NameObject(_NUMBER_FONT_NAME)

    if font_name in fonts:
        return

    fonts[font_name] = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Courier-Bold"),
            NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
        }
    )


def _update_number_xobject(page, padded_number: str) -> None:
    xobject = _find_number_xobject(page)
    _ensure_number_font(xobject)
    from pypdf.generic import ArrayObject, NumberObject

    xobject[NameObject("/BBox")] = ArrayObject([
        NumberObject(0), NumberObject(0), NumberObject(200), NumberObject(42)
    ])
    escaped_number = _escape_pdf_text(padded_number)
    xobject.set_data(
        (
            "q\n"
            "3.7440772 0 0 3.7440772 .135864258 -3.3921204 cm\n"
            "1 0 0 RG\n"
            "1 0 0 rg\n"
            "/G3 gs\n"
            "/H2 <</MCID 93 >> BDC\n"
            "/NonStruct <<>> BDC\n"
            "BT\n"
            f"{_NUMBER_FONT_NAME} {_NUMBER_FONT_SIZE} Tf\n"
            "-0.98 Tc\n"
            "1 0 0 -1 0 9 Tm\n"
            f"({escaped_number}) Tj\n"
            "ET\n"
            "Q\n"
            "EMC\n"
            "EMC\n"
        ).encode("latin-1")
    )


def _update_accessible_number(reader: PdfReader, padded_number: str) -> None:
    for object_number in sorted(reader.xref.get(0, {}).keys()):  # type: ignore[attr-defined]
        obj = reader.get_object(IndirectObject(object_number, 0, reader))  # type: ignore[attr-defined]
        if not hasattr(obj, "get"):
            continue
        if obj.get("/T") == _TEMPLATE_NUMBER_TEXT or obj.get("/E") == _TEMPLATE_NUMBER_TEXT:
            obj[NameObject("/T")] = create_string_object(padded_number)
            obj[NameObject("/E")] = create_string_object(padded_number)
            return
    logger.warning("No se encontro metadata accesible para el correlativo")


def _apply_legacy_page_number(reader: PdfReader, page, number: int) -> None:
    padded_number = str(number).zfill(7)
    _update_number_xobject(page, padded_number)
    _update_accessible_number(reader, padded_number)


def _build_overlay_stamp_pdf(ll_x: float, ll_y: float, ur_x: float, ur_y: float, clean_name: str, overlay_stream: str) -> bytes:
    overlay_bytes = overlay_stream.encode("latin-1")
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            "3 0 obj\n"
            "<< /Type /Page /Parent 2 0 R "
            f"/MediaBox [{ll_x} {ll_y} {ur_x} {ur_y}] "
            "/Resources << /Font << "
            f"/{clean_name} << /Type /Font /Subtype /Type1 /BaseFont /{clean_name} /Encoding /WinAnsiEncoding >> "
            ">> >> /Contents 4 0 R >>\n"
            "endobj\n"
        ).encode("latin-1"),
        b"4 0 obj\n<< /Length " + str(len(overlay_bytes)).encode("ascii") + b" >>\nstream\n" + overlay_bytes + b"endstream\nendobj\n",
    ]

    pdf = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets: list[int] = []
    for obj in objects:
        offsets.append(len(pdf))
        pdf += obj

    xref_offset = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
    pdf += b"0000000000 65535 f \n"
    for offset in offsets:
        pdf += f"{offset:010d} 00000 n \n".encode("ascii")
    pdf += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF"
    ).encode("ascii")
    return pdf


def _append_rounded_rect_path(parts: list[str], x: float, y: float, width: float, height: float, radius: float) -> None:
    radius = max(0.0, min(radius, width / 2, height / 2))
    if radius == 0:
        parts.append(f"{x} {y} {width} {height} re")
        return

    k = radius * 0.5522847498
    right = x + width
    top = y + height

    parts.append(f"{x + radius} {y} m")
    parts.append(f"{right - radius} {y} l")
    parts.append(f"{right - radius + k} {y} {right} {y + radius - k} {right} {y + radius} c")
    parts.append(f"{right} {top - radius} l")
    parts.append(f"{right} {top - radius + k} {right - radius + k} {top} {right - radius} {top} c")
    parts.append(f"{x + radius} {top} l")
    parts.append(f"{x + radius - k} {top} {x} {top - radius + k} {x} {top - radius} c")
    parts.append(f"{x} {y + radius} l")
    parts.append(f"{x} {y + radius - k} {x + radius - k} {y} {x + radius} {y} c")
    parts.append("h")


def _blank_number_in_xobject(page, mcids: list[int]) -> None:
    """Blank text drawn under the given MCID tags inside the page's Form XObject.

    CID-encoded templates embed digit glyphs as font subsets that only contain
    the original characters.  Direct glyph replacement is impossible because
    fonts lack glyphs for all digits 0-9.  Instead we replace every Tj glyph
    in the specified MCID sections with the CID space glyph (\\x00\\x03) so the
    old text becomes invisible.  The visual overlay then draws the new number
    on top using a standard Type1 font.
    """
    xobjects = page["/Resources"].get("/XObject")
    if not xobjects:
        return

    for _, ref in xobjects.get_object().items():
        xobj = ref.get_object()
        if xobj.get("/Subtype") != "/Form":
            continue
        data = xobj.get_data()
        modified = False

        for mcid in mcids:
            # Locate the MCID marker in the stream
            marker_pat = re.compile(
                rb'MCID\s*' + str(mcid).encode() + rb'\s*>>\s*BDC'
            )
            marker = marker_pat.search(data)
            if not marker:
                continue

            section_start = marker.end()

            # Section ends at the next MCID marker or 1500 bytes later
            next_mcid = re.search(rb'MCID\s+\d+', data[section_start + 4:])
            section_end = (
                section_start + 4 + next_mcid.start()
                if next_mcid
                else min(section_start + 1500, len(data))
            )

            section = data[section_start:section_end]
            # Replace each (glyph) Tj with (space) Tj  — CID space = \x00\x03
            new_section = re.sub(
                rb'\([^\)]{1,4}\)\s*Tj',
                b'(\x00\x03) Tj',
                section,
            )
            if new_section != section:
                data = data[:section_start] + new_section + data[section_end:]
                modified = True

        if modified:
            xobj.set_data(data)


def _apply_visual_overlay(page, number: int, mapping: VisualMapping) -> None:
    padded = str(number).zfill(mapping.padding)
    escaped_number = _escape_pdf_text(padded)
    escaped_label = _escape_pdf_text("OT:")

    mediabox = page.mediabox
    ll_x = float(mediabox.lower_left[0])
    ll_y = float(mediabox.lower_left[1])
    ur_x = float(mediabox.upper_right[0])
    ur_y = float(mediabox.upper_right[1])

    pdf_y = ur_y - mapping.y - mapping.font_size
    clean_name = mapping.font_name.replace("/", "")
    parts: list[str] = ["q"]

    has_blank = all(value is not None for value in (mapping.blank_x, mapping.blank_y, mapping.blank_width, mapping.blank_height))
    if has_blank:
        blank_pdf_y = ur_y - mapping.blank_y - mapping.blank_height  # type: ignore[operator]
        parts.append("1 1 1 rg")
        parts.append(f"{mapping.blank_x} {blank_pdf_y} {mapping.blank_width} {mapping.blank_height} re")
        parts.append("f")

        if mapping.redraw_ot_badge:
            badge_x = float(mapping.blank_x)  # type: ignore[arg-type]
            badge_y = float(blank_pdf_y)
            badge_width = float(mapping.blank_width)  # type: ignore[arg-type]
            badge_height = float(mapping.blank_height)  # type: ignore[arg-type]
            radius = min(8.0, badge_height / 2)

            parts.append(f"{mapping.color_r} {mapping.color_g} {mapping.color_b} RG")
            parts.append("1 1 1 rg")
            parts.append("1.35 w")
            _append_rounded_rect_path(parts, badge_x, badge_y, badge_width, badge_height, radius)
            parts.append("B")

            parts.append(f"{mapping.color_r} {mapping.color_g} {mapping.color_b} rg")
            parts.append("BT")
            parts.append(f"/{clean_name} {mapping.font_size} Tf")
            parts.append(f"{badge_x + 14} {pdf_y} Td")
            parts.append(f"({escaped_label}) Tj")
            parts.append("ET")
        elif mapping.redraw_top_border:
            top_y = blank_pdf_y + mapping.blank_height  # type: ignore[operator]
            right_x = mapping.blank_x + mapping.blank_width  # type: ignore[operator]
            parts.append(f"{mapping.color_r} {mapping.color_g} {mapping.color_b} RG")
            parts.append("1 w")
            parts.append(f"{mapping.blank_x} {top_y} m")
            parts.append(f"{right_x} {top_y} l")
            parts.append("S")

    parts.append(f"{mapping.color_r} {mapping.color_g} {mapping.color_b} rg")
    parts.append("BT")
    parts.append(f"/{clean_name} {mapping.font_size} Tf")
    parts.append(f"{mapping.x} {pdf_y} Td")
    parts.append(f"({escaped_number}) Tj")
    parts.append("ET")
    parts.append("Q")

    overlay_stream = "\n".join(parts) + "\n"
    stamp_pdf = _build_overlay_stamp_pdf(ll_x, ll_y, ur_x, ur_y, clean_name, overlay_stream)
    stamp_reader = PdfReader(io.BytesIO(stamp_pdf))
    page.merge_page(stamp_reader.pages[0])


def _load_template_bytes(entry: FormatEntry) -> bytes:
    path = catalog.resolve_path(entry)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Template file not found: {path}")
    if path.endswith(".b64"):
        with open(path, "r", encoding="ascii") as f:
            return base64.b64decode(f.read())
    with open(path, "rb") as f:
        return f.read()


def _generate_legacy(template_bytes: bytes, desde: int, hasta: int) -> bytes:
    writer = PdfWriter()
    for number in range(desde, hasta + 1):
        reader = PdfReader(io.BytesIO(template_bytes))
        page = reader.pages[0]
        _apply_legacy_page_number(reader, page, number)
        writer.add_page(page)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _generate_visual(template_bytes: bytes, desde: int, hasta: int, mapping: VisualMapping) -> bytes:
    writer = PdfWriter()
    for number in range(desde, hasta + 1):
        reader = PdfReader(io.BytesIO(template_bytes))
        target_page_idx = min(mapping.page, len(reader.pages) - 1)
        page = reader.pages[target_page_idx]
        if mapping.blank_mcids:
            _blank_number_in_xobject(page, mapping.blank_mcids)
        _apply_visual_overlay(page, number, mapping)
        writer.add_page(page)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _build_filename(entry: FormatEntry, desde: int, hasta: int) -> str:
    pad = entry.mapping.padding if entry.mapping else 7
    desde_s = str(desde).zfill(pad)
    hasta_s = str(hasta).zfill(pad)
    if desde == hasta:
        return entry.filename_pattern.format(id=entry.id, nombre=entry.nombre, desde=desde_s, hasta=hasta_s)
    base = entry.filename_pattern.replace(".pdf", "")
    return f"{base.format(id=entry.id, nombre=entry.nombre, desde=desde_s, hasta=hasta_s)}-{hasta_s}.pdf"


def _entry_to_info(entry: FormatEntry) -> dict:
    has_mapping = entry.strategy == MappingStrategy.legacy_xobject or entry.mapping is not None
    return FormatInfo(
        id=entry.id,
        nombre=entry.nombre,
        origen=entry.origen,
        enabled=entry.enabled,
        persisted=entry.persisted,
        strategy=entry.strategy,
        mapping=entry.mapping,
        filename_pattern=entry.filename_pattern,
        max_pages=entry.max_pages,
        number_min=entry.number_min,
        number_max=entry.number_max,
        has_mapping=has_mapping,
    ).model_dump(mode="json")


@router.get("/list", summary="Listar formatos disponibles")
def list_formats():
    return [_entry_to_info(entry) for entry in catalog.list_formats()]


@router.post("/generate", summary="Generar PDF por format_id y rango")
def generate(req: GenerateRequest):
    entry = catalog.get(req.format_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Formato no encontrado")
    if not entry.enabled:
        raise HTTPException(status_code=400, detail="Formato deshabilitado")
    if req.desde > req.hasta:
        raise HTTPException(status_code=400, detail="'desde' debe ser menor o igual a 'hasta'")

    total = req.hasta - req.desde + 1
    if total > entry.max_pages:
        raise HTTPException(status_code=400, detail=f"Maximo {entry.max_pages} paginas por solicitud")
    if req.desde < entry.number_min or req.hasta > entry.number_max:
        raise HTTPException(status_code=400, detail=f"Rango fuera de limites ({entry.number_min} - {entry.number_max})")
    if entry.strategy == MappingStrategy.visual_overlay and entry.mapping is None:
        raise HTTPException(status_code=400, detail="Este formato requiere configurar el mapping visual antes de generar")

    try:
        template_bytes = _load_template_bytes(entry)
    except FileNotFoundError:
        logger.error("Template not found for format %s", entry.id)
        raise HTTPException(status_code=500, detail="Template no encontrado en el servidor")

    try:
        if entry.strategy == MappingStrategy.legacy_xobject:
            pdf_bytes = _generate_legacy(template_bytes, req.desde, req.hasta)
        else:
            pdf_bytes = _generate_visual(template_bytes, req.desde, req.hasta, entry.mapping)  # type: ignore[arg-type]
    except Exception as exc:
        logger.exception("Error generando formato %s", entry.id)
        raise HTTPException(status_code=500, detail=str(exc))

    filename = _build_filename(entry, req.desde, req.hasta)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/upload", summary="Subir un nuevo formato PDF")
async def upload_format(file: UploadFile = File(...), nombre: str = Form(...), persisted: bool = Form(True), filename_pattern: str = Form(None)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos PDF")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Archivo demasiado grande (max 50 MB)")

    try:
        PdfReader(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="PDF invalido o corrupto")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        entry = catalog.add_uploaded(
            nombre=nombre,
            filename=os.path.basename(file.filename),
            tmp_path=tmp_path,
            persisted=bool(persisted),
            filename_pattern=filename_pattern,
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                logger.warning("No se pudo eliminar temporal %s", tmp_path)

    return _entry_to_info(entry)


@router.put("/{format_id}/mapping", summary="Actualizar mapping visual de un formato")
def update_mapping(format_id: str, payload: UpdateMappingRequest):
    entry = catalog.update_mapping(format_id, payload.mapping)
    if entry is None:
        raise HTTPException(status_code=404, detail="Formato no encontrado")
    return _entry_to_info(entry)


@router.delete("/{format_id}", summary="Eliminar o deshabilitar un formato")
def delete_format(format_id: str):
    ok = catalog.delete_format(format_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Formato no encontrado")
    return {"ok": True}


@router.post("/validate-mapping", summary="Validar visual mapping sin persistir")
def validate_mapping(mapping: VisualMapping):
    try:
        mapping = VisualMapping(**mapping.model_dump())
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors())
    return {"ok": True, "mapping": mapping.model_dump(mode="json")}