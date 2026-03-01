"""
Endpoints API REST para Fichas Técnicas de Evaluación de Actividades
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, BackgroundTasks  # type: ignore
from fastapi.responses import Response, FileResponse, StreamingResponse  # type: ignore
from typing import Optional, List, Dict, Any
import io
import csv
import os
import json
import unicodedata
from datetime import datetime

# Para XLSX
try:
    import openpyxl  # type: ignore
    XLSX_SUPPORTED = True
except ImportError:
    XLSX_SUPPORTED = False
    print("[FichasTecnicas] openpyxl not installed - XLSX support disabled")

from .database import db  # type: ignore
from .models import FichaTecnica  # type: ignore

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
            raise ValueError("Muy pocas columnas con punto y coma")
    except Exception:
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
        # Use values_only=False to access number_format
        all_rows = list(sheet.iter_rows(values_only=False)) # type: ignore

        if not all_rows:
            return []

        def normalize_header(s):
            if not s: return f"_col_"
            # Normalize unicode characters (remove accents)
            s_norm = unicodedata.normalize('NFKD', str(s)).encode('ASCII', 'ignore').decode('utf-8')
            return s_norm.strip().lower().replace(' ', '_')

        # Primera fila como headers
        headers = []
        for cell in all_rows[0]:
            headers.append(normalize_header(cell.value) if cell else f"_col_{len(headers)}")

        # Extraer datos
        parsed_rows = []
        for row in all_rows[1:]:  # type: ignore
            # Check if row has any values
            if not any(c.value for c in row if c is not None):
                continue

            row_dict = {}
            has_useful_data = False

            for col_idx, cell in enumerate(row):
                if col_idx < len(headers):
                    key = str(headers[col_idx])  # type: ignore
                    cell_value = cell.value if cell else None

                    if cell_value is not None:
                        # Special handling for 'concentracion' columns to preserve precision
                        # 'concentracion' match is now safe due to normalization
                        if 'concentracion' in key and isinstance(cell_value, (int, float)) and cell:
                            try:
                                fmt = cell.number_format
                                # Common Excel numeric formats
                                if '0.000' in fmt:
                                    cell_value = "{:.3f}".format(cell_value)
                                elif '0.00' in fmt:
                                    cell_value = "{:.2f}".format(cell_value)
                                elif '0.0' in fmt:
                                     # Catch formats like 0.0 or 0.0_
                                     cell_value = "{:.1f}".format(cell_value)
                                elif fmt == '0' or fmt == '#':
                                    cell_value = "{:.0f}".format(cell_value)
                            except (ValueError, TypeError):
                                pass # Fallback to standard conversion

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

    return {"fichas": [f.model_dump() for f in fichas], "total": len(fichas)}


@router.get("/fichas/{ficha_id}")
async def get_ficha(ficha_id: str):
    """Obtener una ficha específica"""
    ficha = db.get_ficha(ficha_id)
    if not ficha:
        raise HTTPException(status_code=404, detail="Ficha no encontrada")
    return ficha.model_dump()


@router.post("/fichas")
async def create_ficha(ficha: FichaTecnica):
    """Crear nueva ficha"""
    if db.get_ficha(ficha.id):
        raise HTTPException(status_code=400, detail="Ficha ya existe")

    ficha.last_modified = datetime.now().isoformat()
    created = db.create_ficha(ficha)
    return {"success": True, "ficha": created.model_dump()}


@router.put("/fichas/{ficha_id}")
async def update_ficha(ficha_id: str, ficha: FichaTecnica):
    """Actualizar ficha existente"""
    if not db.get_ficha(ficha_id):
        raise HTTPException(status_code=404, detail="Ficha no encontrada")

    ficha.last_modified = datetime.now().isoformat()
    updated = db.update_ficha(ficha_id, ficha)
    return {"success": True, "ficha": updated.model_dump()}


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
    filename = (file.filename or "").lower()

    if not filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Use archivos .csv o .xlsx"
        )

    try:
        content: bytes = await file.read()
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
    from jinja2 import Environment, FileSystemLoader  # type: ignore

    try:
        all_fichas = db.get_all_fichas()

        if not all_fichas:
            raise HTTPException(status_code=400, detail="No hay fichas para exportar")

        # Filtrar por IDs si se especificaron
        if ficha_ids:
            try:
                ids_list = json.loads(ficha_ids)
                if isinstance(ids_list, list):
                    all_fichas = [f for f in all_fichas if f.id in ids_list]
            except (json.JSONDecodeError, TypeError):
                raise HTTPException(status_code=400, detail="Formato de ficha_ids inválido")

        print(f"[PDF Consolidado] Generando PDF con {len(all_fichas)} fichas...")

        # Procesar logos
        async def process_logo(logo_file):
            if not logo_file:
                return None
            content = await logo_file.read()
            encoded = base64.b64encode(content).decode("utf-8")
            fname = (logo_file.filename or "").lower()
            mime = "image/png" if fname.endswith(".png") else "image/jpeg"
            return f"data:{mime};base64,{encoded}"

        logo_left_b64 = await process_logo(logoLeft)
        logo_right_b64 = await process_logo(logoRight)

        # Cargar template
        templates_dir = os.path.join(os.path.dirname(__file__), "templates")
        env = Environment(loader=FileSystemLoader(templates_dir))
        template = env.get_template("ficha_tecnica.html")

        # =====================================================================
        # STREAMING OPTIMIZADO: Generar PDFs en lotes y merge incremental
        # =====================================================================
        from weasyprint import HTML  # type: ignore
        from pypdf import PdfWriter  # type: ignore
        from concurrent.futures import ThreadPoolExecutor
        import gc

        # Configuración de batching
        PDF_BATCH_SIZE = 5
        temp_pdf_files = []

        def render_single_pdf(ficha_data):
            """Renderiza un PDF individual a archivo temporal"""
            temp_pdf = None
            try:
                html_content = template.render(
                    ficha=ficha_data,
                    logo_left=logo_left_b64,
                    logo_right=logo_right_b64
                )

                temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
                temp_pdf_name = temp_pdf.name
                temp_pdf.close()
                HTML(string=html_content, base_url=templates_dir).write_pdf(temp_pdf_name)
                return temp_pdf_name
            except Exception as e:
                print(f"[PDF Consolidado] Error renderizando: {e}")
                if temp_pdf and os.path.exists(temp_pdf.name):
                    try:
                        os.remove(temp_pdf.name)
                    except OSError:
                        pass
                return None

        # Generar PDFs en lotes paralelos
        for batch_start in range(0, len(all_fichas), PDF_BATCH_SIZE):
            batch_end = min(batch_start + PDF_BATCH_SIZE, len(all_fichas))
            batch_fichas = all_fichas[batch_start:batch_end]  # type: ignore

            with ThreadPoolExecutor(max_workers=PDF_BATCH_SIZE) as executor:
                batch_dicts = [f.model_dump() for f in batch_fichas]
                results = list(executor.map(render_single_pdf, batch_dicts))

                for pdf_path in results:
                    if pdf_path:
                        temp_pdf_files.append(pdf_path)

            print(f"[PDF Consolidado] Procesadas {min(batch_end, len(all_fichas))}/{len(all_fichas)}")
            gc.collect()

        if not temp_pdf_files:
            raise HTTPException(status_code=500, detail="No se pudo generar ningún PDF")

        # Crear archivo final para streaming
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        temp_file.close()

        # ✅ STREAMING MERGE: Usar append para menor uso de memoria
        pdf_writer = PdfWriter()
        try:
            for pdf_path in temp_pdf_files:
                try:
                    pdf_writer.append(pdf_path)
                    os.remove(pdf_path)
                except Exception as e:
                    print(f"[PDF Consolidado] Error en merge: {e}")
                    try:
                        os.remove(pdf_path)
                    except OSError:
                        pass

            with open(temp_file.name, 'wb') as f:
                pdf_writer.write(f)
        finally:
            pdf_writer.close()
            del pdf_writer
            gc.collect()

        # =====================================================================
        # Compresión Ghostscript (opcional)
        # =====================================================================
        from report_service import GHOSTSCRIPT_ENABLED, GHOSTSCRIPT_QUALITY, _compress_pdf_with_ghostscript  # type: ignore

        if GHOSTSCRIPT_ENABLED and len(all_fichas) > 1:
            print(f"[PDF Consolidado] Aplicando compresión Ghostscript...")
            success, _, stats = _compress_pdf_with_ghostscript(
                temp_file.name,
                quality=GHOSTSCRIPT_QUALITY
            )
            if success and "reduction_percent" in stats:
                print(f"[PDF Consolidado] Compresión: {stats['reduction_percent']}% reducción")

        print(f"[PDF Consolidado] ✅ Completado! {len(all_fichas)} fichas generadas")

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


@router.post("/generate-consolidated-pdf-progress")
async def generate_consolidated_pdf_progress(
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    ficha_ids: Optional[str] = Form(None),
):
    """SSE version of generate-consolidated-pdf with real-time progress."""
    import asyncio
    import uuid
    import tempfile
    import base64
    from progress import format_sse_event  # type: ignore

    # Read logos before streaming starts
    logo_left_bytes = await logoLeft.read() if logoLeft else None
    logo_right_bytes = await logoRight.read() if logoRight else None
    logo_left_fname = (logoLeft.filename or "") if logoLeft else ""
    logo_right_fname = (logoRight.filename or "") if logoRight else ""

    async def event_generator():
        progress_queue: asyncio.Queue = asyncio.Queue()

        async def on_progress(phase: str, current: int, total: int, detail: str = ""):
            await progress_queue.put({"phase": phase, "current": current, "total": total, "detail": detail})

        async def run_generation():
            try:
                from jinja2 import Environment, FileSystemLoader  # type: ignore
                from weasyprint import HTML  # type: ignore
                from pypdf import PdfWriter  # type: ignore
                from concurrent.futures import ThreadPoolExecutor
                from report_service import GHOSTSCRIPT_ENABLED, GHOSTSCRIPT_QUALITY, _compress_pdf_with_ghostscript  # type: ignore
                import gc

                all_fichas = db.get_all_fichas()
                if not all_fichas:
                    raise Exception("No hay fichas para exportar")

                if ficha_ids:
                    try:
                        ids_list = json.loads(ficha_ids)
                        if isinstance(ids_list, list):
                            all_fichas = [f for f in all_fichas if f.id in ids_list]
                    except (json.JSONDecodeError, TypeError):
                        pass

                total = len(all_fichas)
                await on_progress("preparing", 0, total, "")

                # Process logos
                def encode_logo(content, fname):
                    if not content:
                        return None
                    encoded = base64.b64encode(content).decode("utf-8")
                    mime = "image/png" if fname.lower().endswith(".png") else "image/jpeg"
                    return f"data:{mime};base64,{encoded}"

                logo_left_b64 = encode_logo(logo_left_bytes, logo_left_fname)
                logo_right_b64 = encode_logo(logo_right_bytes, logo_right_fname)

                templates_dir = os.path.join(os.path.dirname(__file__), "templates")
                env = Environment(loader=FileSystemLoader(templates_dir))
                template = env.get_template("ficha_tecnica.html")

                PDF_BATCH_SIZE = 5
                temp_pdf_files = []

                def render_single_pdf(ficha_data):
                    try:
                        html_content = template.render(
                            ficha=ficha_data,
                            logo_left=logo_left_b64,
                            logo_right=logo_right_b64
                        )
                        temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
                        HTML(string=html_content, base_url=templates_dir).write_pdf(temp_pdf.name)
                        temp_pdf.close()
                        return temp_pdf.name
                    except Exception as e:
                        print(f"[PDF Consolidado Fichas] Error renderizando: {e}")
                        return None

                for batch_start in range(0, total, PDF_BATCH_SIZE):
                    batch_end = min(batch_start + PDF_BATCH_SIZE, total)
                    batch_fichas = all_fichas[batch_start:batch_end]
                    with ThreadPoolExecutor(max_workers=PDF_BATCH_SIZE) as executor:
                        results = list(executor.map(render_single_pdf, [f.model_dump() for f in batch_fichas]))
                        temp_pdf_files.extend([p for p in results if p])
                    await on_progress("rendering", min(batch_end, total), total, "")
                    gc.collect()

                if not temp_pdf_files:
                    raise Exception("No se pudo generar ningún PDF")

                await on_progress("merging", 0, len(temp_pdf_files), "")

                filename = f"pdf_{uuid.uuid4().hex[:12]}.pdf"
                output_path = os.path.join(tempfile.gettempdir(), filename)

                pdf_writer = PdfWriter()
                for pdf_path in temp_pdf_files:
                    try:
                        pdf_writer.append(pdf_path)
                        os.remove(pdf_path)
                    except Exception:
                        try:
                            os.remove(pdf_path)
                        except OSError:
                            pass

                with open(output_path, 'wb') as f:
                    pdf_writer.write(f)
                pdf_writer.close()
                del pdf_writer
                gc.collect()

                if GHOSTSCRIPT_ENABLED and total > 1:
                    await on_progress("compressing", 0, 1, "")
                    _compress_pdf_with_ghostscript(output_path, quality=GHOSTSCRIPT_QUALITY)

                await progress_queue.put({"phase": "done", "download_url": f"/api/download-temp/{filename}"})
            except Exception as e:
                try:
                    await progress_queue.put({"phase": "error", "detail": str(e)})
                except Exception:
                    progress_queue.put_nowait({"phase": "error", "detail": str(e)})
            except BaseException as e:
                progress_queue.put_nowait({"phase": "error", "detail": "La generación fue interrumpida"})
                raise
            finally:
                try:
                    progress_queue.put_nowait(None)
                except Exception:
                    pass

        asyncio.create_task(run_generation())

        while True:
            msg = await progress_queue.get()
            if msg is None:
                break
            phase = msg.get("phase", "")
            event = "done" if phase == "done" else "error" if phase == "error" else "progress"
            yield format_sse_event(msg, event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


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


@router.post("/generate-pdf")
async def generate_pdf(
    fichaId: str = Form(...),
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
):
    """
    Genera un PDF para una ficha técnica individual.
    """
    import base64
    from jinja2 import Environment, FileSystemLoader  # type: ignore

    try:
        ficha = db.get_ficha(fichaId)
        if not ficha:
            raise HTTPException(status_code=404, detail="Ficha no encontrada")

        async def process_logo(logo_file):
            if not logo_file:
                return None
            content = await logo_file.read()
            encoded = base64.b64encode(content).decode("utf-8")
            fname = (logo_file.filename or "").lower()
            mime = "image/png" if fname.endswith(".png") else "image/jpeg"
            return f"data:{mime};base64,{encoded}"

        logo_left_b64 = await process_logo(logoLeft)
        logo_right_b64 = await process_logo(logoRight)

        templates_dir = os.path.join(os.path.dirname(__file__), "templates")
        env = Environment(loader=FileSystemLoader(templates_dir))
        template = env.get_template("ficha_tecnica.html")

        ficha_dict = ficha.model_dump()

        html_content = template.render(
            ficha=ficha_dict,
            logo_left=logo_left_b64,
            logo_right=logo_right_b64
        )

        from weasyprint import HTML  # type: ignore
        pdf_bytes = HTML(
            string=html_content,
            base_url=templates_dir
        ).write_pdf()

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=ficha_tecnica_{fichaId}.pdf"}
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")


@router.get("/templates")
async def list_templates():
    """Listar templates disponibles"""
    return {"templates": [{"id": "ficha_tecnica", "name": "Ficha Técnica de Evaluación"}]}


@router.post("/generate-template-pdf")
async def generate_template_pdf(
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
):
    """
    Genera un PDF con la plantilla en blanco de ficha técnica.
    """
    import base64
    from jinja2 import Environment, FileSystemLoader  # type: ignore

    try:
        async def process_logo(logo_file):
            if not logo_file:
                return None
            content = await logo_file.read()
            encoded = base64.b64encode(content).decode("utf-8")
            fname = (logo_file.filename or "").lower()
            mime = "image/png" if fname.endswith(".png") else "image/jpeg"
            return f"data:{mime};base64,{encoded}"

        logo_left_b64 = await process_logo(logoLeft)
        logo_right_b64 = await process_logo(logoRight)

        templates_dir = os.path.join(os.path.dirname(__file__), "templates")
        env = Environment(loader=FileSystemLoader(templates_dir))
        template = env.get_template("ficha_tecnica.html")

        template_ficha = {
            "id": "XXXXXXXX",
            "os_numero": "OS-0000-000000",
            "cliente": "NOMBRE DEL CLIENTE",
            "direccion": "DIRECCIÓN DE LA OBRA",
            "distrito": "DISTRITO",
            "fecha": "__/__/____",
            "contacto": "NOMBRE DE CONTACTO",
            "telefono": "000-000-000",
            "email": "email@cliente.com",
            "tipo_obra": "TIPO DE OBRA",
            "area_obra": "0.00 m²",
            "duracion": "0 días",
            "estado": "Pendiente",
            "observaciones": "",
            "tipo-red": "TIPO DE RED",
            "sector": "SECTOR",
            "conductor": "",
            "seccion": "",
            "calibre": "",
            "longitud": "",
            "material": "",
            "elementos": [],
            "imagenes": [],
            "metadata": {
                "version": "1.0",
                "created_at": datetime.now().isoformat(),
                "author": "Sistema de Fichas Técnicas"
            }
        }

        html_content = template.render(
            ficha=template_ficha,
            logo_left=logo_left_b64,
            logo_right=logo_right_b64
        )

        from weasyprint import HTML  # type: ignore
        pdf_bytes = HTML(
            string=html_content,
            base_url=templates_dir
        ).write_pdf()

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=plantilla_ficha_tecnica.pdf"}
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generando plantilla PDF: {str(e)}")
