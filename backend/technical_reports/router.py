"""
Router FastAPI para endpoints de informes técnicos
Prefijo: /api/technical-reports
"""
from fastapi import APIRouter, UploadFile, HTTPException, Query
from fastapi.responses import Response
from typing import Optional, List
import os
from .models import TechnicalReport, ReportListItem
from .database import db_manager
from .service import service

router = APIRouter(
    prefix="/api/technical-reports",
    tags=["technical-reports"]
)

@router.post("/import-csv")
async def import_csv(file: UploadFile):
    """Importar informes desde CSV"""
    if not file.filename.endswith(('.csv', '.CSV')):
        raise HTTPException(400, "El archivo debe ser CSV")
    
    # Guardar temporalmente
    temp_path = f"/tmp/tech_reports_{file.filename}"
    try:
        content = await file.read()
        with open(temp_path, 'wb') as f:
            f.write(content)
        
        # Importar
        imported, errors = db_manager.import_from_csv(temp_path)
        
        # Convertir a lista simple
        report_items = [
            ReportListItem(
                id=r.id,
                informe_id=r.metadata.informe_id,
                cs=r.header.cs,
                codigo_infraestructura=r.header.codigo_infraestructura,
                status=r.status,
                last_modified=r.last_modified
            )
            for r in imported
        ]
        
        return {
            "success": True,
            "imported_count": len(imported),
            "reports": [r.dict() for r in report_items],
            "errors": errors
        }
    
    except Exception as e:
        raise HTTPException(500, f"Error importando CSV: {str(e)}")
    
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.get("/reports")
async def get_reports(
    cs: Optional[str] = Query(None),
    contratista: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Obtener todos los reportes con filtros opcionales"""
    filters = {}
    if cs:
        filters['cs'] = cs
    if contratista:
        filters['contratista'] = contratista
    if status:
        filters['status'] = status
    
    reports = db_manager.get_all(filters)
    
    return {
        "reports": reports,
        "total": len(reports)
    }

@router.get("/reports/{report_id}")
async def get_report(report_id: str):
    """Obtener un reporte específico"""
    report = db_manager.get_by_id(report_id)
    
    if not report:
        raise HTTPException(404, "Reporte no encontrado")
    
    return report

@router.post("/reports")
async def create_report(report: TechnicalReport):
    """Crear nuevo reporte"""
    try:
        created = db_manager.create(report)
        return {"success": True, "report": created}
    except Exception as e:
        raise HTTPException(500, f"Error creando reporte: {str(e)}")

@router.put("/reports/{report_id}")
async def update_report(report_id: str, report: TechnicalReport):
    """Actualizar reporte"""
    try:
        updated = db_manager.update(report_id, report)
        return {"success": True, "report": updated}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error actualizando: {str(e)}")

@router.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    """Eliminar reporte"""
    report = db_manager.get_by_id(report_id)
    if not report:
        raise HTTPException(404, "Reporte no encontrado")
    
    db_manager.delete(report_id)
    return {"success": True, "deleted_id": report_id}

@router.post("/reports/{report_id}/generate-pdf")
async def generate_pdf(report_id: str):
    """Generar PDF del reporte"""
    report_data = db_manager.get_by_id(report_id)
    
    if not report_data:
        raise HTTPException(404, "Reporte no encontrado")
    
    try:
        # Convertir dict a modelo
        report = TechnicalReport(**report_data)
        
        # Generar PDF
        pdf_bytes = service.generate_pdf(report)
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=informe_{report_id}.pdf"
            }
        )
    
    except Exception as e:
        raise HTTPException(500, f"Error generando PDF: {str(e)}")

@router.get("/autocomplete/cs")
async def autocomplete_cs():
    """Autocompletado: Centros de Servicio"""
    options = db_manager.get_unique_values('cs')
    return {"options": options}

@router.get("/autocomplete/contratista")
async def autocomplete_contratista(cs: Optional[str] = Query(None)):
    """Autocompletado: Contratistas"""
    if cs:
        # Filtrar por CS
        reports = db_manager.get_all({'cs': cs})
        contratistas = list(set(r['header']['contratista'] for r in reports))
    else:
        contratistas = db_manager.get_unique_values('contratista')
    
    return {"options": sorted(contratistas)}

@router.get("/autocomplete/tipo")
async def autocomplete_tipo():
    """Autocompletado: Tipos de reservorio"""
    return {"options": ["ELEVADO", "ENTERRADO", "SEMIENTERRADO"]}
