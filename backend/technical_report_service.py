# backend/technical_report_service.py
# Mini-backend independiente para Generador de Informes Técnicos SEDAPAL

from fastapi import APIRouter, UploadFile, HTTPException, File
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
import pandas as pd
import json
from datetime import datetime
import os
import tempfile
from uuid import uuid4

# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter(prefix="/api/technical-reports", tags=["technical-reports"])

# ============================================================================
# MODELS
# ============================================================================

CheckState = Literal["normal", "critico", "unchecked"]

class ReportHeader(BaseModel):
    cs: str = ""
    contratista: str = ""
    codigo_infraestructura: str = ""
    ubicacion: str = ""
    suministro: str = ""
    tipo: Literal["ELEVADO", "ENTERRADO", "SEMIENTERRADO", ""] = ""
    volumen: int = 0

class ValvulasCanastillas(BaseModel):
    diametros: Dict[str, int] = Field(default_factory=lambda: {
        "2": 0, "3": 0, "4": 0, "6": 0, "8": 0, "10": 0, "12": 0
    })
    operativas: int = 0
    no_operativas: int = 0

class InspeccionDescripcion(BaseModel):
    caja_registro: CheckState = "unchecked"
    marco_tapa: CheckState = "unchecked"
    escalera_int: CheckState = "unchecked"
    escalera_ext: CheckState = "unchecked"
    cuba_int: CheckState = "unchecked"
    cuba_ext: CheckState = "unchecked"
    loza_fondo: CheckState = "unchecked"
    loza_techo_int: CheckState = "unchecked"
    loza_techo_ext: CheckState = "unchecked"
    ducto_ventilacion: CheckState = "unchecked"
    cerco_perimetrico: CheckState = "unchecked"
    descarga: CheckState = "unchecked"

class ReportMetadata(BaseModel):
    informe_id: int = 0
    dia: int = 1
    mes: str = ""
    año: int = 2025
    pagina: str = "1 de 2"

class TechnicalReport(BaseModel):
    id: str
    metadata: ReportMetadata
    header: ReportHeader
    inspeccion: InspeccionDescripcion
    valvulas: ValvulasCanastillas
    canastillas: ValvulasCanastillas
    observaciones: str = ""
    sugerencias: str = ""
    status: Literal["draft", "completed", "pending"] = "draft"
    last_modified: Optional[datetime] = None

class TechnicalReportCreate(BaseModel):
    """Para crear informes sin ID (se genera automáticamente)"""
    metadata: Optional[ReportMetadata] = None
    header: Optional[ReportHeader] = None
    inspeccion: Optional[InspeccionDescripcion] = None
    valvulas: Optional[ValvulasCanastillas] = None
    canastillas: Optional[ValvulasCanastillas] = None
    observaciones: str = ""
    sugerencias: str = ""

class TechnicalReportUpdate(BaseModel):
    """Para actualizaciones parciales"""
    metadata: Optional[ReportMetadata] = None
    header: Optional[ReportHeader] = None
    inspeccion: Optional[InspeccionDescripcion] = None
    valvulas: Optional[ValvulasCanastillas] = None
    canastillas: Optional[ValvulasCanastillas] = None
    observaciones: Optional[str] = None
    sugerencias: Optional[str] = None
    status: Optional[Literal["draft", "completed", "pending"]] = None

# ============================================================================
# DATABASE MANAGER
# ============================================================================

