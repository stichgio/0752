"""
Servicio de generación de documentos Word (DOCX) para Fichas Técnicas.
Genera documentos que replican la estructura del template HTML/PDF existente.
"""
from docx import Document
from docx.shared import Inches, Pt, Cm, Emu, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
import io
import base64
import tempfile
import os


# ── Estilos y constantes ──────────────────────────────────────────────

FONT_NAME = "Arial"
FONT_SIZE_TITLE = Pt(14)
FONT_SIZE_SECTION_HEADER = Pt(9)
FONT_SIZE_LABEL = Pt(9)
FONT_SIZE_VALUE = Pt(9)
FONT_SIZE_SMALL = Pt(7.5)
FONT_SIZE_FOOTER = Pt(7)

COLOR_HEADER_BG = "E0E0E0"
COLOR_BORDER = "333333"
COLOR_ACCENT = "00A0B0"
COLOR_RED = "C41E3A"
COLOR_SELECTED_BG = "262626"


def _set_cell_shading(cell, color_hex: str):
    """Aplica color de fondo a una celda."""
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def _set_cell_border(cell, **kwargs):
    """Configura los bordes de una celda."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = parse_xml(f'<w:tcBorders {nsdecls("w")}></w:tcBorders>')

    for edge, val in kwargs.items():
        element = parse_xml(
            f'<w:{edge} {nsdecls("w")} w:val="{val.get("val", "single")}" '
            f'w:sz="{val.get("sz", "4")}" w:space="0" '
            f'w:color="{val.get("color", COLOR_BORDER)}"/>'
        )
        tcBorders.append(element)
    tcPr.append(tcBorders)


def _set_cell_margins(cell, top=0, bottom=0, start=40, end=40):
    """Configura márgenes internos de celda."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:start w:w="{start}" w:type="dxa"/>'
        f'<w:end w:w="{end}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)


def _add_styled_run(paragraph, text, bold=False, size=None, color=None, font_name=FONT_NAME):
    """Agrega un run con estilo al párrafo."""
    run = paragraph.add_run(text)
    run.font.name = font_name
    if size:
        run.font.size = size
    if bold:
        run.bold = True
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    return run


def _set_table_borders(table, color=COLOR_BORDER, size="4"):
    """Aplica bordes a toda la tabla."""
    tbl = table._tbl
    tblPr = tbl.tblPr if tbl.tblPr is not None else parse_xml(f'<w:tblPr {nsdecls("w")}></w:tblPr>')
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'<w:left w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'<w:bottom w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'<w:right w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'<w:insideH w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'<w:insideV w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)


def _remove_paragraph_spacing(paragraph):
    """Elimina espaciado antes y después del párrafo."""
    pf = paragraph.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = Pt(10)


def _decode_logo_base64(logo_b64: str) -> bytes:
    """Decodifica una imagen base64 data URI a bytes."""
    if not logo_b64:
        return None
    # Remover el prefijo data:image/...;base64,
    if "base64," in logo_b64:
        logo_b64 = logo_b64.split("base64,")[1]
    return base64.b64decode(logo_b64)


# ── Generación del documento ──────────────────────────────────────────

