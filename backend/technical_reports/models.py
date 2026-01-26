"""
Modelos Pydantic para Informes Técnicos
"""
from pydantic import BaseModel
from typing import Dict, Literal
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
    tipo: Literal['ELEVADO', 'ENTERRADO', 'SEMIENTERRADO']
    volumen: int

class InspeccionDescripcion(BaseModel):
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

class ValvulasCanastillas(BaseModel):
    diametros: Dict[str, int] = {'2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '12': 0}
    operativas: int = 0
    no_operativas: int = 0

class TechnicalReport(BaseModel):
    id: str
    metadata: ReportMetadata
    header: ReportHeader
    inspeccion: InspeccionDescripcion
    valvulas: ValvulasCanastillas
    canastillas: ValvulasCanastillas
    observaciones: str = ""
    sugerencias: str = ""
    status: Literal['draft', 'completed'] = 'draft'
    last_modified: str
