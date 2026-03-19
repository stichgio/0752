"""
Catalog service: loads builtin formats, persists uploaded formats to JSON,
manages CRUD operations on the format catalog.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import uuid
from typing import Dict, Optional

from .models import FormatEntry, FormatOrigin, MappingStrategy, VisualMapping

logger = logging.getLogger(__name__)

_DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data", "formato_d"))
_UPLOADS_DIR = os.path.join(_DATA_DIR, "uploads")
_CATALOG_PATH = os.path.join(_DATA_DIR, "catalog.json")


def _ensure_dirs() -> None:
    os.makedirs(_UPLOADS_DIR, exist_ok=True)


_BUILTIN_FORMATS: list[FormatEntry] = [
    FormatEntry(
        id="template-d",
        nombre="Formato D (SEDAPAL)",
        origen=FormatOrigin.builtin,
        storage_path="template-d.b64",
        enabled=True,
        persisted=True,
        strategy=MappingStrategy.legacy_xobject,
        mapping=None,
        filename_pattern="formato_d_{desde}.pdf",
        max_pages=500,
        number_min=1,
        number_max=9999999,
    ),
    FormatEntry(
        id="maquina",
        nombre="Maquina",
        origen=FormatOrigin.builtin,
        storage_path="maquina.b64",
        enabled=True,
        persisted=True,
        strategy=MappingStrategy.visual_overlay,
        mapping=VisualMapping(
            page=0,
            x=547,
            y=20,
            width=140,
            height=20,
            font_size=13,
            font_name="Helvetica-Bold",
            color_r=0.1176,
            color_g=0.2275,
            color_b=0.5412,
            padding=5,
            blank_x=507,
            blank_y=12,
            blank_width=88,
            blank_height=31,
            redraw_top_border=False,
            redraw_ot_badge=True,
            blank_mcids=[88, 89],
        ),
        filename_pattern="maquina_{desde}.pdf",
        max_pages=500,
        number_min=1,
        number_max=9999999,
    ),
    FormatEntry(
        id="televisiva",
        nombre="Televisiva",
        origen=FormatOrigin.builtin,
        storage_path="televisiva.b64",
        enabled=True,
        persisted=True,
        strategy=MappingStrategy.visual_overlay,
        mapping=VisualMapping(
            page=0,
            x=548,
            y=31,
            width=140,
            height=20,
            font_size=13,
            font_name="Helvetica-Bold",
            color_r=0.1176,
            color_g=0.2275,
            color_b=0.5412,
            padding=5,
            blank_x=506,
            blank_y=26,
            blank_width=94,
            blank_height=31,
            redraw_top_border=False,
            redraw_ot_badge=True,
            blank_mcids=[4, 63],
        ),
        filename_pattern="televisiva_{desde}.pdf",
        max_pages=500,
        number_min=1,
        number_max=9999999,
    ),
]


class FormatCatalog:
    """In-memory catalog backed by a JSON file for uploaded formats."""

    def __init__(self) -> None:
        self._formats: Dict[str, FormatEntry] = {}
        _ensure_dirs()
        self._load()

    def _load(self) -> None:
        for fmt in _BUILTIN_FORMATS:
            self._formats[fmt.id] = fmt.model_copy()

        if os.path.exists(_CATALOG_PATH):
            try:
                with open(_CATALOG_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for raw in data:
                    entry = FormatEntry(**raw)
                    if entry.id in self._formats and self._formats[entry.id].origen == FormatOrigin.builtin:
                        if entry.mapping is not None:
                            builtin_mapping = self._formats[entry.id].mapping
                            self._formats[entry.id].mapping = entry.mapping
                            if builtin_mapping and builtin_mapping.blank_mcids and not entry.mapping.blank_mcids:
                                self._formats[entry.id].mapping.blank_mcids = builtin_mapping.blank_mcids
                    else:
                        self._formats[entry.id] = entry
            except Exception:
                logger.exception("Error loading format catalog from %s", _CATALOG_PATH)

    def _save(self) -> None:
        _ensure_dirs()
        persistable = [
            fmt.model_dump(mode="json")
            for fmt in self._formats.values()
            if fmt.persisted
        ]
        with open(_CATALOG_PATH, "w", encoding="utf-8") as f:
            json.dump(persistable, f, ensure_ascii=False, indent=2)

    def list_formats(self) -> list[FormatEntry]:
        return [f for f in self._formats.values() if f.enabled]

    def get(self, format_id: str) -> Optional[FormatEntry]:
        return self._formats.get(format_id)

    def resolve_path(self, entry: FormatEntry) -> str:
        if entry.origen == FormatOrigin.uploaded:
            return os.path.join(_UPLOADS_DIR, entry.storage_path)
        return os.path.join(_DATA_DIR, entry.storage_path)

    def add_uploaded(
        self,
        nombre: str,
        filename: str,
        tmp_path: str,
        persisted: bool = True,
        filename_pattern: Optional[str] = None,
    ) -> FormatEntry:
        fmt_id = f"upload-{uuid.uuid4().hex[:8]}"
        safe_name = f"{fmt_id}_{filename}"
        dest = os.path.join(_UPLOADS_DIR, safe_name)
        shutil.copy2(tmp_path, dest)

        entry = FormatEntry(
            id=fmt_id,
            nombre=nombre,
            origen=FormatOrigin.uploaded,
            storage_path=safe_name,
            enabled=True,
            persisted=persisted,
            strategy=MappingStrategy.visual_overlay,
            mapping=None,
            filename_pattern=filename_pattern or f"{fmt_id}_{{desde}}.pdf",
            max_pages=500,
            number_min=1,
            number_max=9999999,
        )
        self._formats[fmt_id] = entry
        if persisted:
            self._save()
        return entry

    def update_mapping(self, format_id: str, mapping: VisualMapping) -> Optional[FormatEntry]:
        entry = self._formats.get(format_id)
        if entry is None:
            return None
        entry.mapping = mapping
        self._save()
        return entry

    def delete_format(self, format_id: str) -> bool:
        entry = self._formats.get(format_id)
        if entry is None:
            return False
        if entry.origen == FormatOrigin.builtin:
            entry.enabled = False
        else:
            self._formats.pop(format_id, None)
            try:
                os.remove(self.resolve_path(entry))
            except FileNotFoundError:
                pass
            except Exception:
                logger.exception("Error deleting uploaded format file for %s", format_id)
        self._save()
        return True


catalog = FormatCatalog()