def generate_ficha_docx(ficha_data: dict, logo_left_b64: str = None, logo_right_b64: str = None) -> bytes:
    """
    Genera un documento Word (.docx) para una ficha técnica individual.

    Args:
        ficha_data: Diccionario con los datos de la ficha técnica
        logo_left_b64: Logo izquierdo en base64 (data URI)
        logo_right_b64: Logo derecho en base64 (data URI, no usado en template actual)

    Returns:
        bytes del documento .docx generado
    """
    doc = Document()

    # ── Configurar página A4 con márgenes reducidos ──
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(0.5)
    section.bottom_margin = Cm(0.5)
    section.left_margin = Cm(1.2)
    section.right_margin = Cm(1.2)

    # Ancho útil de la página
    usable_width = section.page_width - section.left_margin - section.right_margin

    # ── Extraer datos ──
    ficha = ficha_data if isinstance(ficha_data, dict) else ficha_data
    servicio = ficha.get("servicio", {})
    tratamiento = ficha.get("tratamiento", {})
    productos = ficha.get("productos", [{}, {}, {}, {}])
    personal = ficha.get("personal_tecnico", ["", "", "", "", "", ""])
    obs_rec = ficha.get("obs_rec", {})

    # ── HEADER: Logo + Título + Número OS ──
    header_table = doc.add_table(rows=1, cols=3)
    header_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Ancho de columnas
    header_table.columns[0].width = Cm(5)
    header_table.columns[1].width = Cm(10)
    header_table.columns[2].width = Cm(3.6)

    # Logo izquierdo
    cell_logo = header_table.cell(0, 0)
    cell_logo.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    if logo_left_b64:
        try:
            logo_bytes = _decode_logo_base64(logo_left_b64)
            if logo_bytes:
                logo_stream = io.BytesIO(logo_bytes)
                p = cell_logo.paragraphs[0]
                run = p.add_run()
                run.add_picture(logo_stream, width=Cm(4.5))
        except Exception as e:
            print(f"[WordService] Error inserting logo: {e}")
    _remove_paragraph_spacing(cell_logo.paragraphs[0])

    # Título central
    cell_title = header_table.cell(0, 1)
    cell_title.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p_title = cell_title.paragraphs[0]
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p_title, "FICHA TÉCNICA DE EVALUACIÓN\nDE ACTIVIDADES", bold=True, size=FONT_SIZE_TITLE, color=COLOR_BORDER)
    _remove_paragraph_spacing(p_title)

    # Número OS
    cell_os = header_table.cell(0, 2)
    cell_os.vertical_alignment = WD_ALIGN_VERTICAL.TOP
    p_os = cell_os.paragraphs[0]
    p_os.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    os_numero = ficha.get("os_numero", "")
    os_display = os_numero.replace("OS-", "").replace("-", "") if os_numero else "00000"
    _add_styled_run(p_os, os_display, bold=True, size=Pt(14), color=COLOR_RED)
    p_os2 = cell_os.add_paragraph()
    p_os2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    _add_styled_run(p_os2, "O.S.N° ", bold=True, size=Pt(8))
    _add_styled_run(p_os2, "________", size=Pt(8))
    _remove_paragraph_spacing(p_os)
    _remove_paragraph_spacing(p_os2)

    # Remover bordes de la tabla header
    for row in header_table.rows:
        for cell in row.cells:
            _set_cell_border(cell,
                             top={"val": "none", "sz": "0", "color": "FFFFFF"},
                             bottom={"val": "none", "sz": "0", "color": "FFFFFF"},
                             left={"val": "none", "sz": "0", "color": "FFFFFF"},
                             right={"val": "none", "sz": "0", "color": "FFFFFF"})

    doc.add_paragraph()  # Espaciado

    # ── INFO: Cliente, Fecha, Dirección, Distrito ──
    _add_info_row(doc, usable_width, [
        ("Cliente :", ficha.get("cliente", ""), 0.7),
        ("Fecha :", _format_date(ficha.get("fecha", "")), 0.3),
    ])
    _add_info_row(doc, usable_width, [
        ("Dirección :", ficha.get("direccion", ""), 0.7),
        ("Distrito :", ficha.get("distrito", ""), 0.3),
    ])

    # ── SERVICIO A EFECTUAR + DIAGNÓSTICO (lado a lado) ──
    _add_section_service_diagnostic(doc, usable_width, servicio, ficha.get("diagnostico_area", ""))

    # ── CONDICIÓN SANITARIA ──
    _add_section_with_text(doc, usable_width, "CONDICIÓN SANITARIA DE LA ZONA CIRCUNDANTE",
                           ficha.get("condicion_sanitaria", ""), min_height=Cm(0.8))

    # ── TIPOS DE TRATAMIENTO ──
    _add_section_treatment(doc, usable_width, tratamiento)

    # ── PRODUCTOS QUÍMICOS Y/O BIOLÓGICOS ──
    _add_section_products(doc, usable_width, productos)

    # ── ACCIONES CORRECTIVAS ──
    _add_section_with_text(doc, usable_width, "ACCIONES CORRECTIVAS",
                           ficha.get("acciones_correctivas", ""))

    # ── ÁREAS TRATADAS ──
    _add_section_with_text(doc, usable_width, "ÁREAS TRATADAS",
                           ficha.get("areas_tratadas", ""))

    # ── PERSONAL TÉCNICO ──
    _add_section_personal(doc, usable_width, personal,
                          ficha.get("hora_inicio", ""),
                          ficha.get("hora_termino", ""),
                          ficha.get("numero_certificado", ""))

    # ── OBSERVACIONES Y RECOMENDACIONES ──
    _add_section_obs_rec(doc, usable_width, obs_rec)

    # ── EVALUACIÓN DE SATISFACCIÓN ──
    _add_section_satisfaction(doc, usable_width, ficha.get("satisfaccion", ""))

    # ── FIRMAS ──
    _add_signatures(doc)

    # ── FOOTER ──
    _add_footer(doc)

    # ── Generar bytes ──
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


