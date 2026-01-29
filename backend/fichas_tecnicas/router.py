"""
Endpoints API REST para Fichas Técnicas de Evaluación de Actividades
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.responses import Response, FileResponse
from typing import Optional, List, Dict, Any
import io
import csv
import os
import json
from datetime import datetime

# Para XLSX
try:
    import openpyxl
    XLSX_SUPPORTED = True
except ImportError:
    XLSX_SUPPORTED = False
    print("[FichasTecnicas] openpyxl not installed - XLSX support disabled")

from .database import db
from .models import FichaTecnica

router = APIRouter(prefix="/api/fichas-tecnicas", tags=["fichas-tecnicas"])


def parse_csv_file(content: bytes) -> List[Dict[str, Any]]:
    """Parsea archivo CSV con separador punto y coma (;) o coma (,)."""
    decoded = None
    for encoding in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']:
        try:
            decoded = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if decoded is None:
        raise ValueError("No se pudo decodificar el archivo CSV")

    rows = []

    # Primero intentar con punto y coma (;)
    try:
        reader = csv.DictReader(io.StringIO(decoded), delimiter=';')
        temp_rows = list(reader)

        if temp_rows and len(temp_rows[0].keys()) > 3:
            rows = temp_rows
        else:
            raise ValueError("Too few columns with semicolon")
    except:
        reader = csv.DictReader(io.StringIO(decoded), delimiter=',')
        rows = list(reader)

    # Limpiar claves
    cleaned_rows = []
    for row in rows:
        cleaned_row = {}
        has_content = False

        for k, v in row.items():
            if k:
                clean_key = k.strip().lower().replace('\ufeff', '').replace(' ', '_')
                cleaned_row[clean_key] = v
                if v and str(v).strip() != '':
                    has_content = True

        if has_content:
            cleaned_rows.append(cleaned_row)

    return cleaned_rows


def parse_xlsx_file(content: bytes) -> List[Dict[str, Any]]:
    """Parsea archivo XLSX (Excel)."""
    if not XLSX_SUPPORTED:
        raise ValueError("Soporte XLSX no disponible. Instale openpyxl: pip install openpyxl")

    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet = workbook.active
        all_rows = list(sheet.iter_rows(values_only=True))

        if not all_rows:
            return []

        # Primera fila como headers
        headers = []
        for cell in all_rows[0]:
            if cell:
                header = str(cell).strip().lower().replace(' ', '_')
                headers.append(header)
            else:
                headers.append(f"_col_{len(headers)}")

        # Extraer datos
        parsed_rows = []
        for row in all_rows[1:]:
            if not any(row):
                continue

            row_dict = {}
            has_useful_data = False

            for col_idx, cell_value in enumerate(row):
                if col_idx < len(headers):
                    key = headers[col_idx]
                    if cell_value is not None:
                        row_dict[key] = cell_value
                        if str(cell_value).strip():
                            has_useful_data = True

            if has_useful_data:
                parsed_rows.append(row_dict)

        return parsed_rows

    except Exception as e:
        raise ValueError(f"Error procesando Excel: {str(e)}")


@router.get("/fichas")
async def get_all_fichas(
    cliente: Optional[str] = None,
    distrito: Optional[str] = None,
    status: Optional[str] = None
):
    """Obtener todas las fichas con filtros opcionales"""
    fichas = db.get_all_fichas()

    if cliente:
        fichas = [f for f in fichas if cliente.lower() in f.cliente.lower()]
    if distrito:
        fichas = [f for f in fichas if distrito.lower() in f.distrito.lower()]
    if status:
        fichas = [f for f in fichas if f.status == status]

    return {"fichas": [f.dict() for f in fichas], "total": len(fichas)}


@router.get("/fichas/{ficha_id}")
async def get_ficha(ficha_id: str):
    """Obtener una ficha específica"""
    ficha = db.get_ficha(ficha_id)
    if not ficha:
        raise HTTPException(status_code=404, detail="Ficha no encontrada")
    return ficha.dict()


@router.post("/fichas")
async def create_ficha(ficha: FichaTecnica):
    """Crear nueva ficha"""
    if db.get_ficha(ficha.id):
        raise HTTPException(status_code=400, detail="Ficha ya existe")

    ficha.last_modified = datetime.now().isoformat()
    created = db.create_ficha(ficha)
    return {"success": True, "ficha": created.dict()}


@router.put("/fichas/{ficha_id}")
async def update_ficha(ficha_id: str, ficha: FichaTecnica):
    """Actualizar ficha existente"""
    if not db.get_ficha(ficha_id):
        raise HTTPException(status_code=404, detail="Ficha no encontrada")

    ficha.last_modified = datetime.now().isoformat()
    updated = db.update_ficha(ficha_id, ficha)
    return {"success": True, "ficha": updated.dict()}


@router.delete("/fichas/{ficha_id}")
async def delete_ficha(ficha_id: str):
    """Eliminar ficha"""
    if not db.delete_ficha(ficha_id):
        raise HTTPException(status_code=404, detail="Ficha no encontrada")
    return {"success": True, "deleted_id": ficha_id}


@router.delete("/clear-all-fichas")
async def delete_all_fichas():
    """Eliminar TODAS las fichas"""
    count = db.clear_all_fichas()
    return {"success": True, "deleted_count": count, "message": f"Se eliminaron {count} fichas"}


@router.post("/import-file")
async def import_file(file: UploadFile = File(...)):
    """
    Importar archivo CSV o XLSX.
    ELIMINA TODOS los registros existentes y los reemplaza con los del archivo.
    """
    filename = file.filename.lower()

    if not filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Use archivos .csv o .xlsx"
        )

    try:
        content = await file.read()
        print(f"[FichasTecnicas Import] File: {file.filename}, Size: {len(content)} bytes")

        if filename.endswith('.csv'):
            rows = parse_csv_file(content)
        elif filename.endswith('.xlsx'):
            rows = parse_xlsx_file(content)
        else:
            rows = []

        if not rows:
            raise HTTPException(
                status_code=400,
                detail="El archivo está vacío o no tiene datos válidos"
            )

        existing_count = len(db.fichas)
        imported_fichas = db.import_from_data(rows, clear_existing=True)

        return {
            "success": True,
            "message": f"{len(imported_fichas)} fichas importadas",
            "deleted_count": existing_count,
            "imported_count": len(imported_fichas),
            "total_rows_in_file": len(rows),
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error al procesar archivo: {str(e)}"
        )


@router.post("/generate-consolidated-pdf")
async def generate_consolidated_pdf(
    background_tasks: BackgroundTasks,
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    ficha_ids: Optional[str] = Form(None),
):
    """
    Genera un PDF consolidado con todas las fichas técnicas.
    Si ficha_ids es None, incluye todas las fichas.
    """
    import tempfile
    import base64
    from jinja2 import Environment, FileSystemLoader

    try:
        all_fichas = db.get_all_fichas()

        if not all_fichas:
            raise HTTPException(status_code=400, detail="No hay fichas para exportar")

        # Filtrar por IDs si se especificaron
        if ficha_ids:
            try:
                ids_list = json.loads(ficha_ids)
                all_fichas = [f for f in all_fichas if f.id in ids_list]
            except:
                pass

        print(f"[PDF Consolidado] Generando PDF con {len(all_fichas)} fichas...")

        # Procesar logos
        async def process_logo(logo_file):
            if not logo_file:
                return None
            content = await logo_file.read()
            encoded = base64.b64encode(content).decode("utf-8")
            mime = "image/png" if logo_file.filename.lower().endswith(".png") else "image/jpeg"
            return f"data:{mime};base64,{encoded}"

        logo_left_b64 = await process_logo(logoLeft)
        logo_right_b64 = await process_logo(logoRight)

        # Cargar template
        templates_dir = os.path.join(os.path.dirname(__file__), "templates")
        env = Environment(loader=FileSystemLoader(templates_dir))
        template = env.get_template("ficha_tecnica.html")

        # Generar HTML y PDF
        from weasyprint import HTML
        from pypdf import PdfWriter, PdfReader

        pdf_writer = PdfWriter()

        for idx, ficha in enumerate(all_fichas):
            try:
                ficha_dict = ficha.dict()

                html_content = template.render(
                    ficha=ficha_dict,
                    logo_left=logo_left_b64,
                    logo_right=logo_right_b64
                )

                pdf_bytes = HTML(
                    string=html_content,
                    base_url=templates_dir
                ).write_pdf()

                reader = PdfReader(io.BytesIO(pdf_bytes))
                for page in reader.pages:
                    pdf_writer.add_page(page)

                if (idx + 1) % 10 == 0:
                    print(f"[PDF Consolidado] Procesadas {idx + 1}/{len(all_fichas)}")

            except Exception as e:
                print(f"[PDF Consolidado] Error en ficha {ficha.id}: {e}")
                continue

        # Escribir PDF final
        output = io.BytesIO()
        pdf_writer.write(output)
        output.seek(0)

        print(f"[PDF Consolidado] Completado! {len(all_fichas)} fichas generadas")

        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        temp_file.write(output.getvalue())
        temp_file.close()

        def cleanup_file(path: str):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception as e:
                print(f"Error removing temp file: {e}")

        background_tasks.add_task(cleanup_file, temp_file.name)

        return FileResponse(
            temp_file.name,
            media_type="application/pdf",
            filename=f"fichas_tecnicas_consolidado_{len(all_fichas)}.pdf"
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generando PDF consolidado: {str(e)}")


@router.get("/autocomplete/cliente")
async def autocomplete_cliente():
    """Obtener lista única de clientes"""
    fichas = db.get_all_fichas()
    clientes = list(set(f.cliente for f in fichas if f.cliente))
    return {"options": sorted(clientes)}


@router.get("/autocomplete/distrito")
async def autocomplete_distrito():
    """Obtener lista de distritos"""
    fichas = db.get_all_fichas()
    distritos = list(set(f.distrito for f in fichas if f.distrito))
    return {"options": sorted(distritos)}


@router.get("/templates")
async def list_templates():
    """Listar templates disponibles"""
    return {"templates": [{"id": "ficha_tecnica", "name": "Ficha Técnica de Evaluación"}]}