class DatabaseManager:
    """Gestiona la persistencia de informes técnicos en JSON"""
    
    def __init__(self, storage_dir: str = None):
        if storage_dir is None:
            # Usar directorio relativo al archivo
            base_dir = os.path.dirname(os.path.abspath(__file__))
            storage_dir = os.path.join(base_dir, "data", "technical_reports")
        
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)
        self.db_file = os.path.join(storage_dir, "reports.json")
        self.reports: Dict[str, dict] = {}
        self.load_database()
    
    def load_database(self):
        """Cargar base de datos desde JSON"""
        if os.path.exists(self.db_file):
            try:
                with open(self.db_file, 'r', encoding='utf-8') as f:
                    self.reports = json.load(f)
                print(f"[TechnicalReports] Cargados {len(self.reports)} informes")
            except Exception as e:
                print(f"[TechnicalReports] Error cargando DB: {e}")
                self.reports = {}
        else:
            self.reports = {}
    
    def save_database(self):
        """Guardar base de datos a JSON"""
        try:
            with open(self.db_file, 'w', encoding='utf-8') as f:
                json.dump(self.reports, f, ensure_ascii=False, indent=2, default=str)
        except Exception as e:
            print(f"[TechnicalReports] Error guardando DB: {e}")
            raise
    
    def import_from_csv(self, csv_path: str) -> List[TechnicalReport]:
        """Importar informes desde archivo CSV"""
        df = pd.read_csv(csv_path, encoding='utf-8')
        
        # Normalizar nombres de columnas
        df.columns = df.columns.str.strip().str.upper()
        
        imported_reports = []
        for _, row in df.iterrows():
            try:
                report = self._csv_row_to_report(row)
                self.reports[report.id] = report.model_dump()
                imported_reports.append(report)
            except Exception as e:
                print(f"[TechnicalReports] Error importando fila: {e}")
                continue
        
        self.save_database()
        return imported_reports
    
    def import_from_excel(self, excel_path: str, sheet_name: str = None) -> List[TechnicalReport]:
        """Importar informes desde archivo Excel"""
        df = pd.read_excel(excel_path, sheet_name=sheet_name or 0)
        
        # Normalizar nombres de columnas
        df.columns = df.columns.str.strip().str.upper()
        
        imported_reports = []
        for _, row in df.iterrows():
            try:
                report = self._csv_row_to_report(row)
                self.reports[report.id] = report.model_dump()
                imported_reports.append(report)
            except Exception as e:
                print(f"[TechnicalReports] Error importando fila: {e}")
                continue
        
        self.save_database()
        return imported_reports
    
    def _csv_row_to_report(self, row: pd.Series) -> TechnicalReport:
        """Convertir fila CSV/Excel a objeto TechnicalReport"""
        
        # Obtener ID del informe
        informe_id = int(row.get('INFORME_ID', row.get('ID', 0)))
        report_id = f"RPT-{informe_id:04d}"
        
        # Si ya existe, generar nuevo ID
        if report_id in self.reports:
            report_id = f"RPT-{informe_id:04d}-{uuid4().hex[:4]}"
        
        return TechnicalReport(
            id=report_id,
            metadata=ReportMetadata(
                informe_id=informe_id,
                dia=int(row.get('DIA', 1)),
                mes=str(row.get('MES', '')),
                año=int(row.get('AÑO', row.get('ANO', 2025))),
                pagina="1 de 2"
            ),
            header=ReportHeader(
                cs=str(row.get('C_S', row.get('CS', row.get('CENTRO_SERVICIO', '')))),
                contratista=str(row.get('CONTRATISTA', '')),
                codigo_infraestructura=str(row.get('CODIGO_INFRAESTRUCTURA', row.get('CODIGO', ''))),
                ubicacion=str(row.get('UBICACION', '')),
                suministro=str(row.get('SUMINISTRO', '')),
                tipo=self._parse_tipo(row.get('TIPO', '')),
                volumen=int(row.get('VOLUMEN', 0)) if pd.notna(row.get('VOLUMEN')) else 0
            ),
            inspeccion=InspeccionDescripcion(
                caja_registro=self._parse_check_state(row.get('CAJA_REGISTRO')),
                marco_tapa=self._parse_check_state(row.get('MARCO_TAPA')),
                escalera_int=self._parse_check_state(row.get('ESCALERA_INT')),
                escalera_ext=self._parse_check_state(row.get('ESCALERA_EXT')),
                cuba_int=self._parse_check_state(row.get('CUBA_INT')),
                cuba_ext=self._parse_check_state(row.get('CUBA_EXT')),
                loza_fondo=self._parse_check_state(row.get('LOZA_FONDO')),
                loza_techo_int=self._parse_check_state(row.get('LOZA_TECHO_INT')),
                loza_techo_ext=self._parse_check_state(row.get('LOZA_TECHO_EXT')),
                ducto_ventilacion=self._parse_check_state(row.get('DUCTO_VENTILACION')),
                cerco_perimetrico=self._parse_check_state(row.get('CERCO_PERIMETRICO')),
                descarga=self._parse_check_state(row.get('DESCARGA'))
            ),
            valvulas=ValvulasCanastillas(
                diametros={
                    "2": self._safe_int(row.get('VALVULAS_2')),
                    "3": self._safe_int(row.get('VALVULAS_3')),
                    "4": self._safe_int(row.get('VALVULAS_4')),
                    "6": self._safe_int(row.get('VALVULAS_6')),
                    "8": self._safe_int(row.get('VALVULAS_8')),
                    "10": self._safe_int(row.get('VALVULAS_10')),
                    "12": self._safe_int(row.get('VALVULAS_12')),
                },
                operativas=self._safe_int(row.get('VALVULAS_OPER')),
                no_operativas=self._safe_int(row.get('VALVULAS_NO_OPER'))
            ),
            canastillas=ValvulasCanastillas(
                diametros={
                    "2": self._safe_int(row.get('CANASTILLA_2')),
                    "3": self._safe_int(row.get('CANASTILLA_3')),
                    "4": self._safe_int(row.get('CANASTILLA_4')),
                    "6": self._safe_int(row.get('CANASTILLA_6')),
                    "8": self._safe_int(row.get('CANASTILLA_8')),
                    "10": self._safe_int(row.get('CANASTILLA_10')),
                    "12": self._safe_int(row.get('CANASTILLA_12')),
                },
                operativas=self._safe_int(row.get('CANASTILLA_OPER')),
                no_operativas=self._safe_int(row.get('CANASTILLA_NO_OPER'))
            ),
            observaciones=str(row.get('OBSERVACIONES', '')) if pd.notna(row.get('OBSERVACIONES')) else '',
            sugerencias=str(row.get('SUGERENCIAS', '')) if pd.notna(row.get('SUGERENCIAS')) else '',
            status="draft",
            last_modified=datetime.now()
        )
    
    @staticmethod
    def _parse_check_state(value) -> CheckState:
        """Convertir valor CSV a CheckState"""
        if pd.isna(value) or value == '' or value is None:
            return "unchecked"
        
        val_str = str(value).strip().upper()
        if val_str == 'X' or val_str == '1' or val_str == 'SI' or val_str == 'YES':
            return "normal"
        elif val_str == 'XX' or val_str == 'CRITICO' or val_str == 'C':
            return "critico"
        else:
            return "unchecked"
    
    @staticmethod
    def _parse_tipo(value) -> str:
        """Parsear tipo de infraestructura"""
        if pd.isna(value) or not value:
            return ""
        
        val_str = str(value).strip().upper()
        if "ELEVADO" in val_str:
            return "ELEVADO"
        elif "ENTERRADO" in val_str and "SEMI" not in val_str:
            return "ENTERRADO"
        elif "SEMI" in val_str:
            return "SEMIENTERRADO"
        return val_str
    
    @staticmethod
    def _safe_int(value) -> int:
        """Convertir a int de forma segura"""
        if pd.isna(value) or value is None or value == '':
            return 0
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return 0
    
    def get_all_reports(self) -> List[dict]:
        """Obtener todos los informes"""
        return list(self.reports.values())
    
    def get_report(self, report_id: str) -> Optional[dict]:
        """Obtener un informe por ID"""
        return self.reports.get(report_id)
    
    def create_report(self, report: TechnicalReport) -> dict:
        """Crear un nuevo informe"""
        report.last_modified = datetime.now()
        self.reports[report.id] = report.model_dump()
        self.save_database()
        return self.reports[report.id]
    
    def update_report(self, report_id: str, update_data: TechnicalReportUpdate) -> Optional[dict]:
        """Actualizar un informe existente"""
        if report_id not in self.reports:
            return None
        
        current = self.reports[report_id]
        update_dict = update_data.model_dump(exclude_unset=True)
        
        # Merge recursivo
        for key, value in update_dict.items():
            if value is not None:
                if isinstance(value, dict) and key in current and isinstance(current[key], dict):
                    current[key].update(value)
                else:
                    current[key] = value
        
        current['last_modified'] = datetime.now().isoformat()
        self.reports[report_id] = current
        self.save_database()
        
        return current
    
    def delete_report(self, report_id: str) -> bool:
        """Eliminar un informe"""
        if report_id not in self.reports:
            return False
        
        del self.reports[report_id]
        self.save_database()
        return True
    
    def get_unique_values(self, field: str) -> List[str]:
        """Obtener valores únicos de un campo para autocompletado"""
        values = set()
        
        for report in self.reports.values():
            if field == 'cs':
                val = report.get('header', {}).get('cs', '')
            elif field == 'contratista':
                val = report.get('header', {}).get('contratista', '')
            elif field == 'tipo':
                val = report.get('header', {}).get('tipo', '')
            else:
                val = ''
            
            if val:
                values.add(val)
        
        return sorted(list(values))
    
    def export_to_csv(self, output_path: str) -> str:
        """Exportar todos los informes a CSV"""
        rows = []
        
        for report in self.reports.values():
            row = {
                'INFORME_ID': report['metadata']['informe_id'],
                'DIA': report['metadata']['dia'],
                'MES': report['metadata']['mes'],
                'AÑO': report['metadata']['año'],
                'C_S': report['header']['cs'],
                'CONTRATISTA': report['header']['contratista'],
                'CODIGO_INFRAESTRUCTURA': report['header']['codigo_infraestructura'],
                'UBICACION': report['header']['ubicacion'],
                'SUMINISTRO': report['header']['suministro'],
                'TIPO': report['header']['tipo'],
                'VOLUMEN': report['header']['volumen'],
                'CAJA_REGISTRO': 'X' if report['inspeccion']['caja_registro'] == 'normal' else ('XX' if report['inspeccion']['caja_registro'] == 'critico' else ''),
                'MARCO_TAPA': 'X' if report['inspeccion']['marco_tapa'] == 'normal' else ('XX' if report['inspeccion']['marco_tapa'] == 'critico' else ''),
                # ... más campos
                'OBSERVACIONES': report['observaciones'],
                'SUGERENCIAS': report['sugerencias'],
                'STATUS': report['status']
            }
            
            # Válvulas
            for diam in ['2', '3', '4', '6', '8', '10', '12']:
                row[f'VALVULAS_{diam}'] = report['valvulas']['diametros'].get(diam, 0)
            row['VALVULAS_OPER'] = report['valvulas']['operativas']
            row['VALVULAS_NO_OPER'] = report['valvulas']['no_operativas']
            
            # Canastillas
            for diam in ['2', '3', '4', '6', '8', '10', '12']:
                row[f'CANASTILLA_{diam}'] = report['canastillas']['diametros'].get(diam, 0)
            row['CANASTILLA_OPER'] = report['canastillas']['operativas']
            row['CANASTILLA_NO_OPER'] = report['canastillas']['no_operativas']
            
            rows.append(row)
        
        df = pd.DataFrame(rows)
        df.to_csv(output_path, index=False, encoding='utf-8-sig')
        return output_path