# ── Funciones auxiliares de secciones ──────────────────────────────────

def _format_date(fecha_str: str) -> str:
    """Convierte fecha ISO (YYYY-MM-DD) a DD-MM-YYYY."""
    if not fecha_str:
        return ""
    try:
        parts = fecha_str.split(" ")[0].split("-")
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
    except Exception:
        pass
    return fecha_str


def _add_info_row(doc, usable_width, fields):
    """Agrega una fila de información (label: valor) con tabla invisible."""
    num_cols = len(fields) * 2  # label + valor por cada campo
    table = doc.add_table(rows=1, cols=num_cols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    col_idx = 0
    for label, value, ratio in fields:
        # Columna label
        cell_label = table.cell(0, col_idx)
        p = cell_label.paragraphs[0]
        _add_styled_run(p, label, bold=True, size=FONT_SIZE_LABEL)
        _remove_paragraph_spacing(p)
        table.columns[col_idx].width = Cm(2.2)

        # Columna valor
        cell_value = table.cell(0, col_idx + 1)
        p2 = cell_value.paragraphs[0]
        _add_styled_run(p2, str(value) if value else "", size=FONT_SIZE_VALUE)
        _remove_paragraph_spacing(p2)

        # Borde inferior para el valor
        _set_cell_border(cell_value,
                         top={"val": "none", "sz": "0", "color": "FFFFFF"},
                         bottom={"val": "single", "sz": "4", "color": COLOR_BORDER},
                         left={"val": "none", "sz": "0", "color": "FFFFFF"},
                         right={"val": "none", "sz": "0", "color": "FFFFFF"})

        # Sin bordes para label
        _set_cell_border(cell_label,
                         top={"val": "none", "sz": "0", "color": "FFFFFF"},
                         bottom={"val": "none", "sz": "0", "color": "FFFFFF"},
                         left={"val": "none", "sz": "0", "color": "FFFFFF"},
                         right={"val": "none", "sz": "0", "color": "FFFFFF"})

        col_idx += 2

    return table


def _add_section_header_row(table, row_idx, text, num_cols):
    """Agrega encabezado de sección gris en una tabla."""
    # Merge todas las columnas
    if num_cols > 1:
        cell = table.cell(row_idx, 0)
        for i in range(1, num_cols):
            cell = cell.merge(table.cell(row_idx, i))
    else:
        cell = table.cell(row_idx, 0)

    _set_cell_shading(cell, COLOR_HEADER_BG)
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p, text, bold=True, size=FONT_SIZE_SECTION_HEADER)
    _remove_paragraph_spacing(p)


