from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
import hashlib
import json
import threading
import traceback
from typing import Any, Deque, Dict, List, Optional, Tuple
from uuid import uuid4

from .compiler import compileTemplateJsonToJinja
from .database import db
from .models import (
    TemplateEditorRecord,
    TemplateJson,
    TemplateVersion,
    UserRole,
    ValidationResult,
)
from .supabase_client import (
    SupabaseTemplateClient,
    is_supabase_enabled,
    load_supabase_settings,
)
from .validators import sanitizeHtml, validateProtectedBlocks, validateTemplateStructure, validateVariables


ALLOWED_VARIABLES: Dict[str, Dict[str, Dict[str, bool]]] = {
    "technical_report": {
        "cs": {"optional": False},
        "contratista": {"optional": False},
        "codigo_infraestructura": {"optional": False},
        "suministro": {"optional": True},
        "fecha_corte": {"optional": True},
    },
    "ficha_tecnica": {
        "id": {"optional": False},
        "actividad": {"optional": True},
        "fecha": {"optional": True},
    },
    "generic": {
        "title": {"optional": False},
        "subtitle": {"optional": True},
    },
}

FILTER_WHITELIST = {"date", "upper", "lower"}

REPORT_TYPE_TO_DB = {
    "technical-report": "technical_report",
    "technical_report": "technical_report",
    "ficha-tecnica": "ficha_tecnica",
    "ficha_tecnica": "ficha_tecnica",
    "default": "generic",
    "generic": "generic",
}

REPORT_TYPE_TO_API = {
    "technical_report": "technical-report",
    "ficha_tecnica": "ficha-tecnica",
    "generic": "default",
}


class BasicRateLimiter:
    def __init__(self, requests_per_minute: int = 40):
        self.requests_per_minute = requests_per_minute
        self._hits: Dict[str, Deque[datetime]] = defaultdict(deque)
        # Protect hit-queue mutation in multi-threaded workers.
        self._lock = threading.Lock()

    def check(self, key: str) -> bool:
        now = datetime.now(timezone.utc)
        threshold = now - timedelta(minutes=1)
        with self._lock:
            queue = self._hits[key]
            while queue and queue[0] < threshold:
                queue.popleft()
            if len(queue) >= self.requests_per_minute:
                return False
            queue.append(now)
            return True


rate_limiter = BasicRateLimiter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _model_copy_deep(model: Any) -> Any:
    if hasattr(model, "model_copy"):
        return model.model_copy(deep=True)
    return model.copy(deep=True)


