"""
Gestor de base de datos independiente para informes técnicos
Usa almacenamiento JSON propio, no interfiere con otras funcionalidades
"""
import os
import json
import tempfile
import pandas as pd
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from .models import (
    TechnicalReport, ReportListItem,
    ReportMetadata, ReportHeader, InspeccionDescripcion,
    ValvulasCanastillas
)

def safe_int(value, default=0) -> int:
    """Convierte valor a int de forma segura"""
    if pd.isna(value) or value == '' or value is None:
        return default
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return default

def safe_str(value, default='') -> str:
    """Convierte valor a str de forma segura"""
    if pd.isna(value) or value is None:
        return default
    return str(value).strip()

class DatabaseManager:
    def __init__(self, storage_dir: str = None):
        if storage_dir is None:
            storage_dir = os.path.join(
                os.path.dirname(__file__), 
                "data"
            )
        
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
                print(f"[TechReports DB] Loaded {len(self.reports)} reports")
            except Exception as e:
                print(f"[TechReports DB] Error loading: {e}")
                self.reports = {}
        else:
            self.reports = {}
            self.save_database()
    
    def save_database(self):
        """Guardar base de datos a JSON"""
        try:
            with open(self.db_file, 'w', encoding='utf-8') as f:
                json.dump(self.reports, f, ensure_ascii=False, indent=2, default=str)
            print(f"[TechReports DB] Saved {len(self.reports)} reports")
        except Exception as e:
            print(f"[TechReports DB] Error saving: {e}")
    
    def import_from_csv(self, csv_path: str) -> Tuple[List[TechnicalReport], List[str]]:
        """Importar informes desde CSV"""
        imported_reports = []
        errors = []
        
        try:
            # Intentar diferentes encodings
            try:
                df = pd.read_csv(csv_path, encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(csv_path, encoding='latin-1')
            
            print(f"[TechReports DB] CSV has {len(df)} rows, columns: {list(df.columns)}")
            
            # Columnas requeridas mínimas
            required_columns = ['INFORME_ID']
            
            # Normalizar nombres de columnas (quitar espacios, uppercase)
            df.columns = [col.strip().upper() for col in df.columns]
            
            missing_cols = [col for col in required_columns if col not in df.columns]
            if missing_cols:
                errors.append(f"Columnas faltantes: {', '.join(missing_cols)}")
                return [], errors
            
            for idx, row in df.iterrows():
                try:
                    report = self._csv_row_to_report(row, idx)
                    self.reports[report.id] = report.dict()
                    imported_reports.append(report)
                except Exception as e:
                    errors.append(f"Fila {idx + 2}: {str(e)}")
                    import traceback
                    traceback.print_exc()
            
            self.save_database()
            print(f"[TechReports DB] Imported {len(imported_reports)} reports")
            
        except Exception as e:
            errors.append(f"Error general: {str(e)}")
            import traceback
            traceback.print_exc()
        
        return imported_reports, errors
    
    def _csv_row_to_report(self, row: pd.Series, idx: int) -> TechnicalReport:
        """Convertir fila CSV a TechnicalReport"""
        informe_id = safe_int(row.get('INFORME_ID', idx + 1), idx + 1)
        report_id = f"RPT-{informe_id:04d}"
        
        return TechnicalReport(
            id=report_id,
            metadata=ReportMetadata(
                informe_id=informe_id,
                dia=safe_int(row.get('DIA', 1), 1),
                mes=safe_str(row.get('MES', '')),
                anio=safe_int(row.get('AÑO', row.get('ANO', 2024)), 2024),
                pagina="1 de 2"
            ),
            header=ReportHeader(
                cs=safe_str(row.get('C_S', row.get('CS', ''))),
                contratista=safe_str(row.get('CONTRATISTA', '')),
                codigo_infraestructura=safe_str(row.get('CODIGO_INFRAESTRUCTURA', row.get('CODIGO', ''))),
                ubicacion=safe_str(row.get('UBICACION', '')),
                suministro=safe_str(row.get('SUMINISTRO', '')),
                tipo=safe_str(row.get('TIPO', 'ELEVADO')),
                volumen=safe_int(row.get('VOLUMEN', 0))
            ),
            inspeccion=InspeccionDescripcion(
                caja_registro=self._parse_check(row.get('CAJA_REGISTRO')),
                marco_tapa=self._parse_check(row.get('MARCO_TAPA')),
                escalera_interior=self._parse_check(row.get('ESCALERA_INT', row.get('ESCALERA_INTERIOR'))),
                escalera_exterior=self._parse_check(row.get('ESCALERA_EXT', row.get('ESCALERA_EXTERIOR'))),
                cuba_interior=self._parse_check(row.get('CUBA_INT', row.get('CUBA_INTERIOR'))),
                cuba_exterior=self._parse_check(row.get('CUBA_EXT', row.get('CUBA_EXTERIOR'))),
                loza_fondo=self._parse_check(row.get('LOZA_FONDO')),
                loza_techo_interior=self._parse_check(row.get('LOZA_TECHO_INT', row.get('LOZA_TECHO_INTERIOR'))),
                loza_techo_exterior=self._parse_check(row.get('LOZA_TECHO_EXT', row.get('LOZA_TECHO_EXTERIOR'))),
                ducto_ventilacion=self._parse_check(row.get('DUCTO_VENTILACION')),
                cerco_perimetrico=self._parse_check(row.get('CERCO_PERIMETRICO')),
                descarga=self._parse_check(row.get('DESCARGA'))
            ),
            valvulas=ValvulasCanastillas(
                diametros={
                    "2": safe_int(row.get('VALVULAS_2')),
                    "3": safe_int(row.get('VALVULAS_3')),
                    "4": safe_int(row.get('VALVULAS_4')),
                    "6": safe_int(row.get('VALVULAS_6')),
                    "8": safe_int(row.get('VALVULAS_8')),
                    "10": safe_int(row.get('VALVULAS_10')),
                    "12": safe_int(row.get('VALVULAS_12')),
                },
                operativas=safe_int(row.get('VALVULAS_OPER')),
                no_operativas=safe_int(row.get('VALVULAS_NO_OPER'))
            ),
            canastillas=ValvulasCanastillas(
                diametros={
                    "2": safe_int(row.get('CANASTILLA_2')),
                    "3": safe_int(row.get('CANASTILLA_3')),
                    "4": safe_int(row.get('CANASTILLA_4')),
                    "6": safe_int(row.get('CANASTILLA_6')),
                    "8": safe_int(row.get('CANASTILLA_8')),
                    "10": safe_int(row.get('CANASTILLA_10')),
                    "12": safe_int(row.get('CANASTILLA_12')),
                },
                operativas=safe_int(row.get('CANASTILLA_OPER')),
                no_operativas=safe_int(row.get('CANASTILLA_NO_OPER'))
            ),
            observaciones=safe_str(row.get('OBSERVACIONES', '')),
            sugerencias=safe_str(row.get('SUGERENCIAS', '')),
            status="draft",
            last_modified=datetime.now()
        )
    
    @staticmethod
    def _parse_check(value) -> str:
        """Convertir valor CSV a CheckState"""
        if pd.isna(value) or value == '' or value is None:
            return "unchecked"
        val_str = str(value).strip().upper()
        if val_str == 'X' or val_str == 'CRITICO':
            return "critico"
        elif val_str == 'N' or val_str == 'NORMAL' or val_str == 'OK':
            return "normal"
        else:
            return "unchecked"
    
    def get_all(self, filters: dict = None) -> List[dict]:
        """Obtener todos los reportes con filtros opcionales"""
        reports = list(self.reports.values())
        
        if filters:
            if 'cs' in filters and filters['cs']:
                reports = [r for r in reports if r.get('header', {}).get('cs') == filters['cs']]
            if 'contratista' in filters and filters['contratista']:
                reports = [r for r in reports if r.get('header', {}).get('contratista') == filters['contratista']]
            if 'status' in filters and filters['status']:
                reports = [r for r in reports if r.get('status') == filters['status']]
        
        return reports
    
    def get_by_id(self, report_id: str) -> Optional[dict]:
        """Obtener reporte por ID"""
        return self.reports.get(report_id)
    
    def create(self, report: TechnicalReport) -> dict:
        """Crear nuevo reporte"""
        report.last_modified = datetime.now()
        self.reports[report.id] = report.dict()
        self.save_database()
        return report.dict()
    
    def update(self, report_id: str, report: TechnicalReport) -> dict:
        """Actualizar reporte existente"""
        if report_id not in self.reports:
            raise ValueError(f"Report {report_id} not found")
        
        report.last_modified = datetime.now()
        self.reports[report_id] = report.dict()
        self.save_database()
        return report.dict()
    
    def delete(self, report_id: str):
        """Eliminar reporte"""
        if report_id in self.reports:
            del self.reports[report_id]
            self.save_database()
    
    def get_unique_values(self, field: str) -> List[str]:
        """Obtener valores únicos de un campo (para autocompletado)"""
        values = set()
        
        field_map = {
            'cs': lambda r: r.get('header', {}).get('cs', ''),
            'contratista': lambda r: r.get('header', {}).get('contratista', ''),
            'tipo': lambda r: r.get('header', {}).get('tipo', '')
        }
        
        if field in field_map:
            for report in self.reports.values():
                try:
                    val = field_map[field](report)
                    if val:
                        values.add(val)
                except:
                    pass
        
        return sorted(list(values))

# Instancia global
db_manager = DatabaseManager()
