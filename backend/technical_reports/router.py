"""
Endpoints API REST para Informes Técnicos
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from typing import Optional
import pandas as pd
import io
from datetime import datetime

from .database import db
from .models import TechnicalReport

router = APIRouter(prefix="/api/technical-reports", tags=["technical-reports"])

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

@router.post("/import-csv")
async def import_csv(file: UploadFile = File(...)):
    """Importar informes desde archivo CSV"""
    if not file.filename.endswith(('.csv', '.CSV')):
        raise HTTPException(status_code=400, detail="El archivo debe ser CSV")
    
    try:
        content = await file.read()
        df = pd.read_csv(io.StringIO(content.decode('utf-8')))
        csv_data = df.to_dict('records')
        imported_reports = db.import_from_csv(csv_data)
        
        return {
            "success": True,
            "imported_count": len(imported_reports),
            "reports": [r.dict() for r in imported_reports]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error importando CSV: {str(e)}")

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
