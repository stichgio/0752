"""
Generacion de PDFs del Formato D (C.P. 052-2024-SEDAPAL).
Solo el numero de 7 digitos (ej. 0000001) cambia entre paginas.
"""
import base64
import io
import logging
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, IndirectObject, NameObject, create_string_object

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/formato-d", tags=["formato-d"])

_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "formato_d", "template-d.b64")
_TEMPLATE_NUMBER_TEXT = "0000001"
_NUMBER_XOBJECT_FONT = b"/F29 "
_NUMBER_XOBJECT_DRAW_COUNT = 7
_NUMBER_FONT_NAME = "/FZD"
_NUMBER_FONT_SIZE = 10.6599998
_MAX_PAGES = 500  # hard cap to avoid memory abuse


class GenerateRequest(BaseModel):
    desde: int = Field(..., ge=1, le=9999999, description="Numero inicial")
    hasta: int = Field(..., ge=1, le=9999999, description="Numero final")


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
        if _NUMBER_XOBJECT_FONT in data and data.count(b"Tj") == _NUMBER_XOBJECT_DRAW_COUNT:
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
            "1 0 0 -1 0 9 Tm\n"
            f"({escaped_number}) Tj\n"
            "ET\n"
            "Q\n"
            "EMC\n"
            "EMC\n"
        ).encode("latin-1")
    )


def _update_accessible_number(reader: PdfReader, padded_number: str) -> None:
    for object_number in sorted(reader.xref.get(0, {}).keys()):
        obj = reader.get_object(IndirectObject(object_number, 0, reader))
        if not hasattr(obj, "get"):
            continue
        if obj.get("/T") == _TEMPLATE_NUMBER_TEXT or obj.get("/E") == _TEMPLATE_NUMBER_TEXT:
            obj[NameObject("/T")] = create_string_object(padded_number)
            obj[NameObject("/E")] = create_string_object(padded_number)
            return

    logger.warning("No se encontro metadata accesible para el correlativo de Formato D")


def _apply_page_number(reader: PdfReader, page, number: int) -> None:
    padded_number = str(number).zfill(7)
    _update_number_xobject(page, padded_number)
    _update_accessible_number(reader, padded_number)


def _generate_pdf(desde: int, hasta: int) -> bytes:
    """
    Genera un PDF con paginas desde `desde` hasta `hasta` (inclusive).
    Carga el template una vez por numero para aislar los XObjects de cada pagina.
    """
    template_path = os.path.normpath(_TEMPLATE_PATH)

    with open(template_path, "r", encoding="ascii") as file_obj:
        template_bytes = base64.b64decode(file_obj.read())

    writer = PdfWriter()

    for number in range(desde, hasta + 1):
        reader = PdfReader(io.BytesIO(template_bytes))
        page = reader.pages[0]
        _apply_page_number(reader, page, number)
        writer.add_page(page)

    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


@router.post("/generate", summary="Generar PDF de Formato D")
def generate_formato_d(req: GenerateRequest):
    if req.desde > req.hasta:
        raise HTTPException(status_code=400, detail="'desde' debe ser menor o igual a 'hasta'")
    total = req.hasta - req.desde + 1
    if total > _MAX_PAGES:
        raise HTTPException(status_code=400, detail=f"Maximo {_MAX_PAGES} paginas por solicitud")

    try:
        pdf_bytes = _generate_pdf(req.desde, req.hasta)
    except FileNotFoundError:
        logger.error("Template PDF not found at %s", _TEMPLATE_PATH)
        raise HTTPException(status_code=500, detail="Template no encontrado en el servidor")
    except Exception as exc:
        logger.exception("Error generando Formato D")
        raise HTTPException(status_code=500, detail=str(exc))

    filename = (
        f"formato_d_{str(req.desde).zfill(7)}.pdf"
        if req.desde == req.hasta
        else f"formato_d_{str(req.desde).zfill(7)}-{str(req.hasta).zfill(7)}.pdf"
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
