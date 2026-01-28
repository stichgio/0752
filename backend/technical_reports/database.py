"""
Gestor de Base de Datos en JSON para Informes Técnicos
"""
import json
import os
from typing import List, Dict, Optional, Any
from datetime import datetime
from .models import TechnicalReport

class TechnicalReportsDB:
    def __init__(self, storage_dir=None):
        # Use absolute path relative to the backend directory
        if storage_dir is None:
            # Get the backend directory (parent of technical_reports)
            current_dir = os.path.dirname(os.path.abspath(__file__))
            backend_dir = os.path.dirname(current_dir)
            storage_dir = os.path.join(backend_dir, "data")
        
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)
        self.db_file = os.path.join(storage_dir, "technical_reports.json")
        print(f"[TechReports] DB file: {self.db_file}")
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
            print(f"[TechReports] Saving to {self.db_file}")
            with open(self.db_file, 'w', encoding='utf-8') as f:
                json.dump(self.reports, f, ensure_ascii=False, indent=2)
            print(f"[TechReports] Saved {len(self.reports)} reports successfully")
        except Exception as e:
            print(f"[TechReports] Error saving: {e}")
    
    def get_all_reports(self) -> List[TechnicalReport]:
        """Obtener todos los informes (Forzando recarga para garantizar consistencia)"""
        # Reload to ensure we have the latest data from disk (useful if multiple workers or async issues)
        self.load()
        return [TechnicalReport(**data) for data in self.reports.values()]
    
    def get_report(self, report_id: str) -> Optional[TechnicalReport]:
        """Obtener un informe específico"""
        # Reload to ensure we have the latest data
        if report_id not in self.reports:
            self.load()
            
        if report_id in self.reports:
            return TechnicalReport(**self.reports[report_id])
        return None
    
    def create_report(self, report: TechnicalReport) -> TechnicalReport:
        """Crear nuevo informe"""
        self.load() # Ensure fresh state
        self.reports[report.id] = report.dict()
        self.save()
        return report
    
    def update_report(self, report_id: str, report: TechnicalReport) -> TechnicalReport:
        """Actualizar informe existente"""
        self.load() # Ensure fresh state
        self.reports[report_id] = report.dict()
        self.save()
        return report
    
    def delete_report(self, report_id: str) -> bool:
        self.load()
        if report_id in self.reports:
            del self.reports[report_id]
            self.save()
            return True
        return False

    def clear_all_reports(self) -> int:
        """Elimina todos los reportes y retorna la cantidad eliminada."""
        self.load()
        count = len(self.reports)
        self.reports = {}
        self.save()
        print(f"[TechReports] Cleared {count} reports")
        return count
    
    def import_from_csv(self, csv_data: List[Dict], clear_existing: bool = True) -> List[TechnicalReport]:
        """
        Importar informes desde datos CSV/XLSX parseados.
        
        Args:
            csv_data: Lista de diccionarios con los datos de cada fila
            clear_existing: Si es True, elimina todos los registros existentes antes de importar
        """
        self.load()  # Ensure we have latest data before importing
        
        # PASO 1: Find max existing ID before clearing (for auto-increment reference)
        max_existing_id = 0
        if not clear_existing:
            for report_data in self.reports.values():
                try:
                    metadata = report_data.get('metadata', {})
                    existing_id = int(metadata.get('informe_id', 0))
                    max_existing_id = max(max_existing_id, existing_id)
                except (ValueError, TypeError):
                    pass
        
        # PASO 2: Eliminar todos los registros existentes si se solicita
        deleted_count = 0
        if clear_existing:
            deleted_count = len(self.reports)
            self.reports = {}
            print(f"[TechReports] Cleared {deleted_count} existing reports")
        
        imported = []
        
        print(f"[TechReports] Starting import of {len(csv_data)} rows")
        print(f"[TechReports] Max existing ID before import: {max_existing_id}")
        if len(csv_data) > 0:
            print(f"[TechReports] CSV Sample Keys: {list(csv_data[0].keys())}")
            # Debug: mostrar valores de la primera fila
            first_row = csv_data[0]
            print(f"[TechReports] First row sample values:")
            print(f"  - informe_id: '{first_row.get('informe_id')}'")
            print(f"  - cs: '{first_row.get('cs')}'")
            print(f"  - contratista: '{first_row.get('contratista')}'")
            print(f"  - codigo_infraestructura: '{first_row.get('codigo_infraestructura')}'")

        def safe_int(value, default=0):
            """Convertir valor a int de manera segura, manejando NaN y vacíos"""
            if value is None or value == '' or value == 'None':
                return default
            if isinstance(value, float):
                if str(value) == 'nan':
                    return default
                return int(value)
            try:
                return int(float(value))
            except (ValueError, TypeError):
                return default
        
        def safe_str(value, default=''):
            """Convertir valor a string de manera segura, manejando NaN"""
            if value is None or value == 'None':
                return default
            if isinstance(value, float) and str(value) == 'nan':
                return default
            return str(value).strip()
        
        # Track auto-increment counter starting from max existing ID
        auto_increment_counter = max_existing_id
        
        for idx, row in enumerate(csv_data):
            try:
                # DETECCIÓN: ¿Los datos ya vienen en formato anidado (transformados)?
                is_nested_format = all(key in row for key in ['metadata', 'header', 'inspeccion', 'valvulas', 'canastillas'])
                
                if is_nested_format:
                    # FORMATO ANIDADO: Los datos ya fueron transformados por transform_flat_to_nested
                    # Extraer informe_id del metadata anidado
                    nested_metadata = row.get('metadata', {})
                    raw_informe_id = safe_int(nested_metadata.get('informe_id', 0), 0)
                    
                    if raw_informe_id > 0:
                        informe_id = raw_informe_id
                        auto_increment_counter = max(auto_increment_counter, informe_id)
                    else:
                        auto_increment_counter += 1
                        informe_id = auto_increment_counter
                    
                    report_id = f"RPT-{str(informe_id).zfill(4)}"
                    
                    # Actualizar el metadata con el informe_id corregido
                    nested_metadata['informe_id'] = informe_id
                    row['metadata'] = nested_metadata
                    row['id'] = report_id
                    row['last_modified'] = datetime.now().isoformat()
                    
                    # Crear el report directamente desde los datos anidados
                    report = TechnicalReport(**row)
                    
                else:
                    # FORMATO PLANO (LEGACY): Construir desde datos planos del CSV/Excel
                    raw_informe_id = safe_int(row.get('informe_id'), 0)
                    
                    if raw_informe_id > 0:
                        informe_id = raw_informe_id
                        auto_increment_counter = max(auto_increment_counter, informe_id)
                    else:
                        auto_increment_counter += 1
                        informe_id = auto_increment_counter
                    
                    report_id = f"RPT-{str(informe_id).zfill(4)}"
                    
                    report = TechnicalReport(
                        id=report_id,
                        metadata={
                            "informe_id": informe_id,
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
                                '2': safe_int(row.get('valvulas_conduccion_2', 0)),
                                '3': safe_int(row.get('valvulas_conduccion_3', 0)),
                                '4': safe_int(row.get('valvulas_conduccion_4', 0)),
                                '6': safe_int(row.get('valvulas_conduccion_6', 0)),
                                '8': safe_int(row.get('valvulas_conduccion_8', 0)),
                                '10': safe_int(row.get('valvulas_conduccion_10', 0)),
                                '12': safe_int(row.get('valvulas_conduccion_12', 0))
                            },
                            "impulsion": {
                                '2': safe_int(row.get('valvulas_impulsion_2', 0)),
                                '3': safe_int(row.get('valvulas_impulsion_3', 0)),
                                '4': safe_int(row.get('valvulas_impulsion_4', 0)),
                                '6': safe_int(row.get('valvulas_impulsion_6', 0)),
                                '8': safe_int(row.get('valvulas_impulsion_8', 0)),
                                '10': safe_int(row.get('valvulas_impulsion_10', 0)),
                                '12': safe_int(row.get('valvulas_impulsion_12', 0))
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
                            "observaciones_impulsion": safe_str(row.get('obs_valvulas_impulsion', '')),
                            "sugerencias_impulsion": safe_str(row.get('sug_valvulas_impulsion', '')),
                            "observaciones_aduccion": safe_str(row.get('obs_valvulas_aduccion', '')),
                            "sugerencias_aduccion": safe_str(row.get('sug_valvulas_aduccion', '')),
                            "observaciones_bypass": safe_str(row.get('obs_valvulas_bypass', '')),
                            "sugerencias_bypass": safe_str(row.get('sug_valvulas_bypass', '')),
                            "observaciones_desague": safe_str(row.get('obs_valvulas_desague', '')),
                            "sugerencias_desague": safe_str(row.get('sug_valvulas_desague', ''))
                        },
                        canastillas={
                            "diametros": {
                                '2': safe_int(row.get('canastillas_aduccion_2', 0)),
                                '3': safe_int(row.get('canastillas_aduccion_3', 0)),
                                '4': safe_int(row.get('canastillas_aduccion_4', 0)),
                                '6': safe_int(row.get('canastillas_aduccion_6', 0)),
                                '8': safe_int(row.get('canastillas_aduccion_8', 0)),
                                '10': safe_int(row.get('canastillas_aduccion_10', 0)),
                                '14': safe_int(row.get('canastillas_aduccion_14', 0))
                            },
                            "aduccion": {
                                '2': safe_int(row.get('canastillas_aduccion_2', 0)),
                                '3': safe_int(row.get('canastillas_aduccion_3', 0)),
                                '4': safe_int(row.get('canastillas_aduccion_4', 0)),
                                '6': safe_int(row.get('canastillas_aduccion_6', 0)),
                                '8': safe_int(row.get('canastillas_aduccion_8', 0)),
                                '10': safe_int(row.get('canastillas_aduccion_10', 0)),
                                '14': safe_int(row.get('canastillas_aduccion_14', 0))
                            },
                            "succion": {
                                '2': safe_int(row.get('canastillas_succion_2', 0)),
                                '3': safe_int(row.get('canastillas_succion_3', 0)),
                                '4': safe_int(row.get('canastillas_succion_4', 0)),
                                '6': safe_int(row.get('canastillas_succion_6', 0)),
                                '8': safe_int(row.get('canastillas_succion_8', 0)),
                                '10': safe_int(row.get('canastillas_succion_10', 0)),
                                '14': safe_int(row.get('canastillas_succion_14', 0))
                            },
                            "desague": {
                                '2': safe_int(row.get('canastillas_desague_2', 0)),
                                '3': safe_int(row.get('canastillas_desague_3', 0)),
                                '4': safe_int(row.get('canastillas_desague_4', 0)),
                                '6': safe_int(row.get('canastillas_desague_6', 0)),
                                '8': safe_int(row.get('canastillas_desague_8', 0)),
                                '10': safe_int(row.get('canastillas_desague_10', 0)),
                                '14': safe_int(row.get('canastillas_desague_14', 0))
                            },
                            "operativas": safe_int(row.get('canastillas_operativas', 0)),
                            "no_operativas": safe_int(row.get('canastillas_no_operativas', 0)),
                            "observaciones_aduccion": safe_str(row.get('obs_canastillas_aduccion', '')),
                            "sugerencias_aduccion": safe_str(row.get('sug_canastillas_aduccion', '')),
                            "observaciones_succion": safe_str(row.get('obs_canastillas_succion', '')),
                            "sugerencias_succion": safe_str(row.get('sug_canastillas_succion', '')),
                            "observaciones_desague": safe_str(row.get('obs_canastillas_desague', '')),
                            "sugerencias_desague": safe_str(row.get('sug_canastillas_desague', ''))
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
                print(f"Error importing row {idx + 1}: {e}")
                import traceback
                traceback.print_exc()
                continue
        
        self.save()
        print(f"[TechReports] Imported {len(imported)} reports (deleted {deleted_count} old records)")
        return imported
    
    @staticmethod
    def _parse_check(value) -> str:
        """Convertir valor CSV a estado de checkbox"""
        if not value or str(value).strip() == '' or str(value) == 'None':
            return 'unchecked'
        val_upper = str(value).upper().strip()
        # Valores para NORMAL
        if val_upper in ['X', 'NORMAL', 'BUENO', 'OK', 'SI', 'SÍ', 'V']:
            return 'normal'
        # Valores para CRÍTICO
        elif val_upper in ['CRITICO', 'CRÍTICO', 'MALO', 'OBSERVADO', 'F', 'NO']:
            return 'critico'
        return 'unchecked'

# Instancia global
db = TechnicalReportsDB()
