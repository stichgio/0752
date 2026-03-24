# -*- coding: utf-8 -*-
from pydantic import BaseModel


class HeaderConfig(BaseModel):
    titulo: str = "Maquina de Balde"
    FECHA_TRABAJO: str = ""
    NIS: str = ""
    SGIO: str = ""
    DIRECCION: str = ""
    LOCALIDAD: str = ""
    DISTRITO: str = ""
    ACTIVIDAD: str = ""
