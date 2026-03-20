"""
# -*- coding: utf-8 -*-
Modelos Pydantic para Informes Técnicos
"""
from pydantic import BaseModel, model_validator
from typing import Any, Dict, Literal, Optional
from datetime import datetime

class ReportMetadata(BaseModel):
    informe_id: int
    dia: int
    mes: str
    anio: int
    pagina: str = "1 de 2"

class ReportHeader(BaseModel):
    cs: str
    contratista: str
    codigo_infraestructura: str
    ubicacion: str
    suministro: str
    tipo: Literal['ELEVADO', 'ENTERRADO', 'SEMIENTERRADO', 'APOYADO', 'CISTERNA']
    volumen: int

class InspeccionDescripcion(BaseModel):
    # Estados de inspección (12 elementos con estado Normal/Crítico)
    caja_registro: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    marco_tapa: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    escalera_interior: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    escalera_exterior: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    cuba_interior: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    cuba_exterior: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    loza_fondo: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    loza_techo_interior: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    loza_techo_exterior: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    ducto_ventilacion: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    cerco_perimetrico: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    descarga: Literal['normal', 'critico', 'unchecked'] = 'unchecked'
    # Observaciones/sugerencias por elemento de inspección
    observaciones_caja_registro: str = ""
    sugerencias_caja_registro: str = ""
    observaciones_marco_tapa: str = ""
    sugerencias_marco_tapa: str = ""
    observaciones_escalera_int: str = ""
    sugerencias_escalera_int: str = ""
    observaciones_escalera_ext: str = ""
    sugerencias_escalera_ext: str = ""
    observaciones_cuba_int: str = ""
    sugerencias_cuba_int: str = ""
    observaciones_cuba_ext: str = ""
    sugerencias_cuba_ext: str = ""
    observaciones_loza_fondo: str = ""
    sugerencias_loza_fondo: str = ""
    observaciones_loza_techo_int: str = ""
    sugerencias_loza_techo_int: str = ""
    observaciones_loza_techo_ext: str = ""
    sugerencias_loza_techo_ext: str = ""
    observaciones_ducto: str = ""
    sugerencias_ducto: str = ""
    observaciones_cerco: str = ""
    sugerencias_cerco: str = ""
    observaciones_descarga: str = ""
    sugerencias_descarga: str = ""

class ValvulasData(BaseModel):
    """Datos de válvulas - diámetros, conteo y observaciones"""
    diametros: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '12': 0}
    impulsion: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '12': 0}
    aduccion: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '12': 0}
    bypass: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '12': 0}
    desague: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '12': 0}
    operativas: int = 0
    no_operativas: int = 0
    # Observaciones y sugerencias por tipo de válvula
    observaciones_conduccion: str = ""
    sugerencias_conduccion: str = ""
    observaciones_impulsion: str = ""
    sugerencias_impulsion: str = ""
    observaciones_aduccion: str = ""
    sugerencias_aduccion: str = ""
    observaciones_bypass: str = ""
    sugerencias_bypass: str = ""
    observaciones_desague: str = ""
    sugerencias_desague: str = ""

class CanastillasData(BaseModel):
    """Datos de canastillas - diámetros, conteo y observaciones"""
    diametros: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '14': 0}
    aduccion: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '14': 0}
    succion: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '14': 0}
    desague: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '14': 0}
    operativas: int = 0
    no_operativas: int = 0
    # Observaciones y sugerencias
    observaciones_aduccion: str = ""
    sugerencias_aduccion: str = ""
    observaciones_succion: str = ""
    sugerencias_succion: str = ""
    observaciones_desague: str = ""
    sugerencias_desague: str = ""

class MedidasData(BaseModel):
    """Datos de medidas - solo valores"""
    diametro: str = ""
    diametro_interno: str = ""
    altura_util: str = ""
    altura_total: str = ""

class TechnicalReport(BaseModel):
    id: str
    metadata: ReportMetadata
    header: ReportHeader
    inspeccion: InspeccionDescripcion = InspeccionDescripcion()
    valvulas: ValvulasData = ValvulasData()
    canastillas: CanastillasData = CanastillasData()
    medidas: Optional[MedidasData] = None
    observaciones: str = ""
    sugerencias: str = ""
    status: Literal['draft', 'completed'] = 'draft'
    last_modified: str

    @model_validator(mode='before')
    @classmethod
    def patch_legacy_data(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normaliza datos legacy/incompletos ANTES de la validación de campos.
        Reemplaza el bloque MANUAL PATCHING que estaba en main.py.
        """
        # --- valvulas: asegurar que sea dict para que ValvulasData pueda instanciarse ---
        valvulas = values.get('valvulas')
        if not isinstance(valvulas, dict):
            values['valvulas'] = {}
        else:
            # impulsion: si falta, dejar que ValvulasData ponga su default;
            # solo asegurar que las keys de observaciones existan si hay datos parciales
            if 'impulsion' not in valvulas:
                valvulas.setdefault('observaciones_impulsion', '')
                valvulas.setdefault('sugerencias_impulsion', '')

        # --- canastillas: asegurar '14' en cada sección de diámetros ---
        canastillas = values.get('canastillas')
        if isinstance(canastillas, dict):
            for section in ('diametros', 'aduccion', 'succion', 'desague'):
                section_data = canastillas.get(section)
                if isinstance(section_data, dict):
                    section_data.setdefault('14', 0)

        # --- inspeccion: asegurar que sea dict ---
        if not isinstance(values.get('inspeccion'), dict):
            values['inspeccion'] = {}

        return values

    class Config:
        extra = "allow"