# Instancia global del DatabaseManager
db_manager = DatabaseManager()


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/import")
async def import_file(file: UploadFile = File(...)):
    """
    Importar informes desde archivo CSV o Excel.
    
    Formatos soportados: .csv, .xlsx, .xls
    """
    if not file.filename:
        raise HTTPException(400, "No se proporcionó archivo")
    
    filename_lower = file.filename.lower()
    
    if not (filename_lower.endswith('.csv') or 
            filename_lower.endswith('.xlsx') or 
            filename_lower.endswith('.xls')):
        raise HTTPException(400, "Formato no soportado. Use CSV o Excel (.xlsx, .xls)")
    
    # Guardar archivo temporalmente
    suffix = os.path.splitext(file.filename)[1]
    temp_path = os.path.join(tempfile.gettempdir(), f"import_{uuid4().hex}{suffix}")
    
    try:
        content = await file.read()
        with open(temp_path, 'wb') as f:
            f.write(content)
        
        # Importar según tipo de archivo
        if filename_lower.endswith('.csv'):
            reports = db_manager.import_from_csv(temp_path)
        else:
            reports = db_manager.import_from_excel(temp_path)
        
        return {
            "success": True,
            "imported_count": len(reports),
            "reports": [r.model_dump() for r in reports]
        }
    
    except Exception as e:
        raise HTTPException(500, f"Error importando archivo: {str(e)}")
    
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.get("/reports")
async def get_all_reports(
    cs: Optional[str] = None,
    contratista: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    """
    Obtener todos los informes con filtros opcionales.
    
    Parámetros:
    - cs: Filtrar por Centro de Servicio
    - contratista: Filtrar por Contratista
    - status: Filtrar por estado (draft, completed, pending)
    - search: Búsqueda de texto libre en código/ubicación
    """
    reports = db_manager.get_all_reports()
    
    # Aplicar filtros
    if cs:
        reports = [r for r in reports if r.get('header', {}).get('cs', '').upper() == cs.upper()]
    
    if contratista:
        reports = [r for r in reports if r.get('header', {}).get('contratista', '').upper() == contratista.upper()]
    
    if status:
        reports = [r for r in reports if r.get('status', 'draft') == status]
    
    if search:
        search_lower = search.lower()
        reports = [r for r in reports if 
                   search_lower in r.get('header', {}).get('codigo_infraestructura', '').lower() or
                   search_lower in r.get('header', {}).get('ubicacion', '').lower() or
                   search_lower in r.get('id', '').lower()]
    
    # Ordenar por last_modified (más recientes primero)
    reports.sort(key=lambda x: x.get('last_modified', ''), reverse=True)
    
    return {
        "reports": reports,
        "total": len(reports)
    }


@router.get("/reports/{report_id}")
async def get_report(report_id: str):
    """Obtener un informe específico por ID"""
    report = db_manager.get_report(report_id)
    
    if not report:
        raise HTTPException(404, f"Informe '{report_id}' no encontrado")
    
    return report


@router.post("/reports")
async def create_report(report_data: TechnicalReportCreate):
    """Crear un nuevo informe"""
    
    # Generar ID único
    new_id = f"RPT-{uuid4().hex[:8].upper()}"
    
    # Crear el informe completo
    report = TechnicalReport(
        id=new_id,
        metadata=report_data.metadata or ReportMetadata(),
        header=report_data.header or ReportHeader(),
        inspeccion=report_data.inspeccion or InspeccionDescripcion(),
        valvulas=report_data.valvulas or ValvulasCanastillas(),
        canastillas=report_data.canastillas or ValvulasCanastillas(),
        observaciones=report_data.observaciones,
        sugerencias=report_data.sugerencias,
        status="draft",
        last_modified=datetime.now()
    )
    
    result = db_manager.create_report(report)
    
    return {
        "success": True,
        "report": result
    }


@router.put("/reports/{report_id}")
async def update_report(report_id: str, update_data: TechnicalReportUpdate):
    """Actualizar un informe existente"""
    
    result = db_manager.update_report(report_id, update_data)
    
    if not result:
        raise HTTPException(404, f"Informe '{report_id}' no encontrado")
    
    return {
        "success": True,
        "report": result
    }


@router.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    """Eliminar un informe"""
    
    success = db_manager.delete_report(report_id)
    
    if not success:
        raise HTTPException(404, f"Informe '{report_id}' no encontrado")
    
    return {
        "success": True,
        "deleted_id": report_id
    }


@router.get("/autocomplete/{field}")
async def get_autocomplete(field: str, cs: Optional[str] = None):
    """
    Obtener valores únicos para autocompletado.
    
    Campos soportados: cs, contratista, tipo
    """
    if field not in ['cs', 'contratista', 'tipo']:
        raise HTTPException(400, f"Campo '{field}' no soportado para autocompletado")
    
    # Si se filtra por CS, obtener contratistas de ese CS
    if field == 'contratista' and cs:
        reports = [r for r in db_manager.get_all_reports() 
                   if r.get('header', {}).get('cs', '').upper() == cs.upper()]
        values = sorted(set(r.get('header', {}).get('contratista', '') for r in reports if r.get('header', {}).get('contratista')))
    else:
        values = db_manager.get_unique_values(field)
    
    return {"options": values}


@router.get("/export/csv")
async def export_to_csv():
    """Exportar todos los informes a CSV"""
    
    temp_path = os.path.join(tempfile.gettempdir(), f"export_{uuid4().hex}.csv")
    
    try:
        db_manager.export_to_csv(temp_path)
        
        with open(temp_path, 'rb') as f:
            content = f.read()
        
        return Response(
            content=content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=informes_tecnicos_{datetime.now().strftime('%Y%m%d')}.csv"
            }
        )
    
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.post("/reports/{report_id}/generate-pdf")
async def generate_pdf(report_id: str):
    """Generar PDF del informe técnico"""
    
    report = db_manager.get_report(report_id)
    
    if not report:
        raise HTTPException(404, f"Informe '{report_id}' no encontrado")
    
    try:
        # Usar el ReportService existente con template específico
        from report_service import ReportService
        from weasyprint import HTML
        from jinja2 import Environment, FileSystemLoader
        
        # Cargar template
        templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
        env = Environment(loader=FileSystemLoader(templates_dir))
        template = env.get_template("informe_tecnico.html")
        
        # Renderizar HTML
        html_output = template.render(report=report)
        
        # Generar PDF
        pdf_bytes = HTML(string=html_output, base_url=templates_dir).write_pdf()
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=informe_{report_id}.pdf"
            }
        )
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Error generando PDF: {str(e)}")


@router.get("/stats")
async def get_stats():
    """Obtener estadísticas de los informes"""
    
    reports = db_manager.get_all_reports()
    
    # Contar por estado
    status_counts = {"draft": 0, "completed": 0, "pending": 0}
    for r in reports:
        status = r.get('status', 'draft')
        status_counts[status] = status_counts.get(status, 0) + 1
    
    # Contar por CS
    cs_counts = {}
    for r in reports:
        cs = r.get('header', {}).get('cs', 'Sin CS')
        cs_counts[cs] = cs_counts.get(cs, 0) + 1
    
    return {
        "total": len(reports),
        "by_status": status_counts,
        "by_cs": cs_counts
    }