def _add_section_service_diagnostic(doc, usable_width, servicio, diagnostico):
    """Sección Servicio a Efectuar + Diagnóstico lado a lado."""
    # Tabla principal 2 columnas
    table = doc.add_table(rows=6, cols=4)
    _set_table_borders(table, size="6")
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Ancho de columnas
    table.columns[0].width = Cm(6.5)
    table.columns[1].width = Cm(1.2)
    table.columns[2].width = Cm(1)  # Separador visual
    table.columns[3].width = Cm(10)

    # Header izquierdo: SERVICIO A EFECTUAR
    cell_srv_header = table.cell(0, 0).merge(table.cell(0, 1))
    _set_cell_shading(cell_srv_header, COLOR_HEADER_BG)
    p = cell_srv_header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p, "SERVICIO A EFECTUAR", bold=True, size=FONT_SIZE_SECTION_HEADER)
    _remove_paragraph_spacing(p)

    # Header derecho: DIAGNÓSTICO
    cell_diag_header = table.cell(0, 2).merge(table.cell(0, 3))
    _set_cell_shading(cell_diag_header, COLOR_HEADER_BG)
    p = cell_diag_header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p, "DIAGNÓSTICO DEL ÁREA A TRATAR", bold=True, size=FONT_SIZE_SECTION_HEADER)
    _remove_paragraph_spacing(p)

    # Servicios
    services = [
        ("1. DESINFECCIÓN", servicio.get("desinfeccion", False)),
        ("2. LIMPIEZA DE AMBIENTES", servicio.get("limpieza_ambientes", False)),
        ("3. LIMPIEZA DE POZOS SÉPTICOS", servicio.get("limpieza_pozos_septicos", False)),
        ("4. LIMPIEZA Y DESINFECCIÓN DE RESERVORIOS", servicio.get("limpieza_reservorios", False)),
    ]

    # Merge celdas del diagnóstico (filas 1-5, columnas 2-3)
    diag_cell = table.cell(1, 2).merge(table.cell(5, 3))
    p_diag = diag_cell.paragraphs[0]
    _add_styled_run(p_diag, diagnostico or "", size=FONT_SIZE_VALUE)
    _remove_paragraph_spacing(p_diag)

    for i, (label, checked) in enumerate(services):
        row_idx = i + 1
        # Nombre del servicio
        cell_name = table.cell(row_idx, 0)
        p = cell_name.paragraphs[0]
        _add_styled_run(p, label, size=FONT_SIZE_SMALL)
        _remove_paragraph_spacing(p)

        # Checkbox
        cell_chk = table.cell(row_idx, 1)
        p = cell_chk.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if checked:
            _add_styled_run(p, "☒", size=Pt(10))
        else:
            _add_styled_run(p, "☐", size=Pt(10))
        _remove_paragraph_spacing(p)

    # Fila vacía extra (fila 5) para servicios
    cell_empty = table.cell(5, 0).merge(table.cell(5, 1))
    _remove_paragraph_spacing(cell_empty.paragraphs[0])


def _add_section_with_text(doc, usable_width, title, text, min_height=None):
    """Agrega una sección con header gris y texto."""
    table = doc.add_table(rows=2, cols=1)
    _set_table_borders(table, size="6")
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header
    cell_header = table.cell(0, 0)
    _set_cell_shading(cell_header, COLOR_HEADER_BG)
    p = cell_header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p, title, bold=True, size=FONT_SIZE_SECTION_HEADER)
    _remove_paragraph_spacing(p)

    # Contenido
    cell_content = table.cell(1, 0)
    p = cell_content.paragraphs[0]
    _add_styled_run(p, text or "", size=FONT_SIZE_VALUE)
    _remove_paragraph_spacing(p)
    _set_cell_margins(cell_content, top=40, bottom=40, start=60, end=60)

    if min_height:
        # Asegurar altura mínima con saltos de línea si está vacío
        if not text:
            p.add_run("\n")


