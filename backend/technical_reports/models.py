"""
Modelos Pydantic para informes técnicos
Completamente aislados de otros modelos
"""
from pydantic import BaseModel, Field
from typing import Dict, Literal
from datetime import datetime

# Tipos custom
CheckState = Literal["normal", "critico", "unchecked"]
TipoReservorio = Literal["ELEVADO", "ENTERRADO", "SEMIENTERRADO"]

class ReportMetadata(BaseModel):
    informe_id: int
    dia: int = Field(ge=1, le=31)
    mes: str
    anio: int = Field(ge=2000, le=2100)
    pagina: str = "1 de 2"

class ReportHeader(BaseModel):
    cs: str
    contratista: str
    codigo_infraestructura: str
    ubicacion: str
    suministro: str
    tipo: TipoReservorio
    volumen: int = Field(ge=0)

class InspeccionDescripcion(BaseModel):
    caja_registro: CheckState = "unchecked"
    marco_tapa: CheckState = "unchecked"
    escalera_interior: CheckState = "unchecked"
    escalera_exterior: CheckState = "unchecked"
    cuba_interior: CheckState = "unchecked"
    cuba_exterior: CheckState = "unchecked"
    loza_fondo: CheckState = "unchecked"
    loza_techo_interior: CheckState = "unchecked"
    loza_techo_exterior: CheckState = "unchecked"
    ducto_ventilacion: CheckState = "unchecked"
    cerco_perimetrico: CheckState = "unchecked"
    descarga: CheckState = "unchecked"

class ValvulasCanastillas(BaseModel):
    diametros: Dict[str, int] = Field(
        default_factory=lambda: {
            "2": 0, "3": 0, "4": 0, "6": 0,
            "8": 0, "10": 0, "12": 0
        }
    )
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
    status: Literal["draft", "completed"] = "draft"
    last_modified: datetime = Field(default_factory=datetime.now)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ReportListItem(BaseModel):
    id: str
    informe_id: int
    cs: str
    codigo_infraestructura: str
    status: str
    last_modified: datetime