def _model_dump(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def _normalize_report_type(report_type: str) -> str:
    key = (report_type or "").strip()
    return REPORT_TYPE_TO_DB.get(key, "generic")


def _api_report_type(db_report_type: str) -> str:
    return REPORT_TYPE_TO_API.get(db_report_type, "default")


def _sanitize_and_compile(template_json: TemplateJson) -> Tuple[TemplateJson, str, str, str]:
    sanitized_json = _model_copy_deep(template_json)
    for section in sanitized_json.sections:
        for block in section.blocks:
            block.content = sanitizeHtml(block.content)

    compiled = compileTemplateJsonToJinja(sanitized_json)
    serialized_editor_json = json.dumps(
        _model_dump(sanitized_json),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    checksum = hashlib.sha256(
        f"{serialized_editor_json}\n{compiled}".encode("utf-8")
    ).hexdigest()
    return sanitized_json, compiled, checksum, serialized_editor_json


def _compile_template_json_safe(template_json: TemplateJson, context: str) -> Optional[str]:
    """Compile helper with shared logging/fallback semantics."""
    try:
        return compileTemplateJsonToJinja(template_json)
    except Exception as exc:
        print(f"[TemplateEditor] Compilation error in {context}: {exc}")
        traceback.print_exc()
        return None


def _compile_editor_json_raw_safe(editor_json_raw: str, context: str) -> Optional[str]:
    """Parse editor JSON and compile to Jinja with shared logging."""
    try:
        template_json = TemplateJson(**json.loads(editor_json_raw))
    except Exception as exc:
        print(f"[TemplateEditor] Compilation error in {context}: {exc}")
        traceback.print_exc()
        return None
    return _compile_template_json_safe(template_json, context)


def _looks_like_duplicate_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "duplicate" in msg or "already exists" in msg or "unique" in msg


def _draft_editor_path(template_id: str) -> str:
    return f"templates/{template_id}/draft/editor.json"


def _draft_compiled_path(template_id: str) -> str:
    return f"templates/{template_id}/draft/compiled.html"


def _version_editor_path(template_id: str, version: int) -> str:
    return f"templates/{template_id}/v{version}/editor.json"


def _version_compiled_path(template_id: str, version: int) -> str:
    return f"templates/{template_id}/v{version}/compiled.html"


class LocalTemplateStore:
    """
    Existing JSON-backed implementation.
    Kept as fallback to guarantee backward compatibility.
    """

    def create_template(self, name: str, report_type: str, template_json: TemplateJson, author: str, feature_flag: bool = False) -> TemplateEditorRecord:
        sanitized_json, compiled, _, _ = _sanitize_and_compile(template_json)
        now = _now_iso()
        record = TemplateEditorRecord(
            id=str(uuid4()),
            name=name,
            reportType=report_type,
            createdAt=now,
            updatedAt=now,
            createdBy=author,
            updatedBy=author,
            featureFlag=feature_flag,
            versions=[
                TemplateVersion(
                    version=1,
                    status="draft",
                    author=author,
                    createdAt=now,
                    templateJson=sanitized_json,
                    compiledJinja=compiled,
                    diffSummary={"created": True},
                )
            ],
        )
        db.create(record)
        return record

    def get_template(self, template_id: str) -> Optional[TemplateEditorRecord]:
        return db.get(template_id)

    def update_template(self, template_id: str, template_json: TemplateJson, author: str, role: UserRole) -> Tuple[TemplateEditorRecord, ValidationResult]:
        record = db.get(template_id)
        if not record:
            raise ValueError("Template not found")

        validation = run_validations(template_json, role)
        sanitized_json, compiled, _, _ = _sanitize_and_compile(template_json)
        now = _now_iso()
        new_version = record.currentVersion + 1
        diff_summary = {
            "sectionCount": len(sanitized_json.sections),
            "variableBindings": sorted(list((sanitized_json.variableBindings or {}).keys())),
        }
        record.versions.append(
            TemplateVersion(
                version=new_version,
                status="draft",
                author=author,
                createdAt=now,
                templateJson=sanitized_json,
                compiledJinja=compiled,
                diffSummary=diff_summary,
            )
        )
        record.currentVersion = new_version
        record.updatedAt = now
        record.updatedBy = author
        record.status = "draft"
        db.update(template_id, record)
        return record, validation

    def publish_template(self, template_id: str, author: str) -> TemplateEditorRecord:
        record = db.get(template_id)
        if not record:
            raise ValueError("Template not found")
        if not record.versions:
            raise ValueError("Template has no versions")
        now = _now_iso()
        latest = record.versions[-1]
        latest.status = "published"
        record.status = "published"
        record.updatedAt = now
        record.updatedBy = author
        db.update(template_id, record)
        return record

    def rollback_template(self, template_id: str, target_version: Optional[int], author: str) -> TemplateEditorRecord:
        record = db.get(template_id)
        if not record:
            raise ValueError("Template not found")
        if len(record.versions) < 2:
            raise ValueError("No previous version available")

        version_to_restore = target_version
        if version_to_restore is None:
            version_to_restore = record.versions[-2].version

        previous = next((v for v in record.versions if v.version == version_to_restore), None)
        if previous is None:
            raise ValueError("Target version not found")

        now = _now_iso()
        new_version = record.currentVersion + 1
        record.versions.append(
            TemplateVersion(
                version=new_version,
                status="published",
                author=author,
                createdAt=now,
                templateJson=previous.templateJson,
                compiledJinja=previous.compiledJinja,
                diffSummary={"rollbackFrom": record.currentVersion, "rollbackTo": previous.version},
            )
        )
        record.currentVersion = new_version
        record.status = "published"
        record.updatedAt = now
        record.updatedBy = author
        db.update(template_id, record)
        return record

    def delete_template(self, template_id: str, author: str) -> TemplateEditorRecord:
        record = db.get(template_id)
        if not record:
            raise ValueError("Template not found")

        now = _now_iso()
        record.status = "archived"
        record.updatedAt = now
        record.updatedBy = author
        db.update(template_id, record)
        return record

    def get_preview_html(self, template_id: str) -> Optional[str]:
        record = db.get(template_id)
        if not record or not record.versions:
            return None
        latest = record.versions[-1]
        # Always recompile from templateJson so CSS fixes apply immediately
        if latest.templateJson:
            compiled = _compile_template_json_safe(
                latest.templateJson,
                f"LocalTemplateStore.get_preview_html ({template_id})",
            )
            if compiled is not None:
                return compiled
        return latest.compiledJinja

    def get_published_template_by_name(self, template_name: str) -> Optional[str]:
        for item in db.get_all():
            if item.name == template_name and item.status == "published" and item.featureFlag and item.versions:
                latest = item.versions[-1]
                # Always recompile from templateJson so CSS fixes apply immediately
                if latest.templateJson:
                    compiled = _compile_template_json_safe(
                        latest.templateJson,
                        f"LocalTemplateStore.get_published_template_by_name ({template_name})",
                    )
                    if compiled is not None:
                        return compiled
                return latest.compiledJinja
        return None

    def get_all_published_templates(self) -> List[Dict[str, str]]:
        results: List[Dict[str, str]] = []
        for item in db.get_all():
            if item.status == "published" and item.featureFlag and item.versions:
                results.append({"id": item.id, "name": item.name})
        return results

    def list_templates(self) -> List[Dict[str, str]]:
        results: List[Dict[str, str]] = []
        for item in db.get_all():
            status = item.status if item.status in {"draft", "published", "archived"} else "draft"
            results.append(
                {
                    "id": item.id,
                    "name": item.name,
                    "status": status,
                    "updatedAt": item.updatedAt,
                }
            )
        return results


class SupabaseTemplateStore:
    def __init__(self, client: SupabaseTemplateClient):
        self.client = client

    def _empty_template_json(self, report_type_api: str) -> TemplateJson:
        return TemplateJson(reportType=report_type_api, sections=[], metadata={}, variableBindings={})

    def _read_template_json(self, path: str, report_type_api: str) -> TemplateJson:
        raw = self.client.download_text(path)
        if not raw:
            return self._empty_template_json(report_type_api)
        try:
            payload = json.loads(raw)
            return TemplateJson(**payload)
        except Exception:
            return self._empty_template_json(report_type_api)

    def _read_compiled_html(self, path: str) -> str:
        return self.client.download_text(path) or ""

    def _build_template_version(self, template_row: Dict[str, Any], version_row: Dict[str, Any]) -> TemplateVersion:
        report_type_api = _api_report_type(str(template_row.get("report_type", "generic")))
        template_json = self._read_template_json(version_row["editor_json_path"], report_type_api)
        compiled_html = self._read_compiled_html(version_row["compiled_html_path"])
        return TemplateVersion(
            version=int(version_row.get("version_number", 0)),
            status="published" if version_row.get("published_at") else "draft",
            author=str(version_row.get("created_by") or template_row.get("updated_by") or "system"),
            createdAt=str(version_row.get("created_at") or template_row.get("updated_at") or _now_iso()),
            templateJson=template_json,
            compiledJinja=compiled_html,
            diffSummary={
                "schemaVersion": int(version_row.get("schema_version") or 1),
                "editorJsonPath": version_row.get("editor_json_path"),
                "compiledHtmlPath": version_row.get("compiled_html_path"),
                "checksum": version_row.get("checksum"),
                "changeNote": version_row.get("change_note"),
                "publishedAt": version_row.get("published_at"),
            },
        )

    def _build_draft_version(self, template_row: Dict[str, Any]) -> Optional[TemplateVersion]:
        template_id = str(template_row["id"])
        editor_path = _draft_editor_path(template_id)
        compiled_path = _draft_compiled_path(template_id)
        editor_raw = self.client.download_text(editor_path)
        compiled_html = self.client.download_text(compiled_path)
        if editor_raw is None and compiled_html is None:
            return None

        report_type_api = _api_report_type(str(template_row.get("report_type", "generic")))
        template_json = self._read_template_json(editor_path, report_type_api)
        compiled = compiled_html or ""
        checksum = hashlib.sha256(f"{editor_raw or ''}\n{compiled}".encode("utf-8")).hexdigest()
        return TemplateVersion(
            version=max(int(template_row.get("current_version") or 0) + 1, 1),
            status="draft",
            author=str(template_row.get("updated_by") or template_row.get("created_by") or "system"),
            createdAt=str(template_row.get("updated_at") or _now_iso()),
            templateJson=template_json,
            compiledJinja=compiled,
            diffSummary={
                "draft": True,
                "editorJsonPath": editor_path,
                "compiledHtmlPath": compiled_path,
                "checksum": checksum,
            },
        )

    def _build_record(self, template_row: Dict[str, Any]) -> TemplateEditorRecord:
        versions_rows = self.client.list_template_versions(str(template_row["id"]))
        versions = [self._build_template_version(template_row, row) for row in versions_rows]
        draft_version = self._build_draft_version(template_row)
        if draft_version:
            current_version = int(template_row.get("current_version") or 0)
            current_checksum = None
            for version in versions:
                if version.version == current_version:
                    current_checksum = version.diffSummary.get("checksum")
                    break
            if not versions or draft_version.diffSummary.get("checksum") != current_checksum:
                versions.append(draft_version)

        return TemplateEditorRecord(
            id=str(template_row["id"]),
            name=str(template_row["name"]),
            reportType=_api_report_type(str(template_row.get("report_type", "generic"))),
            status=str(template_row.get("status") or "draft"),
            currentVersion=int(template_row.get("current_version") or 0),
            createdAt=str(template_row.get("created_at") or _now_iso()),
            updatedAt=str(template_row.get("updated_at") or _now_iso()),
            createdBy=str(template_row.get("created_by") or "system"),
            updatedBy=str(template_row.get("updated_by") or "system"),
            featureFlag=True,
            versions=versions,
        )

    def _write_draft(self, template_id: str, serialized_editor_json: str, compiled_html: str) -> None:
        self.client.upload_text(_draft_editor_path(template_id), serialized_editor_json, "application/json")
        self.client.upload_text(_draft_compiled_path(template_id), compiled_html, "text/html")

    def create_template(self, name: str, report_type: str, template_json: TemplateJson, author: str, feature_flag: bool = False) -> TemplateEditorRecord:
        _ = feature_flag
        sanitized_json, compiled, _, serialized_editor_json = _sanitize_and_compile(template_json)
        now = _now_iso()
        db_report_type = _normalize_report_type(report_type or sanitized_json.reportType)

        try:
            template_row = self.client.create_template(
                {
                    "name": name,
                    "report_type": db_report_type,
                    "status": "draft",
                    "current_version": 0,
                    "created_by": author,
                    "updated_by": author,
                    "created_at": now,
                    "updated_at": now,
                }
            )
        except Exception as exc:
            if _looks_like_duplicate_error(exc):
                raise ValueError("A template with the same name and report type already exists") from exc
            raise

        template_id = str(template_row["id"])
        self._write_draft(template_id, serialized_editor_json, compiled)
        return self._build_record(template_row)

    def get_template(self, template_id: str) -> Optional[TemplateEditorRecord]:
        template_row = self.client.get_template(template_id)
        if not template_row:
            return None
        return self._build_record(template_row)

    def update_template(self, template_id: str, template_json: TemplateJson, author: str, role: UserRole) -> Tuple[TemplateEditorRecord, ValidationResult]:
        template_row = self.client.get_template(template_id)
        if not template_row:
            raise ValueError("Template not found")

        validation = run_validations(template_json, role)
        sanitized_json, compiled, _, serialized_editor_json = _sanitize_and_compile(template_json)
        self._write_draft(template_id, serialized_editor_json, compiled)

        now = _now_iso()
        next_status = str(template_row.get("status") or "draft")
        if next_status not in {"published", "archived"}:
            next_status = "draft"
        updated_row = self.client.update_template(
            template_id,
            {"updated_by": author, "updated_at": now, "status": next_status},
        )
        return self._build_record(updated_row), validation

    def publish_template(self, template_id: str, author: str) -> TemplateEditorRecord:
        template_row = self.client.get_template(template_id)
        if not template_row:
            raise ValueError("Template not found")

        draft_editor_path = _draft_editor_path(template_id)
        draft_compiled_path = _draft_compiled_path(template_id)
        draft_editor_json = self.client.download_text(draft_editor_path)
        draft_compiled_html = self.client.download_text(draft_compiled_path)
        if draft_editor_json is None or draft_compiled_html is None:
            raise ValueError("Template draft not found. Save a draft before publishing")

        draft_checksum = hashlib.sha256(f"{draft_editor_json}\n{draft_compiled_html}".encode("utf-8")).hexdigest()
        current_version = int(template_row.get("current_version") or 0)
        if current_version > 0 and str(template_row.get("status")) == "published":
            current_row = self.client.get_template_version(template_id, current_version)
            if current_row and current_row.get("checksum") == draft_checksum:
                return self._build_record(template_row)

        next_version = current_version + 1
        version_editor_path = _version_editor_path(template_id, next_version)
        version_compiled_path = _version_compiled_path(template_id, next_version)
        self.client.copy_object(draft_editor_path, version_editor_path, "application/json")
        self.client.copy_object(draft_compiled_path, version_compiled_path, "text/html")

        now = _now_iso()
        version_payload = {
            "template_id": template_id,
            "version_number": next_version,
            "schema_version": 1,
            "editor_json_path": version_editor_path,
            "compiled_html_path": version_compiled_path,
            "checksum": draft_checksum,
            "change_note": "published from draft",
            "published_at": now,
            "created_by": author,
            "created_at": now,
        }
        try:
            self.client.insert_template_version(version_payload)
        except Exception as exc:
            if not _looks_like_duplicate_error(exc):
                raise
            existing = self.client.get_template_version(template_id, next_version)
            if not existing or existing.get("checksum") != draft_checksum:
                raise ValueError("Publish conflict detected. Retry the operation") from exc

        updated_row = self.client.update_template(
            template_id,
            {
                "current_version": next_version,
                "status": "published",
                "updated_by": author,
                "updated_at": now,
            },
        )
        return self._build_record(updated_row)

    def rollback_template(self, template_id: str, target_version: Optional[int], author: str) -> TemplateEditorRecord:
        template_row = self.client.get_template(template_id)
        if not template_row:
            raise ValueError("Template not found")

        current_version = int(template_row.get("current_version") or 0)
        # Resolve rollback target explicitly to avoid dead/duplicate checks.
        if target_version is not None:
            resolved_target = target_version
        else:
            resolved_target = current_version - 1
        if resolved_target <= 0:
            raise ValueError("No previous version available")

        target_row = self.client.get_template_version(template_id, resolved_target)
        if not target_row:
            raise ValueError("Target version not found")

        now = _now_iso()
        updated_row = self.client.update_template(
            template_id,
            {
                "current_version": int(resolved_target),
                "status": "published",
                "updated_by": author,
                "updated_at": now,
            },
        )
        return self._build_record(updated_row)

    def delete_template(self, template_id: str, author: str) -> TemplateEditorRecord:
        template_row = self.client.get_template(template_id)
        if not template_row:
            raise ValueError("Template not found")

        now = _now_iso()
        updated_row = self.client.update_template(
            template_id,
            {
                "status": "archived",
                "updated_by": author,
                "updated_at": now,
            },
        )
        return self._build_record(updated_row)

    def get_preview_html(self, template_id: str) -> Optional[str]:
        template_row = self.client.get_template(template_id)
        if not template_row:
            return None

        # Try draft JSON first, recompile for up-to-date CSS
        draft_json_raw = self.client.download_text(_draft_editor_path(template_id))
        if draft_json_raw:
            compiled = _compile_editor_json_raw_safe(
                draft_json_raw,
                f"SupabaseTemplateStore.get_preview_html draft ({template_id})",
            )
            if compiled is not None:
                return compiled
            draft_html = self.client.download_text(_draft_compiled_path(template_id))
            if draft_html is not None:
                return draft_html

        current_version = int(template_row.get("current_version") or 0)
        if current_version <= 0:
            return None
        version_row = self.client.get_template_version(template_id, current_version)
        if not version_row:
            return None
        # Recompile from stored JSON for up-to-date CSS
        editor_raw = self.client.download_text(version_row["editor_json_path"])
        if editor_raw:
            compiled = _compile_editor_json_raw_safe(
                editor_raw,
                f"SupabaseTemplateStore.get_preview_html version ({template_id})",
            )
            if compiled is not None:
                return compiled
        return self.client.download_text(version_row["compiled_html_path"])

    def get_published_template_by_name(self, template_name: str) -> Optional[str]:
        candidates = self.client.list_templates_by_name(template_name, status="published")
        for row in candidates:
            current_version = int(row.get("current_version") or 0)
            if current_version <= 0:
                continue
            version_row = self.client.get_template_version(str(row["id"]), current_version)
            if not version_row:
                continue
            # Recompile from stored JSON for up-to-date CSS
            editor_raw = self.client.download_text(version_row["editor_json_path"])
            if editor_raw:
                compiled = _compile_editor_json_raw_safe(
                    editor_raw,
                    f"SupabaseTemplateStore.get_published_template_by_name ({template_name})",
                )
                if compiled:
                    return compiled
            compiled = self.client.download_text(version_row["compiled_html_path"])
            if compiled:
                return compiled
        return None

    def get_all_published_templates(self) -> List[Dict[str, str]]:
        rows = self.client.list_published_templates()
        return [{"id": str(row["id"]), "name": str(row["name"])} for row in rows]

    def list_templates(self) -> List[Dict[str, str]]:
        rows = self.client.list_templates()
        results: List[Dict[str, str]] = []
        for row in rows:
            status = str(row.get("status") or "draft")
            if status not in {"draft", "published", "archived"}:
                status = "draft"
            results.append(
                {
                    "id": str(row["id"]),
                    "name": str(row["name"]),
                    "status": status,
                    "updatedAt": str(row.get("updated_at") or _now_iso()),
                }
            )
        return results


_local_store = LocalTemplateStore()
_store_override: Optional[Any] = None
_supabase_store_cache: Optional[SupabaseTemplateStore] = None
_supabase_store_key: Optional[Tuple[str, str, str]] = None


def set_template_store_override_for_tests(store: Optional[Any]) -> None:
    global _store_override, _supabase_store_cache, _supabase_store_key
    _store_override = store
    _supabase_store_cache = None
    _supabase_store_key = None


def _get_supabase_store() -> Optional[SupabaseTemplateStore]:
    global _supabase_store_cache, _supabase_store_key
    if not is_supabase_enabled():
        _supabase_store_cache = None
        _supabase_store_key = None
        return None

    settings = load_supabase_settings()
    if settings is None:
        return None
    key = (settings.url, settings.bucket, settings.service_role_key)
    if _supabase_store_cache and _supabase_store_key == key:
        return _supabase_store_cache

    try:
        _supabase_store_cache = SupabaseTemplateStore(SupabaseTemplateClient(settings))
        _supabase_store_key = key
        return _supabase_store_cache
    except Exception as exc:
        _supabase_store_cache = None
        _supabase_store_key = None
        print(f"[TemplateEditor] Supabase store init failed, falling back to local store: {exc}")
        return None


def _get_editor_store() -> Any:
    if _store_override is not None:
        return _store_override
    supabase_store = _get_supabase_store()
    if supabase_store:
        return supabase_store
    return _local_store


def get_variable_catalog(report_type: str) -> Dict[str, Dict[str, bool]]:
    return ALLOWED_VARIABLES.get(_normalize_report_type(report_type), ALLOWED_VARIABLES["generic"])


def run_validations(template_json: TemplateJson, role: UserRole) -> ValidationResult:
    structure_result = validateTemplateStructure(template_json)
    vars_result = validateVariables(template_json, get_variable_catalog(template_json.reportType), FILTER_WHITELIST)
    protected_result = validateProtectedBlocks(template_json, role)
    issues = structure_result.issues + vars_result.issues + protected_result.issues
    return ValidationResult(valid=not any(i.level == "error" for i in issues), issues=issues)


def create_template(name: str, report_type: str, template_json: TemplateJson, author: str, feature_flag: bool = False) -> TemplateEditorRecord:
    return _get_editor_store().create_template(name, report_type, template_json, author, feature_flag=feature_flag)


def get_template(template_id: str) -> Optional[TemplateEditorRecord]:
    return _get_editor_store().get_template(template_id)


def update_template(template_id: str, template_json: TemplateJson, author: str, role: UserRole) -> Tuple[TemplateEditorRecord, ValidationResult]:
    return _get_editor_store().update_template(template_id, template_json, author, role)


def publish_template(template_id: str, author: str) -> TemplateEditorRecord:
    return _get_editor_store().publish_template(template_id, author)


def rollback_template(template_id: str, target_version: Optional[int], author: str) -> TemplateEditorRecord:
    return _get_editor_store().rollback_template(template_id, target_version, author)


def delete_template(template_id: str, author: str) -> TemplateEditorRecord:
    return _get_editor_store().delete_template(template_id, author)


def get_preview_html(template_id: str) -> Optional[str]:
    return _get_editor_store().get_preview_html(template_id)


def get_published_template_by_name(template_name: str) -> Optional[str]:
    if _store_override is not None:
        return _store_override.get_published_template_by_name(template_name)

    supabase_store = _get_supabase_store()
    if supabase_store:
        try:
            html = supabase_store.get_published_template_by_name(template_name)
            if html:
                return html
        except Exception:
            pass

    return _local_store.get_published_template_by_name(template_name)


def get_all_published_templates() -> List[Dict[str, str]]:
    if _store_override is not None:
        return _store_override.get_all_published_templates()

    results: Dict[str, Dict[str, str]] = {}
    supabase_store = _get_supabase_store()
    if supabase_store:
        try:
            for item in supabase_store.get_all_published_templates():
                results[item["name"]] = item
        except Exception:
            pass

    for item in _local_store.get_all_published_templates():
        results.setdefault(item["name"], item)
    return list(results.values())


def _template_status_rank(status: str) -> int:
    if status == "published":
        return 0
    if status == "draft":
        return 1
    return 2


def _normalize_template_summary(item: Dict[str, Any]) -> Dict[str, str]:
    status = str(item.get("status") or "draft")
    if status not in {"draft", "published", "archived"}:
        status = "draft"
    return {
        "id": str(item.get("id") or ""),
        "name": str(item.get("name") or ""),
        "status": status,
        "updatedAt": str(item.get("updatedAt") or item.get("updated_at") or ""),
    }


def _sort_template_summaries(items: List[Dict[str, str]]) -> List[Dict[str, str]]:
    ordered = sorted(items, key=lambda item: str(item.get("name") or "").lower())
    ordered = sorted(ordered, key=lambda item: str(item.get("updatedAt") or ""), reverse=True)
    ordered = sorted(
        ordered,
        key=lambda item: _template_status_rank(str(item.get("status") or "draft")),
    )
    return ordered


def get_all_editor_templates() -> List[Dict[str, str]]:
    if _store_override is not None:
        if hasattr(_store_override, "list_templates"):
            return _sort_template_summaries(
                [_normalize_template_summary(item) for item in _store_override.list_templates()]
            )
        published_fallback = [
            {**item, "status": "published"} for item in _store_override.get_all_published_templates()
        ]
        return _sort_template_summaries(
            [_normalize_template_summary(item) for item in published_fallback]
        )

    results: Dict[str, Dict[str, str]] = {}
    supabase_store = _get_supabase_store()
    if supabase_store:
        try:
            for item in supabase_store.list_templates():
                normalized = _normalize_template_summary(item)
                if normalized["name"]:
                    results[normalized["name"]] = normalized
        except Exception:
            pass

    for item in _local_store.list_templates():
        normalized = _normalize_template_summary(item)
        if normalized["name"]:
            results.setdefault(normalized["name"], normalized)

    return _sort_template_summaries(list(results.values()))
