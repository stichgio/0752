"""
Pydantic models for the Formatos module.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class FormatOrigin(str, Enum):
    builtin = "builtin"
    uploaded = "uploaded"


class MappingStrategy(str, Enum):
    legacy_xobject = "legacy_xobject"
    visual_overlay = "visual_overlay"


class VisualMapping(BaseModel):
    page: int = Field(0, ge=0, description="0-indexed target page")
    x: float = Field(..., description="X coordinate (points from left)")
    y: float = Field(..., description="Y coordinate (points from top)")
    width: float = Field(120, description="Text box width in points")
    height: float = Field(20, description="Text box height in points")
    font_size: float = Field(10.0, description="Font size in points")
    font_name: str = Field("Courier-Bold", description="PDF base font name")
    color_r: float = Field(1.0, ge=0, le=1, description="Red component 0-1")
    color_g: float = Field(0.0, ge=0, le=1, description="Green component 0-1")
    color_b: float = Field(0.0, ge=0, le=1, description="Blue component 0-1")
    padding: int = Field(7, ge=1, le=12, description="Zero-pad length for correlativo")
    blank_x: Optional[float] = Field(None, description="X of blank rect (points from left)")
    blank_y: Optional[float] = Field(None, description="Y of blank rect (points from top)")
    blank_width: Optional[float] = Field(None, description="Width of blank rect in points")
    blank_height: Optional[float] = Field(None, description="Height of blank rect in points")
    redraw_top_border: bool = Field(False, description="Redraw the top edge of the blanked area using the mapping color")
    redraw_ot_badge: bool = Field(False, description="Redraw the full OT badge using the blank rect as badge bounds")
    blank_mcids: Optional[list[int]] = Field(None, description="MCID values in the XObject stream whose text should be blanked before overlay")


class FormatEntry(BaseModel):
    id: str
    nombre: str
    origen: FormatOrigin
    storage_path: str = Field(..., description="Relative path inside backend/data/formato_d/")
    enabled: bool = True
    persisted: bool = True
    strategy: MappingStrategy
    mapping: Optional[VisualMapping] = None
    filename_pattern: str = Field(
        "{id}_{desde}.pdf",
        description="Pattern for download filename. Supports {id}, {desde}, {hasta}, {nombre}.",
    )
    max_pages: int = Field(500, ge=1, le=2000)
    number_min: int = Field(1, ge=0)
    number_max: int = Field(9999999, ge=1)


class GenerateRequest(BaseModel):
    format_id: str
    desde: int = Field(..., ge=0, le=99999999999, description="Numero inicial")
    hasta: int = Field(..., ge=0, le=99999999999, description="Numero final")


class UploadFormatRequest(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=120)
    persisted: bool = True
    filename_pattern: Optional[str] = None


class UpdateMappingRequest(BaseModel):
    mapping: VisualMapping


class FormatInfo(BaseModel):
    id: str
    nombre: str
    origen: FormatOrigin
    enabled: bool
    persisted: bool
    strategy: MappingStrategy
    mapping: Optional[VisualMapping] = None
    filename_pattern: str
    max_pages: int
    number_min: int
    number_max: int
    has_mapping: bool
