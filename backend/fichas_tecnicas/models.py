"""
Modelos Pydantic para Fichas Técnicas de Evaluación de Actividades
"""
from pydantic import BaseModel
from typing import List, Literal
from datetime import datetime


class ProductoQuimico(BaseModel):
    """Producto químico/biológico utilizado"""
    producto: str = ""
    composicion: str = ""
    lote: str = ""
    fecha_vencimiento: str = ""
    unidad: str = ""
    concentracion: str = ""
    cantidad: str = ""


class ServicioEfectuar(BaseModel):
    """Servicios a efectuar - checkboxes"""
    desinfeccion: bool = False
    limpieza_ambientes: bool = False
    limpieza_pozos_septicos: bool = False
    limpieza_reservorios: bool = False


class TiposTratamiento(BaseModel):
    """Tipos de tratamiento aplicados"""
    pulverizado: bool = False
    atomizado: bool = False
    thermonebulizado: bool = False
    nebulizado_ulv: bool = False
    otros: str = ""


class ObservacionesRecomendaciones(BaseModel):
    """Observaciones y recomendaciones"""
    observacion_a: str = ""
    observacion_b: str = ""
    observacion_c: str = ""
    recomendacion_a: str = ""
    recomendacion_b: str = ""
    recomendacion_c: str = ""


class FichaTecnica(BaseModel):
    """Modelo principal de Ficha Técnica de Evaluación de Actividades"""
    id: str

    # Información general
    os_numero: str = ""  # Orden de Servicio N°
    cliente: str = ""
    fecha: str = ""
    direccion: str = ""
    distrito: str = ""

    # Servicio a efectuar
    servicio: ServicioEfectuar = ServicioEfectuar()

    # Diagnóstico del área a tratar
    diagnostico_area: str = ""

    # Condición sanitaria de la zona circundante
    condicion_sanitaria: str = ""

    # Tipos de tratamiento
    tratamiento: TiposTratamiento = TiposTratamiento()

    # Productos químicos/biológicos (hasta 4 productos)
    productos: List[ProductoQuimico] = [
        ProductoQuimico(),
        ProductoQuimico(),
        ProductoQuimico(),
        ProductoQuimico()
    ]

    # Acciones correctivas
    acciones_correctivas: str = ""

    # Áreas tratadas
    areas_tratadas: str = ""

    # Personal técnico (3 filas x 2 columnas = 6 campos)
    personal_tecnico: List[str] = ["", "", "", "", "", ""]
    hora_inicio: str = ""
    hora_termino: str = ""
    numero_certificado: str = ""

    # Observaciones y recomendaciones
    obs_rec: ObservacionesRecomendaciones = ObservacionesRecomendaciones()

    # Evaluación de satisfacción del cliente
    satisfaccion: Literal['muy_satisfecho', 'satisfecho', 'regular', 'insatisfecho', ''] = ''

    # Metadatos
    status: Literal['draft', 'completed'] = 'draft'
    last_modified: str = ""

    class Config:
        extra = "allow"
