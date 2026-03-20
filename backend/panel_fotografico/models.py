"""
# -*- coding: utf-8 -*-
Modelos Pydantic para el módulo Panel Fotográfico Manual.
"""
from pydantic import BaseModel


class HeaderConfig(BaseModel):
    """Cabecera global del panel fotográfico, compartida por todas las hojas."""

    titulo: str = "Panel Fotográfico"
    CENTRO: str = ""
    NIS: str = ""
    FECHA_TRABAJO: str = ""
    DIRECCIONES_AFECTADAS: str = ""
    DISTRITO: str = ""
    ESTADO: str = ""
    ACTIVIDAD: str = ""
    CUADRILLA: str = ""
