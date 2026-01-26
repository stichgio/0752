"""
Gestor de base de datos independiente para informes técnicos
Usa almacenamiento JSON propio, no interfiere con otras funcionalidades
"""
import os
import json
import pandas as pd
from typing import Dict, List, Optional
from datetime import datetime
from .models import (
    TechnicalReport, ReportListItem, CheckState,
    ReportMetadata, ReportHeader, InspeccionDescripcion,
    ValvulasCanastillas
)

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
    
    def import_from_csv(self, csv_path: str) -> tuple[List[TechnicalReport], List[str]]:
        """Importar informes desde CSV"""
        imported_reports = []
        errors = []
        
        try:
            df = pd.read_csv(csv_path)
            print(f"[TechReports DB] CSV has {len(df)} rows")
            
            required_columns = [
                'INFORME_ID', 'DIA', 'MES', 'AÑO', 'C_S', 'CONTRATISTA',
                'CODIGO_INFRAESTRUCTURA', 'UBICACION', 'SUMINISTRO', 'TIPO', 'VOLUMEN'
            ]
            
            missing_cols = [col for col in required_columns if col not in df.columns]
            if missing_cols:
                errors.append(f"Columnas faltantes: {', '.join(missing_cols)}")
                return [], errors
            
            for idx, row in df.iterrows():
                try:
                    report = self._csv_row_to_report(row)
                    self.reports[report.id] = report.dict()
                    imported_reports.append(report)
                except Exception as e:
                    errors.append(f"Fila {idx + 2}: {str(e)}")
            
            self.save_database()
            print(f"[TechReports DB] Imported {len(imported_reports)} reports")
            
        except Exception as e:
            errors.append(f"Error general: {str(e)}")
        
        return imported_reports, errors
    
    def _csv_row_to_report(self, row: pd.Series) -> TechnicalReport:
        """Convertir fila CSV a TechnicalReport"""
        report_id = f"RPT-{int(row['INFORME_ID']):04d}"
        
        return TechnicalReport(
            id=report_id,
            metadata=ReportMetadata(
                informe_id=int(row['INFORME_ID']),
                dia=int(row['DIA']),
                mes=str(row['MES']),
                anio=int(row['AÑO']),
                pagina="1 de 2"
            ),
            header=ReportHeader(
                cs=str(row['C_S']),
                contratista=str(row['CONTRATISTA']),
                codigo_infraestructura=str(row['CODIGO_INFRAESTRUCTURA']),
                ubicacion=str(row['UBICACION']),
                suministro=str(row['SUMINISTRO']),
                tipo=str(row['TIPO']),
                volumen=int(row['VOLUMEN'])
            ),
            inspeccion=InspeccionDescripcion(
                caja_registro=self._parse_check(row.get('CAJA_REGISTRO')),
                marco_tapa=self._parse_check(row.get('MARCO_TAPA')),
                escalera_interior=self._parse_check(row.get('ESCALERA_INT')),
                escalera_exterior=self._parse_check(row.get('ESCALERA_EXT')),
                cuba_interior=self._parse_check(row.get('CUBA_INT')),
                cuba_exterior=self._parse_check(row.get('CUBA_EXT')),
                loza_fondo=self._parse_check(row.get('LOZA_FONDO')),
                loza_techo_interior=self._parse_check(row.get('LOZA_TECHO_INT')),
                loza_techo_exterior=self._parse_check(row.get('LOZA_TECHO_EXT')),
                ducto_ventilacion=self._parse_check(row.get('DUCTO_VENTILACION')),
                cerco_perimetrico=self._parse_check(row.get('CERCO_PERIMETRICO')),
                descarga=self._parse_check(row.get('DESCARGA'))
            ),
            valvulas=ValvulasCanastillas(
                diametros={
                    "2": int(row.get('VALVULAS_2', 0)),
                    "3": int(row.get('VALVULAS_3', 0)),
                    "4": int(row.get('VALVULAS_4', 0)),
                    "6": int(row.get('VALVULAS_6', 0)),
                    "8": int(row.get('VALVULAS_8', 0)),
                    "10": int(row.get('VALVULAS_10', 0)),
                    "12": int(row.get('VALVULAS_12', 0)),
                },
                operativas=int(row.get('VALVULAS_OPER', 0)),
                no_operativas=int(row.get('VALVULAS_NO_OPER', 0))
            ),
            canastillas=ValvulasCanastillas(
                diametros={
                    "2": int(row.get('CANASTILLA_2', 0)),
                    "3": int(row.get('CANASTILLA_3', 0)),
                    "4": int(row.get('CANASTILLA_4', 0)),
                    "6": int(row.get('CANASTILLA_6', 0)),
                    "8": int(row.get('CANASTILLA_8', 0)),
                    "10": int(row.get('CANASTILLA_10', 0)),
                    "12": int(row.get('CANASTILLA_12', 0)),
                },
                operativas=int(row.get('CANASTILLA_OPER', 0)),
                no_operativas=int(row.get('CANASTILLA_NO_OPER', 0))
            ),
            observaciones=str(row.get('OBSERVACIONES', '')),
            sugerencias=str(row.get('SUGERENCIAS', '')),
            status="draft",
            last_modified=datetime.now()
        )
    
    @staticmethod
    def _parse_check(value) -> CheckState:
        """Convertir valor CSV a CheckState"""
        if pd.isna(value) or value == '':
            return "unchecked"
        elif str(value).upper() == 'X':
            return "critico"
        else:
            return "normal"
    
    def get_all(self, filters: dict = None) -> List[dict]:
        """Obtener todos los reportes con filtros opcionales"""
        reports = list(self.reports.values())
        
        if filters:
            if 'cs' in filters:
                reports = [r for r in reports if r['header']['cs'] == filters['cs']]
            if 'contratista' in filters:
                reports = [r for r in reports if r['header']['contratista'] == filters['contratista']]
            if 'status' in filters:
                reports = [r for r in reports if r['status'] == filters['status']]
        
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
            'cs': lambda r: r['header']['cs'],
            'contratista': lambda r: r['header']['contratista'],
            'tipo': lambda r: r['header']['tipo']
        }
        
        if field in field_map:
            for report in self.reports.values():
                try:
                    values.add(field_map[field](report))
                except:
                    pass
        
        return sorted(list(values))

# Instancia global
db_manager = DatabaseManager()