def _add_section_treatment(doc, usable_width, tratamiento):
    """Sección Tipos de Tratamiento."""
    table = doc.add_table(rows=4, cols=5)
    _set_table_borders(table, size="6")
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header
    _add_section_header_row(table, 0, "TIPOS DE TRATAMIENTO", 5)

    treatments = [
        [("Pulverizado", tratamiento.get("pulverizado", False)),
         ("Thermonebulizado", tratamiento.get("thermonebulizado", False))],
        [("Atomizado", tratamiento.get("atomizado", False)),
         ("Nebulizado ULV", tratamiento.get("nebulizado_ulv", False))],
        [("Otros: " + (tratamiento.get("otros", "") or ""), None), (None, None)],
    ]

    for row_i, row_data in enumerate(treatments):
        row_idx = row_i + 1

        # Lado izquierdo
        label_l, checked_l = row_data[0]
        cell = table.cell(row_idx, 0)
        p = cell.paragraphs[0]
        _add_styled_run(p, label_l, size=FONT_SIZE_VALUE)
        _remove_paragraph_spacing(p)

        cell_chk = table.cell(row_idx, 1)
        p = cell_chk.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if checked_l is not None:
            _add_styled_run(p, "☒" if checked_l else "☐", size=Pt(10))
        _remove_paragraph_spacing(p)

        # Espaciador central
        _remove_paragraph_spacing(table.cell(row_idx, 2).paragraphs[0])

        # Lado derecho
        label_r, checked_r = row_data[1]
        cell = table.cell(row_idx, 3)
        p = cell.paragraphs[0]
        if label_r:
            _add_styled_run(p, label_r, size=FONT_SIZE_VALUE)
        _remove_paragraph_spacing(p)

        cell_chk = table.cell(row_idx, 4)
        p = cell_chk.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if checked_r is not None:
            _add_styled_run(p, "☒" if checked_r else "☐", size=Pt(10))
        _remove_paragraph_spacing(p)


def _add_section_products(doc, usable_width, productos):
    """Sección Productos Químicos y/o Biológicos."""
    num_rows = 1 + 1 + len(productos)  # header + th + data
    table = doc.add_table(rows=num_rows, cols=7)
    _set_table_borders(table)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header
    _add_section_header_row(table, 0, "PRODUCTOS QUÍMICOS Y/O BIOLÓGICOS UTILIZADOS", 7)

    # Encabezados de columnas
    headers = ["PRODUCTO", "COMPOSICIÓN", "LOTE", "FECHA DE\nVENCIMIENTO", "UNIDAD", "CONCENTRACIÓN", "CANTIDAD"]
    for col_i, header_text in enumerate(headers):
        cell = table.cell(1, col_i)
        _set_cell_shading(cell, "F5F5F5")
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _add_styled_run(p, header_text, bold=True, size=FONT_SIZE_SMALL)
        _remove_paragraph_spacing(p)

    # Datos de productos
    for prod_i, producto in enumerate(productos):
        row_idx = prod_i + 2
        if isinstance(producto, dict):
            values = [
                producto.get("producto", ""),
                producto.get("composicion", ""),
                producto.get("lote", ""),
                producto.get("fecha_vencimiento", ""),
                producto.get("unidad", ""),
                producto.get("concentracion", ""),
                _format_cantidad(producto.get("cantidad", "")),
            ]
        else:
            values = [""] * 7

        for col_i, val in enumerate(values):
            cell = table.cell(row_idx, col_i)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            _add_styled_run(p, str(val) if val else "", size=FONT_SIZE_SMALL)
            _remove_paragraph_spacing(p)


def _format_cantidad(cantidad) -> str:
    """Formatea cantidad con 4 decimales si es numérico."""
    if not cantidad:
        return ""
    try:
        return "{:.4f}".format(float(cantidad))
    except (ValueError, TypeError):
        return str(cantidad)


