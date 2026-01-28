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
    Parsea archivo XLSX (Excel) con detección robusta de headers y mapeo flexible.
    Diseñado para tolerar formatos humanos con nombres como 'Centro de Servicio', 'Nro Informe', etc.
    """
    if not XLSX_SUPPORTED:
        raise ValueError("Soporte XLSX no disponible. Instale openpyxl: pip install openpyxl")
    
    # 1. Definir Mapeo de Columnas (Humano -> Sistema)
    # IMPORTANTE: Las claves (izquierda) deben estar "NORMALIZADAS":
    # - Todo minúsculas
    # - SIN espacios
    # - SIN guiones bajos (_) ni puntos (.)
    # - SIN paréntesis ni comillas
    COLUMN_MAPPING = {
        # Identificadores
        'nroinforme': 'informe_id',
        'numeroinforme': 'informe_id',
        'informe': 'informe_id',
        'id': 'informe_id',
        'item': 'informe_id',
        
        # Centro de Servicio
        'centrodeservicio': 'cs',
        'centroservicio': 'cs',
        'cs': 'cs',
        'sede': 'cs',
        'localidad': 'cs',
        
        # Datos Generales
        'contratista': 'contratista',
        'codigoinfraestructura': 'codigo_infraestructura',
        'codinfraestructura': 'codigo_infraestructura',
        'infraestructura': 'codigo_infraestructura',
        'codigo': 'codigo_infraestructura',
        'ubicacion': 'ubicacion',
        'direccion': 'ubicacion',
        'suministro': 'suministro',
        'nrosuministro': 'suministro',
        'numerosuministro': 'suministro',
        'nis': 'suministro',
        'tipo': 'tipo',
        'tipoestructura': 'tipo',
        'volumen': 'volumen',
        'volumenm3': 'volumen',
        'capacidad': 'volumen',
        
        # Fechas
        'dia': 'dia',
        'mes': 'mes',
        'año': 'anio',
        'anio': 'anio',
        
        # --- INSPECCIÓN (ESTADOS) ---
        'cajaregistro': 'caja_registro',
        'cajaderegistro': 'caja_registro',
        'marcotapa': 'marco_tapa',
        'marcoytapa': 'marco_tapa',
        'marcotapasanitaria': 'marco_tapa',
        'escalerainterior': 'escalera_interior',
        'escaleraint': 'escalera_interior',
        'escaleraexterior': 'escalera_exterior',
        'escaleraext': 'escalera_exterior',
        'cubainterior': 'cuba_interior',
        'cubaint': 'cuba_interior',
        'cubaexterior': 'cuba_exterior',
        'cubaext': 'cuba_exterior',
        'lozafondo': 'loza_fondo',
        'lozadefondo': 'loza_fondo',
        'lozatechointerior': 'loza_techo_interior',
        'lozatechoint': 'loza_techo_interior',
        'lozatechoexterior': 'loza_techo_exterior',
        'lozatechoext': 'loza_techo_exterior',
        'ductoventilacion': 'ducto_ventilacion',
        'ductodeventilacion': 'ducto_ventilacion',
        'ventilacion': 'ducto_ventilacion',
        'cercoperimetrico': 'cerco_perimetrico',
        'cerco': 'cerco_perimetrico',
        'descarga': 'descarga',
        'tuberíadescarga': 'descarga',

        # --- MEDIDAS ---
        'medidasdiametro': 'medidas_diametro',
        'diametro': 'medidas_diametro',
        'diametrom': 'medidas_diametro', # Con unidad
        'medidasdiametrointerno': 'medidas_diametro_interno',
        'diametrointerno': 'medidas_diametro_interno',
        'diametrointernom': 'medidas_diametro_interno', # Con unidad
        'medidasalturautil': 'medidas_altura_util',
        'alturautil': 'medidas_altura_util',
        'alturautilm': 'medidas_altura_util', # Con unidad
        'medidasalturatotal': 'medidas_altura_total',
        'alturatotal': 'medidas_altura_total',
        'alturatotalm': 'medidas_altura_total', # Con unidad

        # --- VÁLVULAS (OBSERVACIONES Y SUGERENCIAS) ---
        'obsvalvulasconduccion': 'obs_valvulas_conduccion',
        'observacionesconduccion': 'obs_valvulas_conduccion',
        'sugvalvulasconduccion': 'sug_valvulas_conduccion',
        'sugerenciasconduccion': 'sug_valvulas_conduccion',
        
        'obsvalvulasimpulsion': 'obs_valvulas_impulsion',
        'observacionesimpulsion': 'obs_valvulas_impulsion',
        'sugvalvulasimpulsion': 'sug_valvulas_impulsion',
        'sugerenciasimpulsion': 'sug_valvulas_impulsion',
        
        'obsvalvulasaduccion': 'obs_valvulas_aduccion',
        'observacionesaduccion': 'obs_valvulas_aduccion',
        'sugvalvulasaduccion': 'sug_valvulas_aduccion',
        'sugerenciasaduccion': 'sug_valvulas_aduccion',
        
        'obsvalvulasbypass': 'obs_valvulas_bypass',
        'observacionesbypass': 'obs_valvulas_bypass',
        'sugvalvulasbypass': 'sug_valvulas_bypass',
        'sugerenciasbypass': 'sug_valvulas_bypass',
        'observacionespass': 'obs_valvulas_bypass', # Posible error de tipeo "By Pass" -> "Pass"

        'obsvalvulasdesague': 'obs_valvulas_desague',
        'observacionesdesague': 'obs_valvulas_desague', # Cuidado: puede chocar con canastillas o inspeccion
        'observacionesvalvulasdesague': 'obs_valvulas_desague',
        'sugvalvulasdesague': 'sug_valvulas_desague',
        'sugerenciasdesague': 'sug_valvulas_desague',
        'sugerenciasvalvulasdesague': 'sug_valvulas_desague',

        # --- CANASTILLAS (OBSERVACIONES Y SUGERENCIAS) ---
        'obscanastillasaduccion': 'obs_canastillas_aduccion',
        'observacionescanastillaaduccion': 'obs_canastillas_aduccion',
        'sugcanastillasaduccion': 'sug_canastillas_aduccion',
        'sugerenciascanastillaaduccion': 'sug_canastillas_aduccion',
        
        'obscanastillassuccion': 'obs_canastillas_succion',
        'observacionescanastillasuccion': 'obs_canastillas_succion',
        'observacionessuccion': 'obs_canastillas_succion',
        'sugcanastillassuccion': 'sug_canastillas_succion',
        'sugerenciascanastillasuccion': 'sug_canastillas_succion',
        'sugerenciassuccion': 'sug_canastillas_succion',

        'obscanastillasdesague': 'obs_canastillas_desague',
        'observacionescanastilladesague': 'obs_canastillas_desague',
        'sugcanastillasdesague': 'sug_canastillas_desague',
        'sugerenciascanastilladesague': 'sug_canastillas_desague',

        # --- INSPECCIÓN (OBSERVACIONES Y SUGERENCIAS) ---
        'obscajaregistro': 'obs_caja_registro',
        'observacionescajaregistro': 'obs_caja_registro',
        'sugcajaregistro': 'sug_caja_registro',
        'sugerenciascajaregistro': 'sug_caja_registro',
        
        'obsmarcotapa': 'obs_marco_tapa',
        'observacionesmarcotapa': 'obs_marco_tapa',
        'sugmarcotapa': 'sug_marco_tapa',
        'sugerenciasmarcotapa': 'sug_marco_tapa',

        'obsescalerainterior': 'obs_escalera_int',
        'observacionesescalerainterior': 'obs_escalera_int',
        'sugescalerainterior': 'sug_escalera_int',
        'sugerenciasescalerainterior': 'sug_escalera_int',
        
        'obsescaleraexterior': 'obs_escalera_ext',
        'observacionesescaleraexterior': 'obs_escalera_ext',
        'sugescaleraexterior': 'sug_escalera_ext',
        'sugerenciasescaleraexterior': 'sug_escalera_ext',

        'obscubainterior': 'obs_cuba_int',
        'observacionescubainterior': 'obs_cuba_int',
        'sugcubainterior': 'sug_cuba_int',
        'sugerenciascubainterior': 'sug_cuba_int',
        
        'obscubaexterior': 'obs_cuba_ext',
        'observacionescubaexterior': 'obs_cuba_ext',
        'sugcubaexterior': 'sug_cuba_ext',
        'sugerenciascubaexterior': 'sug_cuba_ext',
        
        'obslozafondo': 'obs_loza_fondo',
        'observacioneslozafondo': 'obs_loza_fondo',
        'suglozafondo': 'sug_loza_fondo',
        'sugerenciaslozafondo': 'sug_loza_fondo',

        'obslozatechointerior': 'obs_loza_techo_int',
        'observacioneslozatechointerior': 'obs_loza_techo_int',
        'suglozatechointerior': 'sug_loza_techo_int',
        'sugerenciaslozatechointerior': 'sug_loza_techo_int',
        
        'obslozatechoexterior': 'obs_loza_techo_ext',
        'observacioneslozatechoexterior': 'obs_loza_techo_ext',
        'suglozatechoexterior': 'sug_loza_techo_ext',
        'sugerenciaslozatechoexterior': 'sug_loza_techo_ext',

        'obsductoventilacion': 'obs_ducto',
        'observacionesductoventilacion': 'obs_ducto',
        'sugductoventilacion': 'sug_ducto',
        'sugerenciasductoventilacion': 'sug_ducto',
        
        'obscercoperimetrico': 'obs_cerco',
        'observacionescercoperimetrico': 'obs_cerco',
        'sugcercoperimetrico': 'sug_cerco',
        'sugerenciascercoperimetrico': 'sug_cerco',
        
        'obsdescarga': 'obs_descarga',
        'observacionesdescarga': 'obs_descarga',
        'sugdescarga': 'sug_descarga',
        'sugerenciasdescarga': 'sug_descarga',

        # --- VÁLVULAS (DIÁMETROS) ---
        # Conducción
        'valvulasconduccion2': 'valvulas_conduccion_2',
        'valvulasconduccion3': 'valvulas_conduccion_3',
        'valvulasconduccion4': 'valvulas_conduccion_4',
        'valvulasconduccion6': 'valvulas_conduccion_6',
        'valvulasconduccion8': 'valvulas_conduccion_8',
        'valvulasconduccion10': 'valvulas_conduccion_10',
        'valvulasconduccion12': 'valvulas_conduccion_12',
        # Variaciones cortas
        'valvcond2': 'valvulas_conduccion_2',
        'valvcond3': 'valvulas_conduccion_3',
        'valvcond4': 'valvulas_conduccion_4',
        'valvcond6': 'valvulas_conduccion_6',
        'valvcond8': 'valvulas_conduccion_8',
        'valvcond10': 'valvulas_conduccion_10',
        'valvcond12': 'valvulas_conduccion_12',

        # Impulsión
        'valvulasimpulsion2': 'valvulas_impulsion_2',
        'valvulasimpulsion3': 'valvulas_impulsion_3',
        'valvulasimpulsion4': 'valvulas_impulsion_4',
        'valvulasimpulsion6': 'valvulas_impulsion_6',
        'valvulasimpulsion8': 'valvulas_impulsion_8',
        'valvulasimpulsion10': 'valvulas_impulsion_10',
        'valvulasimpulsion12': 'valvulas_impulsion_12',
        # Variaciones cortas
        'valvimp2': 'valvulas_impulsion_2',
        'valvimp3': 'valvulas_impulsion_3',
        'valvimp4': 'valvulas_impulsion_4',
        'valvimp6': 'valvulas_impulsion_6',
        'valvimp8': 'valvulas_impulsion_8',
        'valvimp10': 'valvulas_impulsion_10',
        'valvimp12': 'valvulas_impulsion_12',

        # Aducción
        'valvulasaduccion2': 'valvulas_aduccion_2',
        'valvulasaduccion3': 'valvulas_aduccion_3',
        'valvulasaduccion4': 'valvulas_aduccion_4',
        'valvulasaduccion6': 'valvulas_aduccion_6',
        'valvulasaduccion8': 'valvulas_aduccion_8',
        'valvulasaduccion10': 'valvulas_aduccion_10',
        'valvulasaduccion12': 'valvulas_aduccion_12',
        
        # Bypass
        'valvulasbypass2': 'valvulas_bypass_2',
        'valvulasbypass3': 'valvulas_bypass_3',
        'valvulasbypass4': 'valvulas_bypass_4',
        'valvulasbypass6': 'valvulas_bypass_6',
        'valvulasbypass8': 'valvulas_bypass_8',
        'valvulasbypass10': 'valvulas_bypass_10',
        'valvulasbypass12': 'valvulas_bypass_12',

        # Desagüe (Válvulas)
        'valvulasdesague2': 'valvulas_desague_2',
        'valvulasdesague3': 'valvulas_desague_3',
        'valvulasdesague4': 'valvulas_desague_4',
        'valvulasdesague6': 'valvulas_desague_6',
        'valvulasdesague8': 'valvulas_desague_8',
        'valvulasdesague10': 'valvulas_desague_10',
        'valvulasdesague12': 'valvulas_desague_12',

        # --- CANASTILLAS ---
        # Aducción
        'canastillasaduccion2': 'canastillas_aduccion_2',
        'canastillasaduccion3': 'canastillas_aduccion_3',
        'canastillasaduccion4': 'canastillas_aduccion_4',
        'canastillasaduccion6': 'canastillas_aduccion_6',
        'canastillasaduccion8': 'canastillas_aduccion_8',
        'canastillasaduccion10': 'canastillas_aduccion_10',
        'canastillasaduccion12': 'canastillas_aduccion_14', # Map legacy 12 to 14 if needed
        'canastillasaduccion14': 'canastillas_aduccion_14',
        'canastaduccion2': 'canastillas_aduccion_2',
        'canastaduccion14': 'canastillas_aduccion_14',

        # Succión
        'canastillassuccion2': 'canastillas_succion_2',
        'canastillassuccion3': 'canastillas_succion_3',
        'canastillassuccion4': 'canastillas_succion_4',
        'canastillassuccion6': 'canastillas_succion_6',
        'canastillassuccion8': 'canastillas_succion_8',
        'canastillassuccion10': 'canastillas_succion_10',
        'canastillassuccion14': 'canastillas_succion_14',
        'canastsuccion2': 'canastillas_succion_2',
        'canastsuccion14': 'canastillas_succion_14',

        # Desagüe (Canastillas)
        'canastillasdesague2': 'canastillas_desague_2',
        'canastillasdesague3': 'canastillas_desague_3',
        'canastillasdesague4': 'canastillas_desague_4',
        'canastillasdesague6': 'canastillas_desague_6',
        'canastillasdesague8': 'canastillas_desague_8',
        'canastillasdesague10': 'canastillas_desague_10',
        'canastillasdesague14': 'canastillas_desague_14',
        
        # Totales / Operatividad
        'valvulasoperativas': 'valvulas_operativas',
        'valvulasnooperativas': 'valvulas_no_operativas',
        'canastillasoperativas': 'canastillas_operativas',
        'canastillasnooperativas': 'canastillas_no_operativas',

        # Observaciones y Sugerencias Generales
        'observaciones': 'observaciones',
        'observacion': 'observaciones',
        'sugerencias': 'sugerencias',
        'sugerencia': 'sugerencias',
    }
    
    # Lista de columnas CLAVE para identificar la fila de headers
    # Si una fila tiene al menos una de estas, es candidata a ser header
    HEADER_CANDIDATES = ['informe', 'id', 'cs', 'centro servicio', 'contratista', 'codigo']

    def normalize_str(s: str) -> str:
        """Limpia string para facilitar comparaciones (minusculas, sin espacios, sin acentos)"""
        if not s: return ""
        s = str(s).lower().strip()
        # Reemplazos básicos
        replacements = {
            'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n',
            ' ': '', '_': '', '.': '', ':': '', '°': ''
        }
        for old, new in replacements.items():
            s = s.replace(old, new)
        return s

    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet = workbook.active
        all_rows = list(sheet.iter_rows(values_only=True))
        
        print(f"[XLSX] Total filas leídas: {len(all_rows)}")
        
        headers = [] # Lista final de claves mapeadas
        header_row_index = -1
        
        # 2. Buscar fila de headers (Escaneo profundo primeras 30 filas)
        for idx, row in enumerate(all_rows[:30]):
            if not row: continue
            
            # Convertir fila a versiones normalizadas
            row_normalized = [normalize_str(cell) for cell in row]
            
            # Chequear si parece un header
            # Criterio: Contiene al menos 2 columnas clave conocidas (ej. 'informe' y 'cs')
            matches = 0
            for val in row_normalized:
                for key in COLUMN_MAPPING.keys():
                    if key in val: # 'nroinforme' in 'nroinformexxx'
                        matches += 1
                        break
                        
            # Si tiene coincidencias, verificamos con más detalle
            if matches >= 2:
                header_row_index = idx
                print(f"[XLSX] Fila de headers detectada en índice {idx} (Matches: {matches})")
                
                # Construir mapeo para esta fila
                for cell in row:
                    original_val = str(cell).strip() if cell else ""
                    normalized_val = normalize_str(original_val)
                    
                    found_key = f"_col_{len(headers)}" # Default si no mapea
                    
                    # Intentar mapear
                    if normalized_val:
                        # Buscar coincidencia exacta o parcial en keys de mapeo
                        # Prioridad 1: Coincidencia exacta con alguna key del mapping
                        if normalized_val in COLUMN_MAPPING:
                             found_key = COLUMN_MAPPING[normalized_val]
                        # NEW: Handle 'FECHA CORTE' specifically to match template expectation
                        elif "fechacorte" in normalized_val:
                             found_key = "FECHA CORTE"
                        else:
                            # Prioridad 2: Buscar si alguna key del mapping está contenida (aprox)
                            # Ej: "Nro. Informe (ID)" -> normalizado "nroinformeid" -> contiene "id" o "informe"
                            best_match = None
                            max_len = 0
                            for map_key, map_val in COLUMN_MAPPING.items():
                                if map_key in normalized_val:
                                    if len(map_key) > max_len: # Preferir la coincidencia más larga ("centroservicio" > "cs")
                                        best_match = map_val
                                        max_len = len(map_key)
                            
                            if best_match:
                                found_key = best_match
                            else:
                                # Fallback: usar el valor original limpio como clave (para columnas custom que coincidan directo con modelo)
                                # Ej: si la columna se llama "valvulas_conduccion_2" directamente
                                clean_prop = original_val.lower().replace(' ', '_').replace('.', '')
                                found_key = clean_prop
                                
                    headers.append(found_key)
                
                print(f"[XLSX] Headers mapeados (primeros 5): {headers[:5]}")
                break
        
        if header_row_index == -1:
             raise ValueError("No se pudo detectar la fila de encabezados. Asegúrate de incluir columnas como 'Nro Informe', 'CS', 'Contratista'.")

        # 3. Extraer Datos
        parsed_rows = []
        for row in all_rows[header_row_index + 1:]:
            if not any(row): continue # Saltar filas totalmente vacias
            
            row_dict = {}
            has_useful_data = False
            
            for col_idx, cell_value in enumerate(row):
                if col_idx < len(headers):
                    key = headers[col_idx]
                    # Ignorar columnas no mapeadas o vacias
                    if not key.startswith("_col_") and cell_value is not None:
                        # FIX: Handle datetime objects to prevent timezone shifts (UTC vs Local)
                        if hasattr(cell_value, 'strftime'):
                            try:
                                # HACK: Add safety margin for dates that are exactly at midnight
                                # If server is UTC and local is UTC-5, 00:00:00 becomes previous day
                                # Moving to noon (12:00:00) prevents this shift for reasonable timezones
                                if hasattr(cell_value, 'hour') and cell_value.hour == 0 and cell_value.minute == 0:
                                    from datetime import timedelta
                                    # Create a new safe date object (don't modify original cell if possible/needed)
                                    safe_date = cell_value + timedelta(hours=12)
                                    row_dict[key] = safe_date.strftime('%d/%m/%y')
                                    print(f"[DEBUG DATE] Original: {cell_value} -> Safe: {safe_date} -> Str: {row_dict[key]}")
                                else:
                                    # Already has time or is just date, just format
                                    row_dict[key] = cell_value.strftime('%d/%m/%y')
                            except Exception as e:
                                print(f"[DATE ERROR] Could not fix date {cell_value}: {e}")
                                row_dict[key] = str(cell_value)
                        else:
                            row_dict[key] = cell_value
                        
                        if str(cell_value).strip():
                            has_useful_data = True
            
            if has_useful_data:
                parsed_rows.append(row_dict)
                
        print(f"[XLSX] Filas de datos extraídas: {len(parsed_rows)}")
        return parsed_rows

    except Exception as e:
        print(f"[XLSX Error] {str(e)}")
        # Relanzar para que el endpoint lo capture
        raise ValueError(f"Error procesando Excel: {str(e)}")


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
