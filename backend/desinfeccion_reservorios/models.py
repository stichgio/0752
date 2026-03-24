# -*- coding: utf-8 -*-
from pydantic import BaseModel


class HeaderConfig(BaseModel):
    titulo: str = "Desinfeccion de Reservorios"
    FECHA_TRABAJO: str = ""
    NIS: str = ""
    SGIO: str = ""
    DIRECCION: str = ""
    DISTRITO: str = ""
    ESTADO: str = ""
