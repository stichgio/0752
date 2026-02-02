"""
Gestor de Base de Datos en JSON para Fichas Técnicas
"""
import json
import os
from typing import List, Dict, Optional, Any
from datetime import datetime
from .models import FichaTecnica, ProductoQuimico, ServicioEfectuar, TiposTratamiento, ObservacionesRecomendaciones


class FichasTecnicasDB:
    def __init__(self, storage_dir=None):
        # Use absolute path relative to the backend directory
        if storage_dir is None:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            backend_dir = os.path.dirname(current_dir)
            storage_dir = os.path.join(backend_dir, "data")

        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)
        self.db_file = os.path.join(storage_dir, "fichas_tecnicas.json")
        print(f"[FichasTecnicas] DB file: {self.db_file}")
        self.fichas: Dict[str, dict] = {}
        self.load()

    def load(self):
        """Cargar base de datos desde JSON"""
        if os.path.exists(self.db_file):
            try:
                with open(self.db_file, 'r', encoding='utf-8') as f:
                    self.fichas = json.load(f)
                print(f"[FichasTecnicas] Loaded {len(self.fichas)} fichas")
            except Exception as e:
                print(f"[FichasTecnicas] Error loading: {e}")
                self.fichas = {}
        else:
            self.fichas = {}
            self.save()

    def save(self):
        """Guardar base de datos a JSON"""
        try:
            print(f"[FichasTecnicas] Saving to {self.db_file}")
            with open(self.db_file, 'w', encoding='utf-8') as f:
                json.dump(self.fichas, f, ensure_ascii=False, indent=2)
            print(f"[FichasTecnicas] Saved {len(self.fichas)} fichas successfully")
        except Exception as e:
            print(f"[FichasTecnicas] Error saving: {e}")

    def get_all_fichas(self) -> List[FichaTecnica]:
        """Obtener todas las fichas"""
        self.load()
        return [FichaTecnica(**data) for data in self.fichas.values()]

    def get_ficha(self, ficha_id: str) -> Optional[FichaTecnica]:
        """Obtener una ficha específica"""
        if ficha_id not in self.fichas:
            self.load()

        if ficha_id in self.fichas:
            return FichaTecnica(**self.fichas[ficha_id])
        return None

    def create_ficha(self, ficha: FichaTecnica) -> FichaTecnica:
        """Crear nueva ficha"""
        self.load()
        self.fichas[ficha.id] = ficha.dict()
        self.save()
        return ficha

    def update_ficha(self, ficha_id: str, ficha: FichaTecnica) -> FichaTecnica:
        """Actualizar ficha existente"""
        self.load()
        self.fichas[ficha_id] = ficha.dict()
        self.save()
        return ficha

    def delete_ficha(self, ficha_id: str) -> bool:
        """Eliminar una ficha"""
        self.load()
        if ficha_id in self.fichas:
            del self.fichas[ficha_id]
            self.save()
            return True
        return False

    def clear_all_fichas(self) -> int:
        """Eliminar todas las fichas y retornar cantidad eliminada"""
        self.load()
        count = len(self.fichas)
        self.fichas = {}
        self.save()
        print(f"[FichasTecnicas] Cleared {count} fichas")
        return count

    def import_from_data(self, data_list: List[Dict], clear_existing: bool = True) -> List[FichaTecnica]:
        """
        Importar fichas desde datos CSV/XLSX parseados.
        """
        self.load()

        # Track auto-increment counter
        max_existing_id = 0
        if not clear_existing:
            for ficha_data in self.fichas.values():
                try:
                    existing_id = int(ficha_data.get('os_numero', '0').replace('N°', '').strip())
                    max_existing_id = max(max_existing_id, existing_id)
                except (ValueError, TypeError):
                    pass

        # Clear existing if requested
        deleted_count = 0
        if clear_existing:
            deleted_count = len(self.fichas)
            self.fichas = {}
            print(f"[FichasTecnicas] Cleared {deleted_count} existing fichas")

        imported = []
        auto_increment_counter = max_existing_id

        def safe_str(value, default=''):
            if value is None or value == 'None':
                return default
            if isinstance(value, float) and str(value) == 'nan':
                return default
            return str(value).strip()

        def safe_bool(value) -> bool:
            if value is None:
                return False
            val = str(value).upper().strip()
            return val in ['X', 'SI', 'SÍ', 'TRUE', '1', 'YES', 'V']

        def normalize_satisfaccion(value) -> str:
            """Normaliza el valor de satisfacción al formato esperado por el modelo"""
            if value is None or value == 'None':
                return ''
            val = str(value).strip().lower().replace(' ', '_')
            # Mapeo de valores posibles
            mapping = {
                'muy_satisfecho': 'muy_satisfecho',
                'muy satisfecho': 'muy_satisfecho',
                'satisfecho': 'satisfecho',
                'regular': 'regular',
                'insatisfecho': 'insatisfecho',
            }
            return mapping.get(val, '')

        for idx, row in enumerate(data_list):
            try:
                auto_increment_counter += 1
                ficha_id = f"FT-{str(auto_increment_counter).zfill(5)}"

                ficha = FichaTecnica(
                    id=ficha_id,
                    os_numero=safe_str(row.get('os_numero', f'N° {str(auto_increment_counter).zfill(5)}')),
                    cliente=safe_str(row.get('cliente', '')),
                    fecha=safe_str(row.get('fecha', '')),
                    direccion=safe_str(row.get('direccion', '')),
                    distrito=safe_str(row.get('distrito', '')),
                    servicio=ServicioEfectuar(
                        desinfeccion=safe_bool(row.get('servicio_desinfeccion')),
                        limpieza_ambientes=safe_bool(row.get('servicio_limpieza_ambientes')),
                        limpieza_pozos_septicos=safe_bool(row.get('servicio_limpieza_pozos')),
                        limpieza_reservorios=safe_bool(row.get('servicio_limpieza_reservorios'))
                    ),
                    diagnostico_area=safe_str(row.get('diagnostico_area', '')),
                    condicion_sanitaria=safe_str(row.get('condicion_sanitaria', '')),
                    tratamiento=TiposTratamiento(
                        pulverizado=safe_bool(row.get('tratamiento_pulverizado')),
                        atomizado=safe_bool(row.get('tratamiento_atomizado')),
                        thermonebulizado=safe_bool(row.get('tratamiento_thermonebulizado')),
                        nebulizado_ulv=safe_bool(row.get('tratamiento_nebulizado_ulv')),
                        otros=safe_str(row.get('tratamiento_otros', ''))
                    ),
                    productos=[
                        ProductoQuimico(
                            producto=safe_str(row.get('producto_1_nombre', '')),
                            composicion=safe_str(row.get('producto_1_composicion', '')),
                            lote=safe_str(row.get('producto_1_lote', '')),
                            fecha_vencimiento=safe_str(row.get('producto_1_vencimiento', '')),
                            unidad=safe_str(row.get('producto_1_unidad', '')),
                            concentracion=safe_str(row.get('producto_1_concentracion', '')),
                            cantidad=safe_str(row.get('producto_1_cantidad', ''))
                        ),
                        ProductoQuimico(
                            producto=safe_str(row.get('producto_2_nombre', '')),
                            composicion=safe_str(row.get('producto_2_composicion', '')),
                            lote=safe_str(row.get('producto_2_lote', '')),
                            fecha_vencimiento=safe_str(row.get('producto_2_vencimiento', '')),
                            unidad=safe_str(row.get('producto_2_unidad', '')),
                            concentracion=safe_str(row.get('producto_2_concentracion', '')),
                            cantidad=safe_str(row.get('producto_2_cantidad', ''))
                        ),
                        ProductoQuimico(
                            producto=safe_str(row.get('producto_3_nombre', '')),
                            composicion=safe_str(row.get('producto_3_composicion', '')),
                            lote=safe_str(row.get('producto_3_lote', '')),
                            fecha_vencimiento=safe_str(row.get('producto_3_vencimiento', '')),
                            unidad=safe_str(row.get('producto_3_unidad', '')),
                            concentracion=safe_str(row.get('producto_3_concentracion', '')),
                            cantidad=safe_str(row.get('producto_3_cantidad', ''))
                        ),
                        ProductoQuimico(
                            producto=safe_str(row.get('producto_4_nombre', '')),
                            composicion=safe_str(row.get('producto_4_composicion', '')),
                            lote=safe_str(row.get('producto_4_lote', '')),
                            fecha_vencimiento=safe_str(row.get('producto_4_vencimiento', '')),
                            unidad=safe_str(row.get('producto_4_unidad', '')),
                            concentracion=safe_str(row.get('producto_4_concentracion', '')),
                            cantidad=safe_str(row.get('producto_4_cantidad', ''))
                        )
                    ],
                    acciones_correctivas=safe_str(row.get('acciones_correctivas', '')),
                    areas_tratadas=safe_str(row.get('areas_tratadas', '')),
                    personal_tecnico=[
                        safe_str(row.get('personal_tecnico_1', row.get('personal_tecnico', ''))),
                        safe_str(row.get('personal_tecnico_2', '')),
                        safe_str(row.get('personal_tecnico_3', '')),
                        safe_str(row.get('personal_tecnico_4', '')),
                        safe_str(row.get('personal_tecnico_5', '')),
                        safe_str(row.get('personal_tecnico_6', ''))
                    ],
                    hora_inicio=safe_str(row.get('hora_inicio', '')),
                    hora_termino=safe_str(row.get('hora_termino', '')),
                    numero_certificado=safe_str(row.get('numero_certificado', '')),
                    obs_rec=ObservacionesRecomendaciones(
                        observacion_a=safe_str(row.get('observacion_a', '')),
                        observacion_b=safe_str(row.get('observacion_b', '')),
                        observacion_c=safe_str(row.get('observacion_c', '')),
                        recomendacion_a=safe_str(row.get('recomendacion_a', '')),
                        recomendacion_b=safe_str(row.get('recomendacion_b', '')),
                        recomendacion_c=safe_str(row.get('recomendacion_c', ''))
                    ),
                    satisfaccion=normalize_satisfaccion(row.get('satisfaccion', '')),
                    status='draft',
                    last_modified=datetime.now().isoformat()
                )

                self.fichas[ficha.id] = ficha.dict()
                imported.append(ficha)

            except Exception as e:
                print(f"Error importing row {idx + 1}: {e}")
                import traceback
                traceback.print_exc()
                continue

        self.save()
        print(f"[FichasTecnicas] Imported {len(imported)} fichas (deleted {deleted_count} old records)")
        return imported


# Instancia global
db = FichasTecnicasDB()
