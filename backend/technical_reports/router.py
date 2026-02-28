"""
Endpoints API REST para Informes Técnicos
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, BackgroundTasks  # pyre-ignore[21]
from fastapi.responses import FileResponse, StreamingResponse  # pyre-ignore[21]
from typing import Optional, List, Dict, Any, cast
import io
import csv
import os
import json
import traceback
import re
import unicodedata
from datetime import datetime

# Para XLSX
try:
    import openpyxl  # pyre-ignore[21]
    XLSX_SUPPORTED = True
except ImportError:
    XLSX_SUPPORTED = False
    print("[TechReports] openpyxl not installed - XLSX support disabled")

from .database import db  # pyre-ignore[21]
from .models import TechnicalReport  # pyre-ignore[21]

router = APIRouter(prefix="/api/technical-reports", tags=["technical-reports"])


def normalize_header_value(value: str) -> str:
    """Normaliza headers para comparación con mapeos (sin acentos ni separadores)."""
    if not value:
        return ""
    text = str(value).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[\s_\.:\-°]+", "", text)


def normalize_csv_key(value: str) -> str:
    """Normaliza headers de CSV a claves seguras con guiones bajos."""
    if not value:
        return ""
    text = str(value).strip().lower().replace("\ufeff", "")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


# Mapeo de meses para sincronización de fechas desde Excel
MESES = {
    1: 'ENERO', 2: 'FEBRERO', 3: 'MARZO', 4: 'ABRIL',
    5: 'MAYO', 6: 'JUNIO', 7: 'JULIO', 8: 'AGOSTO',
    9: 'SEPTIEMBRE', 10: 'OCTUBRE', 11: 'NOVIEMBRE', 12: 'DICIEMBRE'
}


def _resolve_mes(val) -> str:
    """Convierte valor de mes a nombre español. Maneja int, float, str numérico y nombre directo."""
    if val is None:
        return 'Enero'
    if isinstance(val, str):
        stripped = val.strip()
        if not stripped:
            return 'Enero'
        try:
            num = int(float(stripped))
            if 1 <= num <= 12:
                return MESES[num]
        except (ValueError, TypeError):
            pass
        return stripped
    try:
        num = int(float(val))
        if 1 <= num <= 12:
            return MESES[num]
    except (ValueError, TypeError):
        pass
    return str(val)


# 1. Definir Mapeo de Columnas (Humano -> Sistema)
# IMPORTANTE: Las claves (izquierda) deben estar "NORMALIZADAS":
# - Todo minúsculas
# - SIN espacios
# - SIN guiones bajos (_) ni puntos (.)
# - SIN paréntesis ni comillas
# FUENTE ÚNICA DE VERDAD: usado tanto por CSV como por XLSX
COLUMN_MAPPING = {
    # Identificadores
    'nroinforme': 'informe_id',
    'numeroinforme': 'informe_id',
    'informeid': 'informe_id',
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
    'tuberiadescarga': 'descarga',

    # --- MEDIDAS ---
    'medidasdiametro': 'medidas_diametro',
    'diametro': 'medidas_diametro',
    'diametrom': 'medidas_diametro',
    'medidasdiametrointerno': 'medidas_diametro_interno',
    'diametrointerno': 'medidas_diametro_interno',
    'diametrointernom': 'medidas_diametro_interno',
    'medidasalturautil': 'medidas_altura_util',
    'alturautil': 'medidas_altura_util',
    'alturautilm': 'medidas_altura_util',
    'medidasalturatotal': 'medidas_altura_total',
    'alturatotal': 'medidas_altura_total',
    'alturatotalm': 'medidas_altura_total',

    # --- INSPECCIÓN (OBSERVACIONES Y SUGERENCIAS) ---
    'obscajaregistro': 'obs_caja_registro',
    'observacionescajaregistro': 'obs_caja_registro',
    'observacionescajaderegistro': 'obs_caja_registro',
    'sugcajaregistro': 'sug_caja_registro',
    'sugerenciascajaregistro': 'sug_caja_registro',
    'sugerenciascajaderegistro': 'sug_caja_registro',

    'obsmarcotapa': 'obs_marco_tapa',
    'observacionesmarcotapa': 'obs_marco_tapa',
    'observacionesmarcoytapa': 'obs_marco_tapa',
    'observacionesmarcoytapasanitaria': 'obs_marco_tapa',
    'sugmarcotapa': 'sug_marco_tapa',
    'sugerenciasmarcotapa': 'sug_marco_tapa',
    'sugerenciasmarcoytapa': 'sug_marco_tapa',
    'sugerenciasmarcoytapasanitaria': 'sug_marco_tapa',

    'obsescalerainterior': 'obs_escalera_int',
    'observacionesescalerainterior': 'obs_escalera_int',
    'obsescaleraint': 'obs_escalera_int',
    'sugescalerainterior': 'sug_escalera_int',
    'sugerenciasescalerainterior': 'sug_escalera_int',
    'sugescaleraint': 'sug_escalera_int',

    'obsescaleraexterior': 'obs_escalera_ext',
    'observacionesescaleraexterior': 'obs_escalera_ext',
    'obsescaleraext': 'obs_escalera_ext',
    'sugescaleraexterior': 'sug_escalera_ext',
    'sugerenciasescaleraexterior': 'sug_escalera_ext',
    'sugescaleraext': 'sug_escalera_ext',

    'obscubainterior': 'obs_cuba_int',
    'observacionescubainterior': 'obs_cuba_int',
    'obscubaint': 'obs_cuba_int',
    'sugcubainterior': 'sug_cuba_int',
    'sugerenciascubainterior': 'sug_cuba_int',
    'sugcubaint': 'sug_cuba_int',

    'obscubaexterior': 'obs_cuba_ext',
    'observacionescubaexterior': 'obs_cuba_ext',
    'obscubaext': 'obs_cuba_ext',
    'sugcubaexterior': 'sug_cuba_ext',
    'sugerenciascubaexterior': 'sug_cuba_ext',
    'sugcubaext': 'sug_cuba_ext',

    'obslozafondo': 'obs_loza_fondo',
    'observacioneslozafondo': 'obs_loza_fondo',
    'observacioneslozadefondo': 'obs_loza_fondo',
    'suglozafondo': 'sug_loza_fondo',
    'sugerenciaslozafondo': 'sug_loza_fondo',
    'sugerenciaslozadefondo': 'sug_loza_fondo',

    'obslozatechoint': 'obs_loza_techo_int',
    'obslozatechointerior': 'obs_loza_techo_int',
    'observacioneslozatechointerior': 'obs_loza_techo_int',
    'suglozatechoint': 'sug_loza_techo_int',
    'suglozatechointerior': 'sug_loza_techo_int',
    'sugerenciaslozatechointerior': 'sug_loza_techo_int',

    'obslozatechoext': 'obs_loza_techo_ext',
    'obslozatechoexterior': 'obs_loza_techo_ext',
    'observacioneslozatechoexterior': 'obs_loza_techo_ext',
    'suglozatechoext': 'sug_loza_techo_ext',
    'suglozatechoexterior': 'sug_loza_techo_ext',
    'sugerenciaslozatechoexterior': 'sug_loza_techo_ext',

    'obsductoventilacion': 'obs_ducto',
    'observacionesductoventilacion': 'obs_ducto',
    'observacionesductodeventilacion': 'obs_ducto',
    'obsducto': 'obs_ducto',
    'sugductoventilacion': 'sug_ducto',
    'sugerenciasductoventilacion': 'sug_ducto',
    'sugerenciasductodeventilacion': 'sug_ducto',
    'sugducto': 'sug_ducto',

    'obscercoperimetrico': 'obs_cerco',
    'observacionescercoperimetrico': 'obs_cerco',
    'obscerco': 'obs_cerco',
    'sugcercoperimetrico': 'sug_cerco',
    'sugerenciascercoperimetrico': 'sug_cerco',
    'sugcerco': 'sug_cerco',

    'obsdescarga': 'obs_descarga',
    'observacionesdescarga': 'obs_descarga',
    'observacionestuberiadescarga': 'obs_descarga',
    'sugdescarga': 'sug_descarga',
    'sugerenciasdescarga': 'sug_descarga',
    'sugerenciastuberiadescarga': 'sug_descarga',
    
    # --- VÁLVULAS (CONDUCCIÓN) ---
    'valvulasconduccion2': 'valvulas_conduccion_2',
    'valvulasconduccion3': 'valvulas_conduccion_3',
    'valvulasconduccion4': 'valvulas_conduccion_4',
    'valvulasconduccion6': 'valvulas_conduccion_6',
    'valvulasconduccion8': 'valvulas_conduccion_8',
    'valvulasconduccion10': 'valvulas_conduccion_10',
    'valvulasconduccion12': 'valvulas_conduccion_12',
    'valvconduccion2': 'valvulas_conduccion_2',
    'valvconduccion3': 'valvulas_conduccion_3',
    'valvconduccion4': 'valvulas_conduccion_4',
    'valvconduccion6': 'valvulas_conduccion_6',
    'valvconduccion8': 'valvulas_conduccion_8',
    'valvconduccion10': 'valvulas_conduccion_10',
    'valvconduccion12': 'valvulas_conduccion_12',
    'valvcond2': 'valvulas_conduccion_2',
    'valvcond3': 'valvulas_conduccion_3',
    'valvcond4': 'valvulas_conduccion_4',
    'valvcond6': 'valvulas_conduccion_6',
    'valvcond8': 'valvulas_conduccion_8',
    'valvcond10': 'valvulas_conduccion_10',
    'valvcond12': 'valvulas_conduccion_12',
    
    # --- VÁLVULAS (IMPULSIÓN) ---
    'valvulasimpulsion2': 'valvulas_impulsion_2',
    'valvulasimpulsion3': 'valvulas_impulsion_3',
    'valvulasimpulsion4': 'valvulas_impulsion_4',
    'valvulasimpulsion6': 'valvulas_impulsion_6',
    'valvulasimpulsion8': 'valvulas_impulsion_8',
    'valvulasimpulsion10': 'valvulas_impulsion_10',
    'valvulasimpulsion12': 'valvulas_impulsion_12',
    'valvimpulsion2': 'valvulas_impulsion_2',
    'valvimpulsion3': 'valvulas_impulsion_3',
    'valvimpulsion4': 'valvulas_impulsion_4',
    'valvimpulsion6': 'valvulas_impulsion_6',
    'valvimpulsion8': 'valvulas_impulsion_8',
    'valvimpulsion10': 'valvulas_impulsion_10',
    'valvimpulsion12': 'valvulas_impulsion_12',
    'valvimp2': 'valvulas_impulsion_2',
    'valvimp3': 'valvulas_impulsion_3',
    'valvimp4': 'valvulas_impulsion_4',
    'valvimp6': 'valvulas_impulsion_6',
    'valvimp8': 'valvulas_impulsion_8',
    'valvimp10': 'valvulas_impulsion_10',
    'valvimp12': 'valvulas_impulsion_12',
    
    # --- VÁLVULAS (ADUCCIÓN) ---
    'valvulasaduccion2': 'valvulas_aduccion_2',
    'valvulasaduccion3': 'valvulas_aduccion_3',
    'valvulasaduccion4': 'valvulas_aduccion_4',
    'valvulasaduccion6': 'valvulas_aduccion_6',
    'valvulasaduccion8': 'valvulas_aduccion_8',
    'valvulasaduccion10': 'valvulas_aduccion_10',
    'valvulasaduccion12': 'valvulas_aduccion_12',
    'valvaduccion2': 'valvulas_aduccion_2',
    'valvaduccion3': 'valvulas_aduccion_3',
    'valvaduccion4': 'valvulas_aduccion_4',
    'valvaduccion6': 'valvulas_aduccion_6',
    'valvaduccion8': 'valvulas_aduccion_8',
    'valvaduccion10': 'valvulas_aduccion_10',
    'valvaduccion12': 'valvulas_aduccion_12',
    
    # --- VÁLVULAS (BYPASS) ---
    'valvulasbypass2': 'valvulas_bypass_2',
    'valvulasbypass3': 'valvulas_bypass_3',
    'valvulasbypass4': 'valvulas_bypass_4',
    'valvulasbypass6': 'valvulas_bypass_6',
    'valvulasbypass8': 'valvulas_bypass_8',
    'valvulasbypass10': 'valvulas_bypass_10',
    'valvulasbypass12': 'valvulas_bypass_12',
    'valvbypass2': 'valvulas_bypass_2',
    'valvbypass3': 'valvulas_bypass_3',
    'valvbypass4': 'valvulas_bypass_4',
    'valvbypass6': 'valvulas_bypass_6',
    'valvbypass8': 'valvulas_bypass_8',
    'valvbypass10': 'valvulas_bypass_10',
    'valvbypass12': 'valvulas_bypass_12',
    
    # --- VÁLVULAS (DESAGÜE) ---
    'valvulasdesague2': 'valvulas_desague_2',
    'valvulasdesague3': 'valvulas_desague_3',
    'valvulasdesague4': 'valvulas_desague_4',
    'valvulasdesague6': 'valvulas_desague_6',
    'valvulasdesague8': 'valvulas_desague_8',
    'valvulasdesague10': 'valvulas_desague_10',
    'valvulasdesague12': 'valvulas_desague_12',
    'valvdesague2': 'valvulas_desague_2',
    'valvdesague3': 'valvulas_desague_3',
    'valvdesague4': 'valvulas_desague_4',
    'valvdesague6': 'valvulas_desague_6',
    'valvdesague8': 'valvulas_desague_8',
    'valvdesague10': 'valvulas_desague_10',
    'valvdesague12': 'valvulas_desague_12',
    
    # --- VÁLVULAS (OBSERVACIONES Y SUGERENCIAS) ---
    'obsvalvulasconduccion': 'obs_valvulas_conduccion',
    'observacionesconduccion': 'obs_valvulas_conduccion',
    'observacionesvalvulasconduccion': 'obs_valvulas_conduccion',
    'sugvalvulasconduccion': 'sug_valvulas_conduccion',
    'sugerenciasconduccion': 'sug_valvulas_conduccion',
    'sugerenciasvalvulasconduccion': 'sug_valvulas_conduccion',

    'obsvalvulasimpulsion': 'obs_valvulas_impulsion',
    'observacionesimpulsion': 'obs_valvulas_impulsion',
    'observacionesvalvulasimpulsion': 'obs_valvulas_impulsion',
    'sugvalvulasimpulsion': 'sug_valvulas_impulsion',
    'sugerenciasimpulsion': 'sug_valvulas_impulsion',
    'sugerenciasvalvulasimpulsion': 'sug_valvulas_impulsion',

    'obsvalvulasaduccion': 'obs_valvulas_aduccion',
    'observacionesaduccion': 'obs_valvulas_aduccion',
    'observacionesvalvulasaduccion': 'obs_valvulas_aduccion',
    'sugvalvulasaduccion': 'sug_valvulas_aduccion',
    'sugerenciasaduccion': 'sug_valvulas_aduccion',
    'sugerenciasvalvulasaduccion': 'sug_valvulas_aduccion',

    'obsvalvulasbypass': 'obs_valvulas_bypass',
    'observacionesbypass': 'obs_valvulas_bypass',
    'observacionesvalvulasbypass': 'obs_valvulas_bypass',
    'observacionespass': 'obs_valvulas_bypass',
    'sugvalvulasbypass': 'sug_valvulas_bypass',
    'sugerenciasbypass': 'sug_valvulas_bypass',
    'sugerenciasvalvulasbypass': 'sug_valvulas_bypass',

    'obsvalvulasdesague': 'obs_valvulas_desague',
    'observacionesdesague': 'obs_valvulas_desague',
    'observacionesvalvulasdesague': 'obs_valvulas_desague',
    'sugvalvulasdesague': 'sug_valvulas_desague',
    'sugerenciasdesague': 'sug_valvulas_desague',
    'sugerenciasvalvulasdesague': 'sug_valvulas_desague',
    
    # --- CANASTILLAS ---
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

    # --- CANASTILLAS (OBSERVACIONES Y SUGERENCIAS) ---
    'obscanastillasaduccion': 'obs_canastillas_aduccion',
    'observacionescanastillaaduccion': 'obs_canastillas_aduccion',
    'observacionescanastillasaduccion': 'obs_canastillas_aduccion',
    'sugcanastillasaduccion': 'sug_canastillas_aduccion',
    'sugerenciascanastillaaduccion': 'sug_canastillas_aduccion',
    'sugerenciascanastillasaduccion': 'sug_canastillas_aduccion',

    'obscanastillassuccion': 'obs_canastillas_succion',
    'observacionescanastillasuccion': 'obs_canastillas_succion',
    'observacionescanastillassuccion': 'obs_canastillas_succion',
    'observacionessuccion': 'obs_canastillas_succion',
    'sugcanastillassuccion': 'sug_canastillas_succion',
    'sugerenciascanastillasuccion': 'sug_canastillas_succion',
    'sugerenciascanastillassuccion': 'sug_canastillas_succion',
    'sugerenciassuccion': 'sug_canastillas_succion',

    'obscanastillasdesague': 'obs_canastillas_desague',
    'observacionescanastilladesague': 'obs_canastillas_desague',
    'observacionescanastillasdesague': 'obs_canastillas_desague',
    'sugcanastillasdesague': 'sug_canastillas_desague',
    'sugerenciascanastilladesague': 'sug_canastillas_desague',
    'sugerenciascanastillasdesague': 'sug_canastillas_desague',

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


VARIABLE_CATEGORY_ORDER = [
    'Identificadores',
    'Infraestructura',
    'Inspeccion',
    'Medidas',
    'Valvulas',
    'Canastillas',
    'Observaciones',
    'Sugerencias',
    'Generales',
    'Otros',
]
VARIABLE_CATEGORY_RANK = {category: idx for idx, category in enumerate(VARIABLE_CATEGORY_ORDER)}

IDENTIFIER_VARIABLES = {'informe_id', 'dia', 'mes', 'anio', 'pagina'}
INFRASTRUCTURE_VARIABLES = {
    'cs',
    'contratista',
    'codigo_infraestructura',
    'ubicacion',
    'suministro',
    'tipo',
    'volumen',
}
INSPECTION_VARIABLES = {
    'caja_registro',
    'marco_tapa',
    'escalera_interior',
    'escalera_exterior',
    'cuba_interior',
    'cuba_exterior',
    'loza_fondo',
    'loza_techo_interior',
    'loza_techo_exterior',
    'ducto_ventilacion',
    'cerco_perimetrico',
    'descarga',
}

VARIABLE_LABEL_OVERRIDES = {
    'informe_id': 'Nro. Informe',
    'cs': 'Centro de Servicio',
    'codigo_infraestructura': 'Codigo Infraestructura',
    'caja_registro': 'Caja de Registro',
    'marco_tapa': 'Marco y Tapa',
    'observaciones': 'Observaciones Generales',
    'sugerencias': 'Sugerencias Generales',
}


def _humanize_variable_label(key: str) -> str:
    """Convierte una clave tecnica en etiqueta legible."""
    if key in VARIABLE_LABEL_OVERRIDES:
        return VARIABLE_LABEL_OVERRIDES[key]

    if key.startswith('obs_'):
        return f"Obs. {_humanize_variable_label(key[4:])}"  # pyre-ignore[6, 16]

    if key.startswith('sug_'):
        return f"Sug. {_humanize_variable_label(key[4:])}"  # pyre-ignore[6, 16]

    words = []
    for token in key.split('_'):
        if not token:
            continue
        if token.isdigit():
            words.append(token)
        elif token in {'id', 'cs', 'ot', 'nis'}:
            words.append(token.upper())
        elif token == 'anio':
            words.append('Anio')
        else:
            words.append(token.capitalize())
    return " ".join(words) if words else key


def _variable_category(key: str) -> str:
    if key in IDENTIFIER_VARIABLES:
        return 'Identificadores'
    if key in INFRASTRUCTURE_VARIABLES:
        return 'Infraestructura'
    if key in INSPECTION_VARIABLES:
        return 'Inspeccion'
    if key.startswith('medidas_'):
        return 'Medidas'
    if key.startswith('valvulas_'):
        return 'Valvulas'
    if key.startswith('canastillas_'):
        return 'Canastillas'
    if key.startswith('obs_'):
        return 'Observaciones'
    if key.startswith('sug_'):
        return 'Sugerencias'
    if key in {'observaciones', 'sugerencias'}:
        return 'Generales'
    return 'Otros'


def build_variables_catalog() -> List[Dict[str, str]]:
    """Construye el catalogo de variables dinamicas a partir de COLUMN_MAPPING."""
    unique_keys = sorted(set(COLUMN_MAPPING.values()))
    items = [
        {
            "key": key,
            "label": _humanize_variable_label(key),
            "category": _variable_category(key),
        }
        for key in unique_keys
    ]
    items.sort(
        key=lambda item: (
            VARIABLE_CATEGORY_RANK.get(item["category"], 999),
            item["label"].lower(),
            item["key"],
        )
    )
    return items


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

        # Verificar si el parsing fue exitoso (más de 1 columna indica que ; es el delimitador correcto)
        if temp_rows and len(temp_rows[0].keys()) > 1:
            rows = temp_rows
            print(f"[CSV Parser] Parsed with semicolon delimiter: {len(rows)} rows, {len(rows[0].keys())} columns")
        else:
            raise ValueError("Too few columns with semicolon")
    except Exception:
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
                normalized_key = normalize_header_value(k)
                if normalized_key in COLUMN_MAPPING:
                    clean_key = COLUMN_MAPPING[normalized_key]
                elif "fechacorte" in normalized_key:
                    clean_key = "FECHA CORTE"
                else:
                    clean_key = normalize_csv_key(k)

                if clean_key:
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

    # Usa el COLUMN_MAPPING del módulo (fuente única de verdad)

    # Lista de columnas CLAVE para identificar la fila de headers
    # Si una fila tiene al menos una de estas, es candidata a ser header
    HEADER_CANDIDATES = ['informe', 'id', 'cs', 'centro servicio', 'contratista', 'codigo']

    def normalize_str(s: str) -> str:
        """Limpia string para facilitar comparaciones (minusculas, sin espacios, sin acentos)."""
        return normalize_header_value(s)

    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet = workbook.active
        all_rows = list(sheet.iter_rows(values_only=True))
        
        print(f"[XLSX] Total filas leídas: {len(all_rows)}")
        
        headers: list = []  # Lista final de claves mapeadas
        header_row_index: int = -1

        # 2. Buscar fila de headers (Escaneo profundo primeras 30 filas)
        for idx, row in enumerate(all_rows[:30]):  # pyre-ignore[16]
            if not row: continue
            
            # Convertir fila a versiones normalizadas
            row_normalized = [normalize_str(cell) for cell in row]
            
            # Chequear si parece un header
            # Criterio: Contiene al menos 2 columnas clave conocidas (ej. 'informe' y 'cs')
            matches: int = 0
            for val in row_normalized:
                for key in COLUMN_MAPPING.keys():
                    if key in val:  # 'nroinforme' in 'nroinformexxx'
                        matches += 1  # pyre-ignore[58]
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
                                clean_prop = original_val.lower().replace(' ', '_').replace('.', '')  # pyre-ignore[16]
                                found_key = clean_prop

                    headers.append(str(found_key))  # pyre-ignore[6]

                print(f"[XLSX] Headers mapeados (primeros 5): {headers[:5]}")  # pyre-ignore[16]
                break
        
        if header_row_index == -1:
             raise ValueError("No se pudo detectar la fila de encabezados. Asegúrate de incluir columnas como 'Nro Informe', 'CS', 'Contratista'.")

        # 3. Extraer Datos
        parsed_rows = []
        for row in all_rows[header_row_index + 1:]:  # pyre-ignore[16]
            if not any(row): continue # Saltar filas totalmente vacias
            
            row_dict = {}
            has_useful_data = False
            
            for col_idx, cell_value in enumerate(row):
                if col_idx < len(headers):
                    key = headers[col_idx]
                    # Ignorar columnas no mapeadas o vacias
                    if not key.startswith("_col_") and cell_value is not None:
                        # Handle datetime/date objects: extract components for dia/mes/anio
                        if hasattr(cell_value, 'strftime'):
                            try:
                                if key == 'dia':
                                    row_dict[key] = cell_value.day
                                elif key == 'mes':
                                    row_dict[key] = MESES.get(cell_value.month, str(cell_value.month))
                                elif key == 'anio':
                                    row_dict[key] = cell_value.year
                                else:
                                    row_dict[key] = cell_value.strftime('%d/%m/%y')
                            except Exception as e:
                                print(f"[DATE ERROR] Could not format date {cell_value}: {e}")
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


def transform_flat_to_nested(flat_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transforma un diccionario plano (del Excel/CSV) a la estructura anidada
    esperada por el modelo TechnicalReport de Pydantic.
    
    Ejemplo:
        Input:  {'medidas_diametro': '2.5', 'valvulas_conduccion_2': 3, ...}
        Output: {'medidas': {'diametro': '2.5'}, 'valvulas': {'diametros': {'2': 3}}, ...}
    """
    
    def safe_int(val, default=0):
        """Convierte a entero de forma segura"""
        if val is None or val == '':
            return default
        try:
            return int(float(str(val)))
        except (ValueError, TypeError):
            return default
    
    def safe_str(val, default=""):
        """Convierte a string de forma segura"""
        if val is None:
            return default
        return str(val).strip()
    
    def normalize_status(val) -> str:
        """
        Normaliza valores de estado de inspección.
        Unificado con _parse_check() de database.py para consistencia.
        Case-insensitive.
        """
        if val is None:
            return 'unchecked'
        val_str = str(val).strip().upper()
        
        if val_str == '' or val_str == 'NONE':
            return 'unchecked'
        
        # Estados "normales" - Lista completa unificada
        normal_values = [
            'X', 'NORMAL', 'BUENO', 'OK', 'SI', 'SÍ', 'V',  # De _parse_check
            'BIEN', 'B', 'N', 'BUEN ESTADO'  # Adicionales
        ]
        if val_str in normal_values:
            return 'normal'
        
        # Estados "críticos" - Lista completa unificada
        critico_values = [
            'CRITICO', 'CRÍTICO', 'MALO', 'OBSERVADO', 'F', 'NO',  # De _parse_check
            'MAL', 'C', 'M', 'DEFICIENTE', 'DAÑADO'  # Adicionales
        ]
        if val_str in critico_values:
            return 'critico'
        
        # Default
        return 'unchecked'
    
    result = {}
    
    # =====================
    # 1. METADATA
    # =====================
    result['metadata'] = {
        'informe_id': safe_int(flat_data.get('informe_id', 0)),
        'dia': safe_int(flat_data.get('dia', 1)),
        'mes': _resolve_mes(flat_data.get('mes', 'Enero')),
        'anio': safe_int(flat_data.get('anio', 2024)),
        'pagina': safe_str(flat_data.get('pagina', '1 de 2'))
    }
    
    # =====================
    # 2. HEADER
    # =====================
    # Mapear tipo a valores válidos del Literal
    tipo_raw = safe_str(flat_data.get('tipo', 'ELEVADO')).upper()
    valid_tipos = ['ELEVADO', 'ENTERRADO', 'SEMIENTERRADO', 'APOYADO', 'CISTERNA']
    tipo = tipo_raw if tipo_raw in valid_tipos else 'ELEVADO'
    
    result['header'] = {
        'cs': safe_str(flat_data.get('cs', '')),
        'contratista': safe_str(flat_data.get('contratista', '')),
        'codigo_infraestructura': safe_str(flat_data.get('codigo_infraestructura', '')),
        'ubicacion': safe_str(flat_data.get('ubicacion', '')),
        'suministro': safe_str(flat_data.get('suministro', '')),
        'tipo': tipo,
        'volumen': safe_int(flat_data.get('volumen', 0))
    }
    
    # =====================
    # 3. MEDIDAS
    # =====================
    result['medidas'] = {
        'diametro': safe_str(flat_data.get('medidas_diametro', '')),
        'diametro_interno': safe_str(flat_data.get('medidas_diametro_interno', '')),
        'altura_util': safe_str(flat_data.get('medidas_altura_util', '')),
        'altura_total': safe_str(flat_data.get('medidas_altura_total', ''))
    }
    
    # =====================
    # 4. VÁLVULAS
    # =====================
    diametros_validos = ['2', '3', '4', '6', '8', '10', '12']
    
    # Inicializar estructura de válvulas
    valvulas = {
        'diametros': {d: 0 for d in diametros_validos},  # Conducción
        'impulsion': {d: 0 for d in diametros_validos},
        'aduccion': {d: 0 for d in diametros_validos},
        'bypass': {d: 0 for d in diametros_validos},
        'desague': {d: 0 for d in diametros_validos},
        'operativas': safe_int(flat_data.get('valvulas_operativas', 0)),
        'no_operativas': safe_int(flat_data.get('valvulas_no_operativas', 0)),
        'observaciones_conduccion': safe_str(flat_data.get('obs_valvulas_conduccion', '')),
        'sugerencias_conduccion': safe_str(flat_data.get('sug_valvulas_conduccion', '')),
        'observaciones_impulsion': safe_str(flat_data.get('obs_valvulas_impulsion', '')),
        'sugerencias_impulsion': safe_str(flat_data.get('sug_valvulas_impulsion', '')),
        'observaciones_aduccion': safe_str(flat_data.get('obs_valvulas_aduccion', '')),
        'sugerencias_aduccion': safe_str(flat_data.get('sug_valvulas_aduccion', '')),
        'observaciones_bypass': safe_str(flat_data.get('obs_valvulas_bypass', '')),
        'sugerencias_bypass': safe_str(flat_data.get('sug_valvulas_bypass', '')),
        'observaciones_desague': safe_str(flat_data.get('obs_valvulas_desague', '')),
        'sugerencias_desague': safe_str(flat_data.get('sug_valvulas_desague', ''))
    }
    
    # Mapear diámetros de válvulas desde claves planas
    valvula_tipos = {
        'conduccion': 'diametros',  # Conducción se llama 'diametros' en el modelo
        'impulsion': 'impulsion',
        'aduccion': 'aduccion',
        'bypass': 'bypass',
        'desague': 'desague'
    }
    
    for tipo_valvula, dict_name in valvula_tipos.items():
        for d in diametros_validos:
            key = f'valvulas_{tipo_valvula}_{d}'
            if key in flat_data:
                valvulas[dict_name][d] = safe_int(flat_data[key])  # pyre-ignore[6, 7, 16, 29]
    
    result['valvulas'] = valvulas
    
    # =====================
    # 5. CANASTILLAS
    # =====================
    diametros_canastillas = ['2', '3', '4', '6', '8', '10', '14']
    
    canastillas = {
        'diametros': {d: 0 for d in diametros_canastillas},  # Principal (si existe en el modelo)
        'aduccion': {d: 0 for d in diametros_canastillas},
        'succion': {d: 0 for d in diametros_canastillas},
        'desague': {d: 0 for d in diametros_canastillas},
        'operativas': safe_int(flat_data.get('canastillas_operativas', 0)),
        'no_operativas': safe_int(flat_data.get('canastillas_no_operativas', 0)),
        'observaciones_aduccion': safe_str(flat_data.get('obs_canastillas_aduccion', '')),
        'sugerencias_aduccion': safe_str(flat_data.get('sug_canastillas_aduccion', '')),
        'observaciones_succion': safe_str(flat_data.get('obs_canastillas_succion', '')),
        'sugerencias_succion': safe_str(flat_data.get('sug_canastillas_succion', '')),
        'observaciones_desague': safe_str(flat_data.get('obs_canastillas_desague', '')),
        'sugerencias_desague': safe_str(flat_data.get('sug_canastillas_desague', ''))
    }
    
    # Mapear diámetros de canastillas desde claves planas
    canastilla_tipos = ['aduccion', 'succion', 'desague']
    
    for tipo_can in canastilla_tipos:
        for d in diametros_canastillas:
            key = f'canastillas_{tipo_can}_{d}'
            if key in flat_data:
                canastillas[tipo_can][d] = safe_int(flat_data[key])  # pyre-ignore[6, 7, 16, 29]
    
    result['canastillas'] = canastillas
    
    # =====================
    # 6. INSPECCIÓN
    # =====================
    # Campos de estado (12 elementos)
    inspeccion_estados = [
        'caja_registro', 'marco_tapa', 'escalera_interior', 'escalera_exterior',
        'cuba_interior', 'cuba_exterior', 'loza_fondo', 'loza_techo_interior',
        'loza_techo_exterior', 'ducto_ventilacion', 'cerco_perimetrico', 'descarga'
    ]
    
    inspeccion = {}
    
    # Estados normalizados
    for estado in inspeccion_estados:
        inspeccion[estado] = normalize_status(flat_data.get(estado))
    
    # Observaciones y sugerencias de inspección
    # Tupla: (flat_data_obs_key, flat_data_sug_key, model_obs_field, model_sug_field)
    # Los nombres de campo del modelo usan abreviaturas (_int, _ext, _ducto, _cerco)
    # mientras que los estados usan nombres completos (_interior, _exterior, etc.)
    obs_sug_mapping = {
        'caja_registro': ('obs_caja_registro', 'sug_caja_registro', 'observaciones_caja_registro', 'sugerencias_caja_registro'),
        'marco_tapa': ('obs_marco_tapa', 'sug_marco_tapa', 'observaciones_marco_tapa', 'sugerencias_marco_tapa'),
        'escalera_interior': ('obs_escalera_int', 'sug_escalera_int', 'observaciones_escalera_int', 'sugerencias_escalera_int'),
        'escalera_exterior': ('obs_escalera_ext', 'sug_escalera_ext', 'observaciones_escalera_ext', 'sugerencias_escalera_ext'),
        'cuba_interior': ('obs_cuba_int', 'sug_cuba_int', 'observaciones_cuba_int', 'sugerencias_cuba_int'),
        'cuba_exterior': ('obs_cuba_ext', 'sug_cuba_ext', 'observaciones_cuba_ext', 'sugerencias_cuba_ext'),
        'loza_fondo': ('obs_loza_fondo', 'sug_loza_fondo', 'observaciones_loza_fondo', 'sugerencias_loza_fondo'),
        'loza_techo_interior': ('obs_loza_techo_int', 'sug_loza_techo_int', 'observaciones_loza_techo_int', 'sugerencias_loza_techo_int'),
        'loza_techo_exterior': ('obs_loza_techo_ext', 'sug_loza_techo_ext', 'observaciones_loza_techo_ext', 'sugerencias_loza_techo_ext'),
        'ducto_ventilacion': ('obs_ducto', 'sug_ducto', 'observaciones_ducto', 'sugerencias_ducto'),
        'cerco_perimetrico': ('obs_cerco', 'sug_cerco', 'observaciones_cerco', 'sugerencias_cerco'),
        'descarga': ('obs_descarga', 'sug_descarga', 'observaciones_descarga', 'sugerencias_descarga')
    }

    for estado in inspeccion_estados:
        if estado in obs_sug_mapping:
            obs_key, sug_key, obs_field, sug_field = obs_sug_mapping[estado]
            inspeccion[obs_field] = safe_str(flat_data.get(obs_key, ''))
            inspeccion[sug_field] = safe_str(flat_data.get(sug_key, ''))
    
    result['inspeccion'] = inspeccion  # pyre-ignore[6, 7, 26, 29]

    # =====================
    # 7. CAMPOS GENERALES
    # =====================
    result['observaciones'] = safe_str(flat_data.get('observaciones', ''))  # pyre-ignore[6, 7, 26, 29]
    result['sugerencias'] = safe_str(flat_data.get('sugerencias', ''))  # pyre-ignore[6, 7, 26, 29]
    result['status'] = 'draft'  # pyre-ignore[6, 7, 26, 29]
    result['last_modified'] = datetime.now().isoformat()  # pyre-ignore[6, 7, 26, 29]

    # Generar ID único
    informe_id = result['metadata']['informe_id']  # pyre-ignore[6, 7, 16, 29]
    result['id'] = f"report_{informe_id}" if int(informe_id) > 0 else f"report_{datetime.now().strftime('%Y%m%d%H%M%S')}"  # pyre-ignore[6, 7, 26, 29]
    
    # =====================
    # 8. CAMPOS EXTRA (para report_volanteo y otros templates)
    # =====================
    # Preservar cualquier campo extra que venga del Excel pero no esté mapeado
    extra_fields = ['FECHA CORTE', 'CENTRO', 'NIS', 'SECTOR', 'DIRECCION', 'OT']
    for field in extra_fields:
        if field in flat_data:
            result[field] = flat_data[field]
    
    return result


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