def _add_section_personal(doc, usable_width, personal, hora_inicio, hora_termino, num_certificado):
    """Sección Personal Técnico + Horarios + Certificado."""
    # Personal: 3 filas x 2 columnas
    table = doc.add_table(rows=5, cols=2)
    _set_table_borders(table, size="6")
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header
    _add_section_header_row(table, 0, "PERSONAL TÉCNICO", 2)

    # 3 filas de personal (2 columnas)
    for i in range(3):
        # Columna izquierda
        cell_l = table.cell(i + 1, 0)
        p = cell_l.paragraphs[0]
        val_l = personal[i] if i < len(personal) else ""
        _add_styled_run(p, str(val_l) if val_l else "", size=FONT_SIZE_SMALL)
        _remove_paragraph_spacing(p)
        _set_cell_margins(cell_l, top=20, bottom=20, start=60, end=60)

        # Columna derecha
        cell_r = table.cell(i + 1, 1)
        p = cell_r.paragraphs[0]
        val_r = personal[i + 3] if (i + 3) < len(personal) else ""
        _add_styled_run(p, str(val_r) if val_r else "", size=FONT_SIZE_SMALL)
        _remove_paragraph_spacing(p)
        _set_cell_margins(cell_r, top=20, bottom=20, start=60, end=60)

    # Fila de horarios: merge ambas columnas y crear sub-tabla visual
    time_cell = table.cell(4, 0).merge(table.cell(4, 1))
    p = time_cell.paragraphs[0]
    _add_styled_run(p, "HORA INICIO: ", bold=True, size=FONT_SIZE_SMALL)
    _add_styled_run(p, str(hora_inicio) if hora_inicio else "      ", size=FONT_SIZE_SMALL)
    _add_styled_run(p, "       HORA TÉRMINO: ", bold=True, size=FONT_SIZE_SMALL)
    _add_styled_run(p, str(hora_termino) if hora_termino else "      ", size=FONT_SIZE_SMALL)
    _add_styled_run(p, "       N° CERTIFICADO: ", bold=True, size=FONT_SIZE_SMALL)
    _add_styled_run(p, str(num_certificado) if num_certificado else "      ", size=FONT_SIZE_SMALL)
    _remove_paragraph_spacing(p)
    _set_cell_margins(time_cell, top=30, bottom=30, start=60, end=60)


def _add_section_obs_rec(doc, usable_width, obs_rec):
    """Sección Observaciones y Recomendaciones."""
    table = doc.add_table(rows=4, cols=2)
    _set_table_borders(table, size="6")
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Headers
    cell_obs = table.cell(0, 0)
    _set_cell_shading(cell_obs, COLOR_HEADER_BG)
    p = cell_obs.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p, "OBSERVACIONES", bold=True, size=FONT_SIZE_SECTION_HEADER)
    _remove_paragraph_spacing(p)

    cell_rec = table.cell(0, 1)
    _set_cell_shading(cell_rec, COLOR_HEADER_BG)
    p = cell_rec.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p, "RECOMENDACIONES", bold=True, size=FONT_SIZE_SECTION_HEADER)
    _remove_paragraph_spacing(p)

    # Contenido
    obs_items = [
        obs_rec.get("observacion_a", ""),
        obs_rec.get("observacion_b", ""),
        obs_rec.get("observacion_c", ""),
    ]
    rec_items = [
        obs_rec.get("recomendacion_a", ""),
        obs_rec.get("recomendacion_b", ""),
        obs_rec.get("recomendacion_c", ""),
    ]
    letters = ["a)", "b)", "c)"]

    for i in range(3):
        # Observación
        cell = table.cell(i + 1, 0)
        p = cell.paragraphs[0]
        _add_styled_run(p, f"{letters[i]} ", bold=True, size=FONT_SIZE_VALUE)
        _add_styled_run(p, obs_items[i] or "", size=FONT_SIZE_VALUE)
        _remove_paragraph_spacing(p)
        _set_cell_margins(cell, top=15, bottom=15, start=40, end=40)

        # Recomendación
        cell = table.cell(i + 1, 1)
        p = cell.paragraphs[0]
        _add_styled_run(p, f"{letters[i]} ", bold=True, size=FONT_SIZE_VALUE)
        _add_styled_run(p, rec_items[i] or "", size=FONT_SIZE_VALUE)
        _remove_paragraph_spacing(p)
        _set_cell_margins(cell, top=15, bottom=15, start=40, end=40)


