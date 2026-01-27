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
        
        def safe_int(value, default=0):
            """Convertir valor a int de manera segura, manejando NaN y vacíos"""
            if value is None or value == '' or (isinstance(value, float) and str(value) == 'nan'):
                return default
            try:
                return int(float(value))
            except (ValueError, TypeError):
                return default
        
        def safe_str(value, default=''):
            """Convertir valor a string de manera segura, manejando NaN"""
            if value is None or (isinstance(value, float) and str(value) == 'nan'):
                return default
            return str(value)
        
        for row in csv_data:
            try:
                report_id = f"RPT-{str(row.get('informe_id', 0)).zfill(4)}"
                
                report = TechnicalReport(
                    id=report_id,
                    metadata={
                        "informe_id": safe_int(row.get('informe_id', 0)),
                        "dia": safe_int(row.get('dia', 1), 1),
                        "mes": safe_str(row.get('mes', 'ENERO'), 'ENERO').upper(),
                        "anio": safe_int(row.get('anio', 2025), 2025),
                        "pagina": "1 de 2"
                    },
                    header={
                        "cs": safe_str(row.get('cs', '')),
                        "contratista": safe_str(row.get('contratista', '')),
                        "codigo_infraestructura": safe_str(row.get('codigo_infraestructura', '')),
                        "ubicacion": safe_str(row.get('ubicacion', '')),
                        "suministro": safe_str(row.get('suministro', '')),
                        "tipo": safe_str(row.get('tipo', 'ELEVADO'), 'ELEVADO'),
                        "volumen": safe_int(row.get('volumen', 0))
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
                        "descarga": self._parse_check(row.get('descarga')),
                        # Per-row observaciones/sugerencias for inspeccion
                        "observaciones_caja_registro": safe_str(row.get('obs_caja_registro', '')),
                        "sugerencias_caja_registro": safe_str(row.get('sug_caja_registro', '')),
                        "observaciones_marco_tapa": safe_str(row.get('obs_marco_tapa', '')),
                        "sugerencias_marco_tapa": safe_str(row.get('sug_marco_tapa', '')),
                        "observaciones_escalera_int": safe_str(row.get('obs_escalera_int', '')),
                        "sugerencias_escalera_int": safe_str(row.get('sug_escalera_int', '')),
                        "observaciones_escalera_ext": safe_str(row.get('obs_escalera_ext', '')),
                        "sugerencias_escalera_ext": safe_str(row.get('sug_escalera_ext', '')),
                        "observaciones_cuba_int": safe_str(row.get('obs_cuba_int', '')),
                        "sugerencias_cuba_int": safe_str(row.get('sug_cuba_int', '')),
                        "observaciones_cuba_ext": safe_str(row.get('obs_cuba_ext', '')),
                        "sugerencias_cuba_ext": safe_str(row.get('sug_cuba_ext', '')),
                        "observaciones_loza_fondo": safe_str(row.get('obs_loza_fondo', '')),
                        "sugerencias_loza_fondo": safe_str(row.get('sug_loza_fondo', '')),
                        "observaciones_loza_techo_int": safe_str(row.get('obs_loza_techo_int', '')),
                        "sugerencias_loza_techo_int": safe_str(row.get('sug_loza_techo_int', '')),
                        "observaciones_loza_techo_ext": safe_str(row.get('obs_loza_techo_ext', '')),
                        "sugerencias_loza_techo_ext": safe_str(row.get('sug_loza_techo_ext', '')),
                        "observaciones_ducto": safe_str(row.get('obs_ducto', '')),
                        "sugerencias_ducto": safe_str(row.get('sug_ducto', '')),
                        "observaciones_cerco": safe_str(row.get('obs_cerco', '')),
                        "sugerencias_cerco": safe_str(row.get('sug_cerco', '')),
                        "observaciones_descarga": safe_str(row.get('obs_descarga', '')),
                        "sugerencias_descarga": safe_str(row.get('sug_descarga', ''))
                    },
                    valvulas={
                        "diametros": {
                            '2': safe_int(row.get('valvulas_2', 0)),
                            '3': safe_int(row.get('valvulas_3', 0)),
                            '4': safe_int(row.get('valvulas_4', 0)),
                            '6': safe_int(row.get('valvulas_6', 0)),
                            '8': safe_int(row.get('valvulas_8', 0)),
                            '10': safe_int(row.get('valvulas_10', 0)),
                            '12': safe_int(row.get('valvulas_12', 0))
                        },
                        "aduccion": {
                            '2': safe_int(row.get('valvulas_aduccion_2', 0)),
                            '3': safe_int(row.get('valvulas_aduccion_3', 0)),
                            '4': safe_int(row.get('valvulas_aduccion_4', 0)),
                            '6': safe_int(row.get('valvulas_aduccion_6', 0)),
                            '8': safe_int(row.get('valvulas_aduccion_8', 0)),
                            '10': safe_int(row.get('valvulas_aduccion_10', 0)),
                            '12': safe_int(row.get('valvulas_aduccion_12', 0))
                        },
                        "bypass": {
                            '2': safe_int(row.get('valvulas_bypass_2', 0)),
                            '3': safe_int(row.get('valvulas_bypass_3', 0)),
                            '4': safe_int(row.get('valvulas_bypass_4', 0)),
                            '6': safe_int(row.get('valvulas_bypass_6', 0)),
                            '8': safe_int(row.get('valvulas_bypass_8', 0)),
                            '10': safe_int(row.get('valvulas_bypass_10', 0)),
                            '12': safe_int(row.get('valvulas_bypass_12', 0))
                        },
                        "desague": {
                            '2': safe_int(row.get('valvulas_desague_2', 0)),
                            '3': safe_int(row.get('valvulas_desague_3', 0)),
                            '4': safe_int(row.get('valvulas_desague_4', 0)),
                            '6': safe_int(row.get('valvulas_desague_6', 0)),
                            '8': safe_int(row.get('valvulas_desague_8', 0)),
                            '10': safe_int(row.get('valvulas_desague_10', 0)),
                            '12': safe_int(row.get('valvulas_desague_12', 0))
                        },
                        "operativas": safe_int(row.get('valvulas_operativas', 0)),
                        "no_operativas": safe_int(row.get('valvulas_no_operativas', 0)),
                        "observaciones_conduccion": safe_str(row.get('obs_valvulas_conduccion', '')),
                        "sugerencias_conduccion": safe_str(row.get('sug_valvulas_conduccion', '')),
                        "observaciones_aduccion": safe_str(row.get('obs_valvulas_aduccion', '')),
                        "sugerencias_aduccion": safe_str(row.get('sug_valvulas_aduccion', '')),
                        "observaciones_bypass": safe_str(row.get('obs_valvulas_bypass', '')),
                        "sugerencias_bypass": safe_str(row.get('sug_valvulas_bypass', '')),
                        "observaciones_desague": safe_str(row.get('obs_valvulas_desague', '')),
                        "sugerencias_desague": safe_str(row.get('sug_valvulas_desague', ''))
                    },
                    canastillas={
                        "diametros": {
                            '2': safe_int(row.get('canastillas_2', 0)),
                            '3': safe_int(row.get('canastillas_3', 0)),
                            '4': safe_int(row.get('canastillas_4', 0)),
                            '6': safe_int(row.get('canastillas_6', 0)),
                            '8': safe_int(row.get('canastillas_8', 0)),
                            '10': safe_int(row.get('canastillas_10', 0)),
                            '12': safe_int(row.get('canastillas_12', 0))
                        },
                        "operativas": safe_int(row.get('canastillas_operativas', 0)),
                        "no_operativas": safe_int(row.get('canastillas_no_operativas', 0)),
                        "observaciones_aduccion": safe_str(row.get('obs_canastillas_aduccion', '')),
                        "sugerencias_aduccion": safe_str(row.get('sug_canastillas_aduccion', ''))
                    },
                    medidas={
                        "diametro": safe_str(row.get('medidas_diametro', '')),
                        "diametro_interno": safe_str(row.get('medidas_diametro_interno', '')),
                        "altura_util": safe_str(row.get('medidas_altura_util', '')),
                        "altura_total": safe_str(row.get('medidas_altura_total', ''))
                    },
                    observaciones=safe_str(row.get('observaciones', '')),
                    sugerencias=safe_str(row.get('sugerencias', '')),
                    status='draft',
                    last_modified=datetime.now().isoformat()
                )
                
                self.reports[report.id] = report.dict()
                imported.append(report)
                
            except Exception as e:
                print(f"Error importing row {row.get('informe_id', '?')}: {e}")
                import traceback
                traceback.print_exc()
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
