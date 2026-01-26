"""
Gestor de Base de Datos en JSON
"""
import json
import os
from typing import List, Dict, Optional
from datetime import datetime
from .models import TechnicalReport

class TechnicalReportsDB:
    def __init__(self, storage_dir="./data"):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)
        self.db_file = os.path.join(storage_dir, "technical_reports.json")
        self.reports: Dict[str, dict] = {}
        self.load()
    
    def load(self):
        """Cargar base de datos desde JSON"""
        if os.path.exists(self.db_file):
            try:
                with open(self.db_file, 'r', encoding='utf-8') as f:
                    self.reports = json.load(f)
                print(f"[TechReports] Loaded {len(self.reports)} reports")
            except Exception as e:
                print(f"[TechReports] Error loading: {e}")
                self.reports = {}
        else:
            self.reports = {}
            self.save()
    
    def save(self):
        """Guardar base de datos a JSON"""
        try:
            with open(self.db_file, 'w', encoding='utf-8') as f:
                json.dump(self.reports, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[TechReports] Error saving: {e}")
    
    def get_all_reports(self) -> List[TechnicalReport]:
        """Obtener todos los informes"""
        return [TechnicalReport(**data) for data in self.reports.values()]
    
    def get_report(self, report_id: str) -> Optional[TechnicalReport]:
        """Obtener un informe específico"""
        if report_id in self.reports:
            return TechnicalReport(**self.reports[report_id])
        return None
    
    def create_report(self, report: TechnicalReport) -> TechnicalReport:
        """Crear nuevo informe"""
        self.reports[report.id] = report.dict()
        self.save()
        return report
    
    def update_report(self, report_id: str, report: TechnicalReport) -> TechnicalReport:
        """Actualizar informe existente"""
        self.reports[report_id] = report.dict()
        self.save()
        return report
    
    def delete_report(self, report_id: str) -> bool:
        """Eliminar informe"""
        if report_id in self.reports:
            del self.reports[report_id]
            self.save()
            return True
        return False
    
    def import_from_csv(self, csv_data: List[Dict]) -> List[TechnicalReport]:
        """Importar informes desde datos CSV"""
        imported = []
        
        for row in csv_data:
            try:
                report_id = f"RPT-{str(row.get('informe_id', 0)).zfill(4)}"
                
                report = TechnicalReport(
                    id=report_id,
                    metadata={
                        "informe_id": int(row.get('informe_id', 0)),
                        "dia": int(row.get('dia', 1)),
                        "mes": str(row.get('mes', 'ENERO')).upper(),
                        "anio": int(row.get('anio', 2025)),
                        "pagina": "1 de 2"
                    },
                    header={
                        "cs": str(row.get('cs', '')),
                        "contratista": str(row.get('contratista', '')),
                        "codigo_infraestructura": str(row.get('codigo_infraestructura', '')),
                        "ubicacion": str(row.get('ubicacion', '')),
                        "suministro": str(row.get('suministro', '')),
                        "tipo": str(row.get('tipo', 'ELEVADO')),
                        "volumen": int(row.get('volumen', 0))
                    },
                    inspeccion={
                        "caja_registro": self._parse_check(row.get('caja_registro')),
                        "marco_tapa": self._parse_check(row.get('marco_tapa')),
                        "escalera_interior": self._parse_check(row.get('escalera_interior')),
                        "escalera_exterior": self._parse_check(row.get('escalera_exterior')),
                        "cuba_interior": self._parse_check(row.get('cuba_interior')),
                        "cuba_exterior": self._parse_check(row.get('cuba_exterior')),
                        "loza_fondo": self._parse_check(row.get('loza_fondo')),
                        "loza_techo_interior": self._parse_check(row.get('loza_techo_interior')),
                        "loza_techo_exterior": self._parse_check(row.get('loza_techo_exterior')),
                        "ducto_ventilacion": self._parse_check(row.get('ducto_ventilacion')),
                        "cerco_perimetrico": self._parse_check(row.get('cerco_perimetrico')),
                        "descarga": self._parse_check(row.get('descarga'))
                    },
                    valvulas={
                        "diametros": {
                            '2': int(row.get('valvulas_2', 0)),
                            '3': int(row.get('valvulas_3', 0)),
                            '4': int(row.get('valvulas_4', 0)),
                            '6': int(row.get('valvulas_6', 0)),
                            '8': int(row.get('valvulas_8', 0)),
                            '10': int(row.get('valvulas_10', 0)),
                            '12': int(row.get('valvulas_12', 0))
                        },
                        "operativas": int(row.get('valvulas_operativas', 0)),
                        "no_operativas": int(row.get('valvulas_no_operativas', 0))
                    },
                    canastillas={
                        "diametros": {
                            '2': int(row.get('canastillas_2', 0)),
                            '3': int(row.get('canastillas_3', 0)),
                            '4': int(row.get('canastillas_4', 0)),
                            '6': int(row.get('canastillas_6', 0)),
                            '8': int(row.get('canastillas_8', 0)),
                            '10': int(row.get('canastillas_10', 0)),
                            '12': int(row.get('canastillas_12', 0))
                        },
                        "operativas": int(row.get('canastillas_operativas', 0)),
                        "no_operativas": int(row.get('canastillas_no_operativas', 0))
                    },
                    observaciones=str(row.get('observaciones', '')),
                    sugerencias=str(row.get('sugerencias', '')),
                    status='draft',
                    last_modified=datetime.now().isoformat()
                )
                
                self.reports[report.id] = report.dict()
                imported.append(report)
                
            except Exception as e:
                print(f"Error importing row {row.get('informe_id', '?')}: {e}")
                continue
        
        self.save()
        print(f"Imported {len(imported)} reports")
        return imported
    
    @staticmethod
    def _parse_check(value) -> str:
        """Convertir valor CSV a estado de checkbox"""
        if not value or str(value).strip() == '':
            return 'unchecked'
        val_upper = str(value).upper().strip()
        if val_upper == 'X' or val_upper == 'NORMAL':
            return 'normal'
        elif val_upper == 'CRITICO':
            return 'critico'
        return 'unchecked'

# Instancia global
db = TechnicalReportsDB()
