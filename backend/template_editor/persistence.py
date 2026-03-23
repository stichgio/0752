# -*- coding: utf-8 -*-
import json
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4


class JsonTemplateClient:
    """Simple local persistence backend for template editor data.

    Keeps a JSON file on disk so environments without Supabase still retain
    template drafts, versions and compiled assets across process restarts.
    """

    def __init__(self, state_path: Optional[str] = None):
        default_path = Path(__file__).resolve().parent.parent / "data" / "template_editor_store.json"
        self._state_path = Path(state_path) if state_path else default_path
        self._lock = threading.Lock()
        self._state_path.parent.mkdir(parents=True, exist_ok=True)

    def _empty_state(self) -> Dict[str, Any]:
        return {
            "templates": {},
            "template_versions": [],
            "storage": {},
        }

    def _copy(self, payload: Any) -> Any:
        return json.loads(json.dumps(payload))

    def _read_state(self) -> Dict[str, Any]:
        if not self._state_path.exists():
            return self._empty_state()
        try:
            raw = self._state_path.read_text(encoding="utf-8")
            parsed = json.loads(raw) if raw.strip() else {}
        except Exception as exc:
            raise RuntimeError(f"No se pudo leer la persistencia local del template editor: {exc}") from exc

        if not isinstance(parsed, dict):
            return self._empty_state()

        state = self._empty_state()
        templates = parsed.get("templates")
        versions = parsed.get("template_versions")
        storage = parsed.get("storage")

        if isinstance(templates, dict):
            state["templates"] = templates
        if isinstance(versions, list):
            state["template_versions"] = versions
        if isinstance(storage, dict):
            state["storage"] = storage
        return state

    def _write_state(self, state: Dict[str, Any]) -> None:
        payload = json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True)
        self._state_path.write_text(payload, encoding="utf-8")

    def create_template(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            state = self._read_state()
            templates = state["templates"]
            for row in templates.values():
                if row.get("name") == payload.get("name") and row.get("report_type") == payload.get("report_type"):
                    raise RuntimeError("duplicate key value violates unique constraint")
            row = {"id": str(uuid4()), **payload}
            templates[row["id"]] = row
            self._write_state(state)
            return self._copy(row)

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            row = state["templates"].get(template_id)
            return self._copy(row) if row else None

    def update_template(self, template_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            state = self._read_state()
            templates = state["templates"]
            if template_id not in templates:
                raise ValueError("Plantilla no encontrada")

            current = templates[template_id]
            updated = {**current, **payload}
            for row_id, row in templates.items():
                if row_id == template_id:
                    continue
                if row.get("name") == updated.get("name") and row.get("report_type") == updated.get("report_type"):
                    raise RuntimeError("duplicate key value violates unique constraint")

            templates[template_id] = updated
            self._write_state(state)
            return self._copy(updated)

    def list_templates(self) -> List[Dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            rows = [self._copy(row) for row in state["templates"].values()]
            rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
            return rows

    def list_templates_by_name(self, name: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            rows: List[Dict[str, Any]] = []
            for row in state["templates"].values():
                if row.get("name") != name:
                    continue
                if status is not None and row.get("status") != status:
                    continue
                rows.append(self._copy(row))
            rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
            return rows

    def list_published_templates(self) -> List[Dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            rows = [self._copy(row) for row in state["templates"].values() if row.get("status") == "published"]
            rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
            return rows

    def list_template_versions(self, template_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            rows = [row for row in state["template_versions"] if row.get("template_id") == template_id]
            rows.sort(key=lambda item: int(item.get("version_number") or 0))
            return self._copy(rows)

    def get_template_version(self, template_id: str, version_number: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            for row in state["template_versions"]:
                if row.get("template_id") == template_id and int(row.get("version_number") or 0) == int(version_number):
                    return self._copy(row)
            return None

    def insert_template_version(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            state = self._read_state()
            for row in state["template_versions"]:
                if row.get("template_id") == payload.get("template_id") and int(row.get("version_number") or 0) == int(payload.get("version_number") or 0):
                    raise RuntimeError("duplicate key value violates unique constraint")
            state["template_versions"].append(self._copy(payload))
            self._write_state(state)
            return self._copy(payload)

    def update_template_version(self, template_id: str, version_number: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            state = self._read_state()
            for index, row in enumerate(state["template_versions"]):
                if row.get("template_id") == template_id and int(row.get("version_number") or 0) == int(version_number):
                    updated = {**row, **payload}
                    state["template_versions"][index] = updated
                    self._write_state(state)
                    return self._copy(updated)
        raise ValueError("Versión de plantilla no encontrada")

    def upload_text(self, path: str, content: str, content_type: str) -> None:
        _ = content_type
        with self._lock:
            state = self._read_state()
            state["storage"][path] = content
            self._write_state(state)

    def download_text(self, path: str) -> Optional[str]:
        with self._lock:
            state = self._read_state()
            value = state["storage"].get(path)
            return str(value) if isinstance(value, str) else None

    def copy_object(self, source_path: str, target_path: str, content_type: str) -> None:
        _ = content_type
        with self._lock:
            state = self._read_state()
            if source_path not in state["storage"]:
                raise RuntimeError("Objeto fuente no encontrado")
            state["storage"][target_path] = state["storage"][source_path]
            self._write_state(state)
