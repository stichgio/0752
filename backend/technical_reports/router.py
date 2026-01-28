"""
Endpoints API REST para Informes Técnicos
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from typing import Optional, List, Dict, Any
import io
import csv
from datetime import datetime

# Para XLSX
try:
    import openpyxl
    XLSX_SUPPORTED = True
except ImportError:
    XLSX_SUPPORTED = False
    print("[TechReports] openpyxl not installed - XLSX support disabled")

from .database import db
from .models import TechnicalReport

router = APIRouter(prefix="/api/technical-reports", tags=["technical-reports"])


def parse_csv_file(content: bytes) -> List[Dict[str, Any]]:
    """
    Parsea archivo CSV con separador punto y coma (;) o coma (,).
    """
    # Intentar decodificar con diferentes encodings
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
        
        # Verificar si el parsing fue exitoso (más de 1 columna)
        if temp_rows and len(temp_rows[0].keys()) > 3:
            rows = temp_rows
            print(f"[CSV Parser] Parsed with semicolon delimiter: {len(rows)} rows, {len(rows[0].keys())} columns")
        else:
            raise ValueError("Too few columns with semicolon")
    except:
        # Fallback a coma (,)
        reader = csv.DictReader(io.StringIO(decoded), delimiter=',')
        rows = list(reader)
        print(f"[CSV Parser] Parsed with comma delimiter: {len(rows)} rows")
    
    # Limpiar claves y validar filas
    cleaned_rows = []
    for row in rows:
        cleaned_row = {}
        has_content = False
        
        for k, v in row.items():
            if k:
                # Limpiar clave: minúsculas, quitar BOM/espacios y reemplazar espacios por guiones bajos
                clean_key = k.strip().lower().replace('\ufeff', '').replace(' ', '_')
                cleaned_row[clean_key] = v
                
                # Check fundamental si la fila tiene CONTENIDO
                if v and str(v).strip() != '':
                    has_content = True
        
        # VALIDACIÓN RELAJADA:
        # Si la fila tiene algún contenido, la pasamos.
        # Database.py se encarga de asignar ID si falta (auto-increment).
        if has_content:
            cleaned_rows.append(cleaned_row)
    
    return cleaned_rows


def parse_xlsx_file(content: bytes) -> List[Dict[str, Any]]:
    """
    Parsea archivo XLSX (Excel) con detección robusta de headers.
    """
    if not XLSX_SUPPORTED:
        raise ValueError("Soporte XLSX no disponible. Instale openpyxl: pip install openpyxl")
    
    workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    sheet = workbook.active
    
    rows = []
    headers = []
    header_row_index = -1
    
    all_rows = list(sheet.iter_rows(values_only=True))
    
    # Buscar fila de headers (debe contener 'informe_id' o similar)
    for idx, row in enumerate(all_rows[:15]):  # Buscar en primeras 15 filas
        row_values = [str(cell).strip().lower() if cell else '' for cell in row]
        
        # Detectar si esta fila contiene headers conocidos
        if any(key in row_values for key in ['informe_id', 'cs', 'contratista', 'codigo_infraestructura']):
            header_row_index = idx
            # Normalizar: minúsculas, espacios a guiones bajos
            headers = []
            for i, cell in enumerate(row):
                if cell:
                    header = str(cell).strip().lower().replace(' ', '_').replace('\n', '_')
                    headers.append(header)
                else:
                    headers.append(f'_col_{i}')
            print(f"[XLSX] Headers detectados en fila {idx + 1}: {len(headers)} columnas")
            break
    
    if header_row_index == -1:
        raise ValueError("No se encontró fila de encabezados válida (debe contener 'informe_id', 'cs', etc.)")
    
    # Procesar datos
    for row in all_rows[header_row_index + 1:]:
        row_dict = {}
        has_content = False
        
        for col_idx, cell in enumerate(row):
            if col_idx < len(headers):
                key = headers[col_idx]
                if key and not key.startswith('_col_'):
                    row_dict[key] = cell
                    if cell is not None and str(cell).strip() not in ('', 'None', 'nan'):
                        has_content = True
        
        if has_content:
            rows.append(row_dict)
    
    print(f"[XLSX] Parseadas {len(rows)} filas de datos")
    return rows


@router.get("/reports")
async def get_all_reports(
    cs: Optional[str] = None,
    contratista: Optional[str] = None,
    status: Optional[str] = None
):
    """Obtener todos los informes con filtros opcionales"""
    reports = db.get_all_reports()
    
    if cs:
        reports = [r for r in reports if r.header.cs == cs]
    if contratista:
        reports = [r for r in reports if r.header.contratista == contratista]
    if status:
        reports = [r for r in reports if r.status == status]
    
    return {"reports": [r.dict() for r in reports], "total": len(reports)}

@router.get("/reports/{report_id}")
async def get_report(report_id: str):
    """Obtener un informe específico"""
    report = db.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    return report.dict()

@router.post("/reports")
async def create_report(report: TechnicalReport):
    """Crear nuevo informe"""
    if db.get_report(report.id):
        raise HTTPException(status_code=400, detail="Informe ya existe")
    
    report.last_modified = datetime.now().isoformat()
    created = db.create_report(report)
    return {"success": True, "report": created.dict()}

@router.put("/reports/{report_id}")
async def update_report(report_id: str, report: TechnicalReport):
    """Actualizar informe existente"""
    if not db.get_report(report_id):
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    
    report.last_modified = datetime.now().isoformat()
    updated = db.update_report(report_id, report)
    return {"success": True, "report": updated.dict()}

@router.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    """Eliminar informe"""
    if not db.delete_report(report_id):
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    return {"success": True, "deleted_id": report_id}


@router.post("/import-file")
async def import_file(file: UploadFile = File(...)):
    """
    Importa archivo CSV o XLSX.
    ELIMINA TODOS los registros existentes y los reemplaza con los del archivo.
    
    Formatos soportados:
    - CSV (separador: punto y coma ; o coma ,)
    - XLSX (Excel)
    """
    filename = file.filename.lower()
    
    # Validar extensión del archivo
    if not filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Use archivos .csv o .xlsx"
        )
    
    try:
        # Leer contenido del archivo
        content = await file.read()
        print(f"[Import] File: {file.filename}, Size: {len(content)} bytes")
        
        # Parsear según el tipo de archivo
        if filename.endswith('.csv'):
            rows = parse_csv_file(content)
        elif filename.endswith('.xlsx'):
            rows = parse_xlsx_file(content)
        else:
            rows = []
        
        print(f"[DEBUG] Filas parseadas del archivo: {len(rows)}")
        
        if not rows:
            raise HTTPException(
                status_code=400,
                detail="El archivo está vacío o no tiene datos válidos"
            )
        
        # Contar registros existentes
        existing_count = len(db.reports)
        
        # Importar (esto elimina los existentes y agrega los nuevos)
        imported_reports = db.import_from_csv(rows, clear_existing=True)
        
        print(f"[DEBUG] Registros importados: {len(imported_reports)}")
        
        response = {
            "success": True,
            "message": f"{len(imported_reports)} informes importados",
            "deleted_count": existing_count,
            "imported_count": len(imported_reports),
            "total_rows_in_file": len(rows),
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[ERROR] Importación fallida: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error al procesar archivo: {str(e)}"
        )


@router.post("/import-csv")
async def import_csv(file: UploadFile = File(...)):
    """
    Importar informes desde archivo CSV o XLSX.
    ELIMINA TODOS los registros existentes y los reemplaza con los del archivo.
    
    Este endpoint ahora soporta ambos formatos.
    """
    # Redirigir al nuevo endpoint unificado
    return await import_file(file=file)


@router.post("/reports/{report_id}/generate-pdf")
async def generate_pdf(report_id: str):
    """Generar PDF del informe"""
    report = db.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    
    try:
        import os
        from report_service import ReportService
        
        # Localizar el directorio de templates específico para informes técnicos
        current_dir = os.path.dirname(os.path.abspath(__file__))
        templates_dir = os.path.join(current_dir, "templates")
        
        service = ReportService(templates_dir=templates_dir)
        template = service.get_template("informe_tecnico.html")
        
        # Renderizar HTML con los datos del informe
        html_content = template.render(report=report.dict())
        
        # Generar PDF usando WeasyPrint (vía report_service context)
        from weasyprint import HTML as WeasyHTML
        pdf_bytes = WeasyHTML(string=html_content).write_pdf()
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=informe_{report_id}.pdf"}
        )
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Error generando PDF para {report_id}:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")

@router.get("/autocomplete/cs")
async def autocomplete_cs():
    """Obtener lista única de Centros de Servicio"""
    reports = db.get_all_reports()
    cs_list = list(set(r.header.cs for r in reports if r.header.cs))
    return {"options": sorted(cs_list)}

@router.get("/autocomplete/contratista")
async def autocomplete_contratista(cs: Optional[str] = None):
    """Obtener lista de contratistas"""
    reports = db.get_all_reports()
    if cs:
        reports = [r for r in reports if r.header.cs == cs]
    contratistas = list(set(r.header.contratista for r in reports if r.header.contratista))
    return {"options": sorted(contratistas)}

@router.get("/templates")
async def list_templates():
    """Listar templates disponibles"""
    return {"templates": [{"id": "informe_tecnico", "name": "Informe Técnico SEDAPAL"}]}