@router.get("/variables")
async def get_template_variables():
    """Lista de variables disponibles para el editor de plantillas."""
    return build_variables_catalog()


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

@router.delete("/clear-all-reports")
async def delete_all_reports():
    """Eliminar TODOS los informes"""
    count = db.clear_all_reports()
    return {"success": True, "deleted_count": count, "message": f"Se eliminaron {count} informes"}


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
            rows = parse_csv_file(cast(bytes, content))
        elif filename.endswith('.xlsx'):
            rows = parse_xlsx_file(cast(bytes, content))
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
        
        # TRANSFORMAR: Convertir datos planos a estructura anidada
        transformed_rows = []
        for row in rows:
            try:
                nested_row = transform_flat_to_nested(row)
                transformed_rows.append(nested_row)
            except Exception as e:
                print(f"[WARN] Error transformando fila: {e}. Usando datos planos.")
                transformed_rows.append(row)  # Fallback a datos originales
        
        print(f"[DEBUG] Filas transformadas: {len(transformed_rows)}")
        
        # Importar (esto elimina los existentes y agrega los nuevos)
        imported_reports = db.import_from_csv(transformed_rows, clear_existing=True)
        
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


@router.post("/generate-consolidated-pdf")
async def generate_consolidated_pdf(
    background_tasks: BackgroundTasks,
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    report_ids: Optional[str] = Form(None),  # JSON array of IDs or None for all
):
    """
    Genera un PDF consolidado con todos los informes técnicos.
    Si report_ids es None, incluye todos los informes.
    """
    import tempfile
    import base64
    from jinja2 import Environment, FileSystemLoader  # pyre-ignore[21]

    try:
        # Obtener reportes
        all_reports = db.get_all_reports()

        if not all_reports:
            raise HTTPException(status_code=400, detail="No hay informes para exportar")

        # Filtrar por IDs si se especificaron
        if report_ids:
            try:
                ids_list = json.loads(report_ids)
                all_reports = [r for r in all_reports if r.id in ids_list]
            except (json.JSONDecodeError, TypeError):
                pass  # Usar todos si hay error en el parsing

        print(f"[PDF Consolidado] Generando PDF con {len(all_reports)} informes...")

        # Procesar logos
        async def process_logo(logo_file):
            if not logo_file:
                return None
            content = await logo_file.read()
            encoded = base64.b64encode(content).decode("utf-8")
            mime = "image/png" if logo_file.filename.lower().endswith(".png") else "image/jpeg"
            return f"data:{mime};base64,{encoded}"

        logo_left_b64 = await process_logo(logoLeft)
        logo_right_b64 = await process_logo(logoRight)

        # Cargar template
        templates_dir = os.path.join(os.path.dirname(__file__), "templates")
        env = Environment(loader=FileSystemLoader(templates_dir))
        template = env.get_template("informe_tecnico.html")

        # =====================================================================
        # STREAMING OPTIMIZADO: Generar PDFs en lotes y merge incremental
        # =====================================================================
        from weasyprint import HTML  # pyre-ignore[21]
        from pypdf import PdfWriter  # pyre-ignore[21]
        from concurrent.futures import ThreadPoolExecutor
        import gc

        # Configuración de batching
        PDF_BATCH_SIZE = 5
        temp_pdf_files = []

        def render_single_pdf(report_data):
            """Renderiza un PDF individual a archivo temporal"""
            try:
                html_content = template.render(
                    report=report_data,
                    logo_left=logo_left_b64,
                    logo_right=logo_right_b64
                )

                # Generar PDF a archivo temporal (no en memoria)
                temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
                HTML(string=html_content, base_url=templates_dir).write_pdf(temp_pdf.name)
                temp_pdf.close()
                return temp_pdf.name
            except Exception as e:
                print(f"[PDF Consolidado] Error renderizando: {e}")
                return None

        # Generar PDFs en lotes paralelos
        for batch_start in range(0, len(all_reports), PDF_BATCH_SIZE):
            batch_end = min(batch_start + PDF_BATCH_SIZE, len(all_reports))
            batch_reports = all_reports[batch_start:batch_end]  # pyre-ignore[6, 16, 29]

            # Procesar lote en paralelo
            with ThreadPoolExecutor(max_workers=PDF_BATCH_SIZE) as executor:
                batch_dicts = [r.model_dump() for r in batch_reports]
                results = list(executor.map(render_single_pdf, batch_dicts))

                # Agregar PDFs válidos a la lista
                for pdf_path in results:
                    if pdf_path:
                        temp_pdf_files.append(pdf_path)

            print(f"[PDF Consolidado] Procesados {min(batch_end, len(all_reports))}/{len(all_reports)}")
            gc.collect()

        if not temp_pdf_files:
            raise HTTPException(status_code=500, detail="No se pudo generar ningún PDF")

        # Crear archivo final para streaming
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        temp_file.close()

        # ✅ STREAMING MERGE: Usar append para menor uso de memoria
        pdf_writer = PdfWriter()

        for pdf_path in temp_pdf_files:
            try:
                pdf_writer.append(pdf_path)
                os.remove(pdf_path)  # Eliminar temporal inmediatamente
            except Exception as e:
                print(f"[PDF Consolidado] Error en merge: {e}")
                try:
                    os.remove(pdf_path)
                except OSError:
                    pass

        # Escribir directamente al archivo final
        with open(temp_file.name, 'wb') as f:
            pdf_writer.write(f)

        pdf_writer.close()
        del pdf_writer
        gc.collect()

        # =====================================================================
        # Compresión Ghostscript (opcional)
        # =====================================================================
        from report_service import GHOSTSCRIPT_ENABLED, GHOSTSCRIPT_QUALITY, _compress_pdf_with_ghostscript  # pyre-ignore[21]

        if GHOSTSCRIPT_ENABLED and len(all_reports) > 1:
            print(f"[PDF Consolidado] Aplicando compresión Ghostscript...")
            success, _, stats = _compress_pdf_with_ghostscript(
                temp_file.name,
                quality=GHOSTSCRIPT_QUALITY
            )
            if success and "reduction_percent" in stats:
                print(f"[PDF Consolidado] Compresión: {stats['reduction_percent']}% reducción")

        print(f"[PDF Consolidado] ✅ Completado! {len(all_reports)} informes generados")

        # Cleanup task
        def cleanup_file(path: str):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception as e:
                print(f"Error removing temp file: {e}")

        background_tasks.add_task(cleanup_file, temp_file.name)

        return FileResponse(
            temp_file.name,
            media_type="application/pdf",
            filename=f"informes_tecnicos_consolidado_{len(all_reports)}.pdf"
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generando PDF consolidado: {str(e)}")


@router.post("/generate-consolidated-pdf-progress")
async def generate_consolidated_pdf_progress(
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    report_ids: Optional[str] = Form(None),
):
    """SSE version of generate-consolidated-pdf with real-time progress."""
    import asyncio
    import uuid
    import tempfile
    import base64
    from progress import format_sse_event  # type: ignore

    # Read logos before streaming starts
    logo_left_bytes = await logoLeft.read() if logoLeft else None
    logo_right_bytes = await logoRight.read() if logoRight else None
    logo_left_fname = (logoLeft.filename or "") if logoLeft else ""
    logo_right_fname = (logoRight.filename or "") if logoRight else ""

    async def event_generator():
        progress_queue: asyncio.Queue = asyncio.Queue()

        async def on_progress(phase: str, current: int, total: int, detail: str = ""):
            await progress_queue.put({"phase": phase, "current": current, "total": total, "detail": detail})

        async def run_generation():
            try:
                from jinja2 import Environment, FileSystemLoader  # pyre-ignore[21]
                from weasyprint import HTML  # pyre-ignore[21]
                from pypdf import PdfWriter  # pyre-ignore[21]
                from concurrent.futures import ThreadPoolExecutor
                from report_service import GHOSTSCRIPT_ENABLED, GHOSTSCRIPT_QUALITY, _compress_pdf_with_ghostscript  # pyre-ignore[21]
                import gc

                all_reports = db.get_all_reports()
                if not all_reports:
                    raise Exception("No hay informes para exportar")

                if report_ids:
                    try:
                        ids_list = json.loads(report_ids)
                        all_reports = [r for r in all_reports if r.id in ids_list]
                    except (json.JSONDecodeError, TypeError):
                        pass

                total = len(all_reports)
                await on_progress("preparing", 0, total, "")

                # Process logos
                def encode_logo(content, fname):
                    if not content:
                        return None
                    encoded = base64.b64encode(content).decode("utf-8")
                    mime = "image/png" if fname.lower().endswith(".png") else "image/jpeg"
                    return f"data:{mime};base64,{encoded}"

                logo_left_b64 = encode_logo(logo_left_bytes, logo_left_fname)
                logo_right_b64 = encode_logo(logo_right_bytes, logo_right_fname)

                templates_dir = os.path.join(os.path.dirname(__file__), "templates")
                env = Environment(loader=FileSystemLoader(templates_dir))
                template = env.get_template("informe_tecnico.html")

                PDF_BATCH_SIZE = 5
                temp_pdf_files = []

                def render_single_pdf(report_data):
                    try:
                        html_content = template.render(report=report_data, logo_left=logo_left_b64, logo_right=logo_right_b64)
                        temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
                        HTML(string=html_content, base_url=templates_dir).write_pdf(temp_pdf.name)
                        temp_pdf.close()
                        return temp_pdf.name
                    except Exception as e:
                        print(f"[PDF Consolidado] Error renderizando: {e}")
                        return None

                for batch_start in range(0, total, PDF_BATCH_SIZE):
                    batch_end = min(batch_start + PDF_BATCH_SIZE, total)
                    batch_reports = all_reports[batch_start:batch_end]
                    with ThreadPoolExecutor(max_workers=PDF_BATCH_SIZE) as executor:
                        results = list(executor.map(render_single_pdf, [r.model_dump() for r in batch_reports]))
                        temp_pdf_files.extend([p for p in results if p])
                    await on_progress("rendering", min(batch_end, total), total, "")
                    gc.collect()

                if not temp_pdf_files:
                    raise Exception("No se pudo generar ningún PDF")

                await on_progress("merging", 0, len(temp_pdf_files), "")

                filename = f"pdf_{uuid.uuid4().hex[:12]}.pdf"
                output_path = os.path.join(tempfile.gettempdir(), filename)

                pdf_writer = PdfWriter()
                for pdf_path in temp_pdf_files:
                    try:
                        pdf_writer.append(pdf_path)
                        os.remove(pdf_path)
                    except Exception:
                        try:
                            os.remove(pdf_path)
                        except OSError:
                            pass

                with open(output_path, 'wb') as f:
                    pdf_writer.write(f)
                pdf_writer.close()
                del pdf_writer
                gc.collect()

                if GHOSTSCRIPT_ENABLED and total > 1:
                    await on_progress("compressing", 0, 1, "")
                    _compress_pdf_with_ghostscript(output_path, quality=GHOSTSCRIPT_QUALITY)

                await progress_queue.put({"phase": "done", "download_url": f"/api/download-temp/{filename}"})
            except Exception as e:
                await progress_queue.put({"phase": "error", "detail": str(e)})
            finally:
                await progress_queue.put(None)

        asyncio.create_task(run_generation())

        while True:
            msg = await progress_queue.get()
            if msg is None:
                break
            phase = msg.get("phase", "")
            event = "done" if phase == "done" else "error" if phase == "error" else "progress"
            yield format_sse_event(msg, event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


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