def _add_section_satisfaction(doc, usable_width, satisfaccion):
    """Sección Evaluación de Satisfacción del Cliente."""
    table = doc.add_table(rows=2, cols=1)
    _set_table_borders(table, size="6")
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header
    cell_header = table.cell(0, 0)
    _set_cell_shading(cell_header, COLOR_HEADER_BG)
    p = cell_header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p, "EVALUACIÓN DE SATISFACCIÓN DEL CLIENTE", bold=True, size=FONT_SIZE_SECTION_HEADER)
    _remove_paragraph_spacing(p)

    # Opciones de satisfacción
    cell_content = table.cell(1, 0)
    p = cell_content.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _set_cell_margins(cell_content, top=60, bottom=60, start=40, end=40)

    options = [
        ("😊", "Muy Satisfecho", "muy_satisfecho"),
        ("🙂", "Satisfecho", "satisfecho"),
        ("😐", "Regular", "regular"),
        ("☹️", "Insatisfecho", "insatisfecho"),
    ]

    parts = []
    for emoji, label, key in options:
        is_selected = satisfaccion == key
        if is_selected:
            parts.append(f"  ● {label}  ")
        else:
            parts.append(f"  ○ {label}  ")

    for emoji_icon, label, key in options:
        is_selected = satisfaccion == key
        if is_selected:
            _add_styled_run(p, f"  ● {label}  ", bold=True, size=FONT_SIZE_VALUE, color=COLOR_ACCENT)
        else:
            _add_styled_run(p, f"  ○ {label}  ", size=FONT_SIZE_VALUE)

    _remove_paragraph_spacing(p)


def _add_signatures(doc):
    """Agrega sección de firmas."""
    doc.add_paragraph()  # Espaciado

    table = doc.add_table(rows=2, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    labels = ["Responsable de Servicio", "Cliente", "Director Técnico"]
    for col_i, label in enumerate(labels):
        # Línea de firma
        cell_line = table.cell(0, col_i)
        p = cell_line.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _add_styled_run(p, "________________________", size=FONT_SIZE_SMALL)
        _remove_paragraph_spacing(p)

        # Label
        cell_label = table.cell(1, col_i)
        p = cell_label.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _add_styled_run(p, label, size=FONT_SIZE_SMALL)
        _remove_paragraph_spacing(p)

        # Sin bordes
        for cell in [cell_line, cell_label]:
            _set_cell_border(cell,
                             top={"val": "none", "sz": "0", "color": "FFFFFF"},
                             bottom={"val": "none", "sz": "0", "color": "FFFFFF"},
                             left={"val": "none", "sz": "0", "color": "FFFFFF"},
                             right={"val": "none", "sz": "0", "color": "FFFFFF"})


def _add_footer(doc):
    """Agrega pie de página con información de contacto."""
    doc.add_paragraph()  # Espaciado

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p, "📍 Mz J1 lote 20. Urb. Los Precursores. Surco. Lima", size=FONT_SIZE_FOOTER, color=COLOR_ACCENT)
    _add_styled_run(p, "   |   ", size=FONT_SIZE_FOOTER, color=COLOR_ACCENT)
    _add_styled_run(p, "✉ operaciones@hidroserviciosaa.com.pe", size=FONT_SIZE_FOOTER, color=COLOR_ACCENT)
    _add_styled_run(p, "   |   ", size=FONT_SIZE_FOOTER, color=COLOR_ACCENT)
    _add_styled_run(p, "📞 +51 946 803 367", size=FONT_SIZE_FOOTER, color=COLOR_ACCENT)
    _remove_paragraph_spacing(p)

    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_styled_run(p2, "🌐 www.hidroserviciosaa.com.pe", size=FONT_SIZE_FOOTER, color=COLOR_ACCENT)
    _remove_paragraph_spacing(p2)
