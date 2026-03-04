import hashlib
import json
import threading
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from pydantic import ValidationError  # pyre-ignore[21]

from .compiler import _compile_canvas_template, _has_canvas_layout, compileTemplateJsonToJinja  # pyre-ignore[21]
from .models import (  # pyre-ignore[21]
    TemplateEditorRecord,
    TemplateJson,
    TemplateVersion,
    UserRole,
    ValidationResult,
)
from .supabase_client import SupabaseTemplateClient, is_supabase_enabled  # pyre-ignore[21]
from .validators import sanitizeHtml, validateProtectedBlocks, validateTemplateStructure, validateVariables  # pyre-ignore[21]

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
ALLOWED_TEMPLATE_STATUS = {"draft", "published", "archived"}
DEFAULT_REPORT_TYPE_DB = "generic"


class BasicRateLimiter:
    def __init__(self, requests_per_minute: int = 40):
        self.requests_per_minute = requests_per_minute
        self._hits = defaultdict(deque)
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


def _canonical_report_type_db(report_type: Optional[str]) -> str:
    if not report_type:
        return DEFAULT_REPORT_TYPE_DB
    normalized = str(report_type).strip().replace("-", "_").lower()
    if normalized not in {"technical_report", "ficha_tecnica", "generic"}:
        return DEFAULT_REPORT_TYPE_DB
    return normalized


def _public_report_type(report_type_db: Optional[str]) -> str:
    return _canonical_report_type_db(report_type_db).replace("_", "-")


def _template_json_to_dict(template_json: TemplateJson) -> Dict[str, Any]:
    if hasattr(template_json, "model_dump"):
        return template_json.model_dump()
    return template_json.dict()


def _empty_template_json_payload(report_type: Optional[str]) -> Dict[str, Any]:
    return {
        "reportType": _public_report_type(report_type),
        "sections": [],
        "metadata": {},
        "variableBindings": {},
        "protectionRules": {
            "required_block_ids": [],
            "editable_placeholder_by_block": {},
        },
    }


def _parse_template_json(payload: Any, fallback_report_type: Optional[str]) -> TemplateJson:
    if not isinstance(payload, dict):
        payload = {}
    data = dict(payload)
    if not data.get("reportType"):
        data["reportType"] = _public_report_type(fallback_report_type)
    try:
        return TemplateJson(**data)
    except ValidationError:
        return TemplateJson(**_empty_template_json_payload(fallback_report_type))


def get_variable_catalog(report_type: str) -> Dict[str, Dict[str, bool]]:
    return ALLOWED_VARIABLES.get(_canonical_report_type_db(report_type), ALLOWED_VARIABLES[DEFAULT_REPORT_TYPE_DB])


def run_validations(template_json: TemplateJson, role: UserRole) -> ValidationResult:
    structure_result = validateTemplateStructure(template_json)
    vars_result = validateVariables(template_json, get_variable_catalog(template_json.reportType), FILTER_WHITELIST)
    protected_result = validateProtectedBlocks(template_json, role)
    issues = structure_result.issues + vars_result.issues + protected_result.issues
    return ValidationResult(valid=not any(i.level == "error" for i in issues), issues=issues)


def _raise_if_invalid_template(template_json: TemplateJson, role: UserRole) -> ValidationResult:
    validation = run_validations(template_json, role)
    if validation.valid:
        return validation

    error_messages = [issue.message for issue in validation.issues if issue.level == "error"]
    detail = "; ".join(error_messages[:3]) or "Template validation failed"
    raise ValueError(f"Validacion de plantilla fallida: {detail}")


def _sanitize_and_compile(template_json: TemplateJson) -> Tuple[TemplateJson, str]:
    sanitized = template_json.model_copy(deep=True) if hasattr(template_json, "model_copy") else template_json.copy(deep=True)
    for section in sanitized.sections:
        for block in section.blocks:
            block.content = sanitizeHtml(block.content)
    compiled = compileTemplateJsonToJinja(sanitized)
    return sanitized, compiled


class SupabaseTemplateStore:
    def __init__(self, client: Optional[Any] = None):
        self.client = client or SupabaseTemplateClient()

    def _editor_json_path(self, template_id: str, version_number: int) -> str:
        return f"template-editor/{template_id}/v{version_number}/editor.json"

    def _compiled_html_path(self, template_id: str, version_number: int) -> str:
        return f"template-editor/{template_id}/v{version_number}/compiled.html"

    def _draft_editor_json_path(self, template_id: str) -> str:
        return f"template-editor/{template_id}/draft/editor.json"

    def _draft_compiled_html_path(self, template_id: str) -> str:
        return f"template-editor/{template_id}/draft/compiled.html"

    def _load_assets_from_paths(
        self,
        editor_json_path: Optional[str],
        compiled_html_path: Optional[str],
        fallback_report_type: Optional[str],
    ) -> Tuple[TemplateJson, str]:
        template_payload: Dict[str, Any] = {}
        compiled_from_editor_json = ""
        if editor_json_path:
            raw_editor = self.client.download_text(str(editor_json_path))
            if raw_editor:
                try:
                    parsed_editor = json.loads(raw_editor)
                except Exception:
                    parsed_editor = {}
                if isinstance(parsed_editor, dict):
                    if isinstance(parsed_editor.get("templateJson"), dict):
                        template_payload = parsed_editor["templateJson"]
                    elif "reportType" in parsed_editor:
                        template_payload = parsed_editor
                    compiled_value = parsed_editor.get("compiledJinja")
                    if isinstance(compiled_value, str):
                        compiled_from_editor_json = compiled_value

        compiled_html = ""
        if compiled_html_path:
            compiled_html = self.client.download_text(str(compiled_html_path)) or ""
        if not compiled_html:
            compiled_html = compiled_from_editor_json

        return _parse_template_json(template_payload, fallback_report_type), compiled_html

    def _upload_version_assets(
        self,
        template_id: str,
        version_number: int,
        template_json: TemplateJson,
        compiled_html: str,
    ) -> Dict[str, str]:
        editor_json_path = self._editor_json_path(template_id, version_number)
        compiled_html_path = self._compiled_html_path(template_id, version_number)
        editor_payload = json.dumps(
            {"templateJson": _template_json_to_dict(template_json)},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        self.client.upload_text(editor_json_path, editor_payload, "application/json; charset=utf-8")
        self.client.upload_text(compiled_html_path, compiled_html, "text/html; charset=utf-8")
        checksum = hashlib.sha256((editor_payload + "\n" + compiled_html).encode("utf-8")).hexdigest()
        return {
            "editor_json_path": editor_json_path,
            "compiled_html_path": compiled_html_path,
            "checksum": checksum,
        }

    def _upload_draft_assets(
        self,
        template_id: str,
        template_json: TemplateJson,
        compiled_html: str,
    ) -> Dict[str, str]:
        editor_json_path = self._draft_editor_json_path(template_id)
        compiled_html_path = self._draft_compiled_html_path(template_id)
        editor_payload = json.dumps(
            {"templateJson": _template_json_to_dict(template_json)},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        self.client.upload_text(editor_json_path, editor_payload, "application/json; charset=utf-8")
        self.client.upload_text(compiled_html_path, compiled_html, "text/html; charset=utf-8")
        checksum = hashlib.sha256((editor_payload + "\n" + compiled_html).encode("utf-8")).hexdigest()
        return {
            "editor_json_path": editor_json_path,
            "compiled_html_path": compiled_html_path,
            "checksum": checksum,
        }

    def _load_version_assets(
        self,
        version_row: Dict[str, Any],
        fallback_report_type: Optional[str],
    ) -> Tuple[TemplateJson, str]:
        return self._load_assets_from_paths(
            version_row.get("editor_json_path"),
            version_row.get("compiled_html_path"),
            fallback_report_type,
        )

    def _load_draft_assets(
        self,
        template_id: str,
        fallback_report_type: Optional[str],
    ) -> Tuple[TemplateJson, str]:
        return self._load_assets_from_paths(
            self._draft_editor_json_path(template_id),
            self._draft_compiled_html_path(template_id),
            fallback_report_type,
        )

    def _version_status(
        self,
        version_number: int,
        current_version: int,
        template_status: str,
        version_row: Dict[str, Any],
    ) -> str:
        if version_number == current_version:
            if template_status in ALLOWED_TEMPLATE_STATUS:
                return template_status
            return "draft"
        if version_row.get("published_at"):
            return "published"
        return "draft"

    def _build_versions(self, template_row: Dict[str, Any]) -> List[TemplateVersion]:
        template_id = str(template_row.get("id"))
        report_type_db = str(template_row.get("report_type") or DEFAULT_REPORT_TYPE_DB)
        template_status = str(template_row.get("status") or "draft")
        current_version = int(template_row.get("current_version") or template_row.get("version") or 0)
        versions: List[TemplateVersion] = []

        version_rows = self.client.list_template_versions(template_id)
        for version_row in version_rows:
            version_number = int(version_row.get("version_number") or 0)
            template_json, compiled_html = self._load_version_assets(version_row, report_type_db)
            diff_summary: Dict[str, Any] = {}
            if version_row.get("published_at"):
                diff_summary["publishedAt"] = str(version_row.get("published_at"))
            versions.append(
                TemplateVersion(
                    version=version_number,
                    status=self._version_status(version_number, current_version, template_status, version_row),
                    author=str(version_row.get("created_by") or template_row.get("updated_by") or "system"),
                    createdAt=str(version_row.get("created_at") or template_row.get("updated_at") or _now_iso()),
                    templateJson=template_json,
                    compiledJinja=compiled_html,
                    diffSummary=diff_summary,
                )
            )

        if current_version == 0:
            draft_template_json, draft_compiled_html = self._load_draft_assets(template_id, report_type_db)
            has_draft_content = bool(draft_compiled_html) or bool(draft_template_json.sections)
            if has_draft_content or template_status == "draft":
                versions.append(
                    TemplateVersion(
                        version=0,
                        status=template_status if template_status in ALLOWED_TEMPLATE_STATUS else "draft",
                        author=str(template_row.get("updated_by") or template_row.get("created_by") or "system"),
                        createdAt=str(template_row.get("updated_at") or _now_iso()),
                        templateJson=draft_template_json,
                        compiledJinja=draft_compiled_html,
                        diffSummary={},
                    )
                )

        if not versions:
            inline_data = template_row.get("data")
            if isinstance(inline_data, dict):
                template_json = _parse_template_json(inline_data.get("templateJson"), report_type_db)
                compiled_html = str(inline_data.get("compiledJinja") or "")
            else:
                template_json = _parse_template_json({}, report_type_db)
                compiled_html = ""
            fallback_version = int(template_row.get("version") or template_row.get("current_version") or 0)
            versions.append(
                TemplateVersion(
                    version=fallback_version,
                    status=template_status if template_status in ALLOWED_TEMPLATE_STATUS else "draft",
                    author=str(template_row.get("updated_by") or "system"),
                    createdAt=str(template_row.get("updated_at") or _now_iso()),
                    templateJson=template_json,
                    compiledJinja=compiled_html,
                    diffSummary={},
                )
            )

        versions.sort(key=lambda item: int(item.version))
        current_idx = next((idx for idx, item in enumerate(versions) if int(item.version) == current_version), None)
        if current_idx is not None and current_idx != len(versions) - 1:
            current = versions.pop(current_idx)
            versions.append(current)
        return versions

    def _build_record(self, template_row: Dict[str, Any]) -> TemplateEditorRecord:
        status = str(template_row.get("status") or "draft")
        if status not in ALLOWED_TEMPLATE_STATUS:
            status = "draft"
        report_type_db = str(template_row.get("report_type") or DEFAULT_REPORT_TYPE_DB)
        versions = self._build_versions(template_row)
        current_version = int(template_row.get("current_version") or template_row.get("version") or 0)
        return TemplateEditorRecord(
            id=str(template_row["id"]),
            name=str(template_row.get("name") or "Unnamed Template"),
            reportType=_public_report_type(report_type_db),
            status=status,
            currentVersion=current_version,
            createdAt=str(template_row.get("created_at") or _now_iso()),
            updatedAt=str(template_row.get("updated_at") or _now_iso()),
            createdBy=str(template_row.get("created_by") or "system"),
            updatedBy=str(template_row.get("updated_by") or "system"),
            featureFlag=True,
            versions=versions,
        )

    def _create_version(
        self,
        template_id: str,
        version_number: int,
        template_json: TemplateJson,
        compiled_html: str,
        author: str,
        change_note: Optional[str] = None,
    ) -> Dict[str, Any]:
        assets = self._upload_version_assets(template_id, version_number, template_json, compiled_html)
        payload = {
            "template_id": template_id,
            "version_number": version_number,
            "schema_version": 1,
            "editor_json_path": assets["editor_json_path"],
            "compiled_html_path": assets["compiled_html_path"],
            "checksum": assets["checksum"],
            "created_by": author,
        }
        if change_note:
            payload["change_note"] = change_note
        return self.client.insert_template_version(payload)

    def _promote_draft_to_version(
        self,
        template_id: str,
        version_number: int,
        author: str,
        change_note: Optional[str] = None,
    ) -> Dict[str, Any]:
        draft_editor = self._draft_editor_json_path(template_id)
        draft_compiled = self._draft_compiled_html_path(template_id)
        version_editor = self._editor_json_path(template_id, version_number)
        version_compiled = self._compiled_html_path(template_id, version_number)

        copied = False
        if hasattr(self.client, "copy_object"):
            try:
                self.client.copy_object(draft_editor, version_editor, "application/json; charset=utf-8")
                self.client.copy_object(draft_compiled, version_compiled, "text/html; charset=utf-8")
                copied = True
            except Exception:
                copied = False

        if not copied:
            editor_payload = self.client.download_text(draft_editor)
            compiled_payload = self.client.download_text(draft_compiled)
            if editor_payload is None or compiled_payload is None:
                raise ValueError("Contenido del borrador de plantilla no encontrado")
            self.client.upload_text(version_editor, editor_payload, "application/json; charset=utf-8")
            self.client.upload_text(version_compiled, compiled_payload, "text/html; charset=utf-8")

        editor_payload = self.client.download_text(version_editor) or ""
        compiled_payload = self.client.download_text(version_compiled) or ""
        checksum = hashlib.sha256((editor_payload + "\n" + compiled_payload).encode("utf-8")).hexdigest()
        payload = {
            "template_id": template_id,
            "version_number": version_number,
            "schema_version": 1,
            "editor_json_path": version_editor,
            "compiled_html_path": version_compiled,
            "checksum": checksum,
            "created_by": author,
        }
        if change_note:
            payload["change_note"] = change_note
        return self.client.insert_template_version(payload)

    def create_template(
        self,
        name: str,
        report_type: str,
        template_json: TemplateJson,
        author: str,
        feature_flag: bool = False,
    ) -> TemplateEditorRecord:
        _ = feature_flag
        _raise_if_invalid_template(template_json, role="editor")
        sanitized, compiled = _sanitize_and_compile(template_json)
        report_type_db = _canonical_report_type_db(report_type or sanitized.reportType)
        created_row = self.client.create_template(
            {
                "name": name,
                "report_type": report_type_db,
                "status": "draft",
                "current_version": 0,
                "created_by": author,
                "updated_by": author,
            }
        )
        template_id = str(created_row["id"])
        self._upload_draft_assets(template_id, sanitized, compiled)
        refreshed = self.client.update_template(
            template_id,
            {
                "current_version": 0,
                "status": "draft",
                "updated_by": author,
                "updated_at": _now_iso(),
            },
        )
        return self._build_record(refreshed)

    def get_template(self, template_id: str) -> Optional[TemplateEditorRecord]:
        row = self.client.get_template(template_id)
        if not row:
            return None
        return self._build_record(row)

    def update_template(
        self,
        template_id: str,
        template_json: TemplateJson,
        author: str,
        role: UserRole,
    ) -> Tuple[TemplateEditorRecord, ValidationResult]:
        row = self.client.get_template(template_id)
        if not row:
            raise ValueError("Plantilla no encontrada")

        validation = _raise_if_invalid_template(template_json, role)
        sanitized, compiled = _sanitize_and_compile(template_json)
        current_version = int(row.get("current_version") or 0)

        if current_version == 0:
            self._upload_draft_assets(template_id, sanitized, compiled)
            updated_row = self.client.update_template(
                template_id,
                {
                    "report_type": _canonical_report_type_db(sanitized.reportType or row.get("report_type")),
                    "current_version": 0,
                    "status": "draft",
                    "updated_by": author,
                    "updated_at": _now_iso(),
                },
            )
        else:
            next_version = current_version + 1
            self._create_version(template_id, next_version, sanitized, compiled, author, change_note="draft update")
            updated_row = self.client.update_template(
                template_id,
                {
                    "report_type": _canonical_report_type_db(sanitized.reportType or row.get("report_type")),
                    "current_version": next_version,
                    "status": "draft",
                    "updated_by": author,
                    "updated_at": _now_iso(),
                },
            )
        return self._build_record(updated_row), validation

    def publish_template(self, template_id: str, author: str) -> TemplateEditorRecord:
        row = self.client.get_template(template_id)
        if not row:
            raise ValueError("Plantilla no encontrada")
        current_version = int(row.get("current_version") or 0)
        current_status = str(row.get("status") or "draft")
        if current_status == "published":
            return self._build_record(row)

        update_payload: Dict[str, Any] = {
            "status": "published",
            "updated_by": author,
            "updated_at": _now_iso(),
        }
        if current_version == 0:
            self._promote_draft_to_version(template_id, 1, author, change_note="first publish from draft")
            update_payload["current_version"] = 1

        updated_row = self.client.update_template(
            template_id,
            update_payload,
        )
        return self._build_record(updated_row)

    def delete_template(self, template_id: str, author: str) -> TemplateEditorRecord:
        row = self.client.get_template(template_id)
        if not row:
            raise ValueError("Plantilla no encontrada")
        updated_row = self.client.update_template(
            template_id,
            {
                "status": "archived",
                "updated_by": author,
                "updated_at": _now_iso(),
            },
        )
        return self._build_record(updated_row)

    def list_editor_templates(self) -> List[Dict[str, str]]:
        if hasattr(self.client, "list_templates"):
            rows = self.client.list_templates()
        else:
            rows = list(getattr(self.client, "templates", {}).values())
        out: List[Dict[str, str]] = []
        for row in rows:
            status = str(row.get("status") or "draft")
            if status == "archived":
                continue
            out.append(
                {
                    "id": str(row.get("id")),
                    "name": str(row.get("name") or "Unnamed Template"),
                    "status": status,
                    "updatedAt": str(row.get("updated_at") or ""),
                }
            )
        return sorted(out, key=lambda item: str(item.get("updatedAt", "")), reverse=True)

    def list_published_templates(self) -> List[Dict[str, str]]:
        rows = self.client.list_published_templates()
        out: List[Dict[str, str]] = []
        for row in rows:
            out.append(
                {
                    "id": str(row.get("id")),
                    "name": str(row.get("name") or "Unnamed Template"),
                    "status": "published",
                    "updatedAt": str(row.get("updated_at") or ""),
                }
            )
        return sorted(out, key=lambda item: str(item.get("updatedAt", "")), reverse=True)

    def get_preview_html(self, template_id: str) -> Optional[str]:
        record = self.get_template(template_id)
        if not record or not record.versions:
            return None
        current = next((v for v in record.versions if int(v.version) == int(record.currentVersion)), None)  # pyre-ignore[16]
        if not current:
            current = record.versions[-1]  # pyre-ignore[16]

        # For canvas templates, always re-compile from templateJson to ensure
        # the output matches the frontend's exportToJinja2().  This fixes
        # templates whose stored compiledJinja was generated by the old
        # compiler that lacked absolute positioning for some element types.
        if current.templateJson:
            try:
                if _has_canvas_layout(current.templateJson):
                    return _compile_canvas_template(current.templateJson)
            except Exception:
                pass  # fall through to stored compiled HTML

        if current.compiledJinja:
            return current.compiledJinja
        return record.versions[-1].compiledJinja  # pyre-ignore[16]

    def rollback_template(self, template_id: str, target_version: Optional[int], author: str) -> TemplateEditorRecord:
        row = self.client.get_template(template_id)
        if not row:
            raise ValueError("Plantilla no encontrada")

        version_rows = self.client.list_template_versions(template_id)
        available_versions = sorted({int(v.get("version_number") or 0) for v in version_rows})
        if not available_versions:
            raise ValueError("La plantilla no tiene versiones almacenadas")

        if target_version is None:
            version_to_restore = int(row.get("current_version") or available_versions[-1])
            if version_to_restore not in available_versions:
                version_to_restore = available_versions[-1]
        else:
            version_to_restore = int(target_version)
            if version_to_restore not in available_versions:
                raise ValueError("Versión objetivo no encontrada")

        updated_row = self.client.update_template(
            template_id,
            {
                "current_version": version_to_restore,
                "status": "published",
                "updated_by": author,
                "updated_at": _now_iso(),
            },
        )
        return self._build_record(updated_row)

    def get_published_template_by_name(self, template_name: str) -> Optional[str]:
        rows = self.client.list_templates_by_name(template_name, status="published")
        if not rows:
            return None
        row = rows[0]
        template_id = str(row.get("id"))
        current_version = int(row.get("current_version") or 0)

        # Keep PDF generation aligned with preview rendering:
        # for canvas templates, always compile from templateJson so older
        # stored compiledJinja versions do not keep legacy photo-grid CSS.
        try:
            record = self.get_template(template_id)
            if record and record.versions:
                current = next(
                    (v for v in record.versions if int(v.version) == int(record.currentVersion)),
                    None,
                ) or record.versions[-1]
                if current.templateJson and _has_canvas_layout(current.templateJson):
                    return _compile_canvas_template(current.templateJson)
        except Exception:
            pass

        if current_version >= 0:
            version_row = self.client.get_template_version(template_id, current_version)
            if version_row:
                _, compiled = self._load_version_assets(version_row, row.get("report_type"))
                if compiled:
                    return compiled

        fallback_versions = self.client.list_template_versions(template_id)
        fallback_versions.sort(key=lambda item: int(item.get("version_number") or 0), reverse=True)
        for version_row in fallback_versions:
            _, compiled = self._load_version_assets(version_row, row.get("report_type"))  # pyre-ignore[16]
            if compiled:
                return compiled

        inline_data = row.get("data")  # pyre-ignore[16]
        if isinstance(inline_data, dict):
            compiled = inline_data.get("compiledJinja")
            if isinstance(compiled, str):
                return compiled
        return None

    def set_template_status(self, template_id: str, status: str, author: str) -> TemplateEditorRecord:
        normalized_status = str(status or "").lower()
        if normalized_status not in ALLOWED_TEMPLATE_STATUS:
            raise ValueError("Estado inválido")
        if normalized_status == "published":
            return self.publish_template(template_id, author)
        row = self.client.get_template(template_id)
        if not row:
            raise ValueError("Plantilla no encontrada")
        updated_row = self.client.update_template(
            template_id,
            {
                "status": normalized_status,
                "updated_by": author,
                "updated_at": _now_iso(),
            },
        )
        return self._build_record(updated_row)


_STORE_LOCK = threading.Lock()
_STORE: Optional[SupabaseTemplateStore] = None


class InMemoryTemplateClient:
    """Minimal persistence backend used when Supabase is not configured."""

    def __init__(self):
        self.templates: Dict[str, Dict[str, Any]] = {}
        self.template_versions: List[Dict[str, Any]] = []
        self.storage: Dict[str, str] = {}

    def _copy(self, payload: Any) -> Any:
        return json.loads(json.dumps(payload))

    def create_template(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        row = {"id": str(uuid4()), **payload}
        self.templates[row["id"]] = row
        return self._copy(row)

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        row = self.templates.get(template_id)
        return self._copy(row) if row else None

    def update_template(self, template_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if template_id not in self.templates:
            raise ValueError("Plantilla no encontrada")
        self.templates[template_id] = {**self.templates[template_id], **payload}
        return self._copy(self.templates[template_id])

    def list_templates(self) -> List[Dict[str, Any]]:
        rows = [self._copy(row) for row in self.templates.values()]
        rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
        return rows

    def list_templates_by_name(self, name: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for row in self.templates.values():
            if row.get("name") != name:
                continue
            if status is not None and row.get("status") != status:
                continue
            rows.append(self._copy(row))
        rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
        return rows

    def list_published_templates(self) -> List[Dict[str, Any]]:
        rows = [self._copy(row) for row in self.templates.values() if row.get("status") == "published"]
        rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
        return rows

    def list_template_versions(self, template_id: str) -> List[Dict[str, Any]]:
        rows = [row for row in self.template_versions if row.get("template_id") == template_id]
        rows.sort(key=lambda item: int(item.get("version_number") or 0))
        return self._copy(rows)

    def get_template_version(self, template_id: str, version_number: int) -> Optional[Dict[str, Any]]:
        for row in self.template_versions:
            if row.get("template_id") == template_id and int(row.get("version_number") or 0) == int(version_number):
                return self._copy(row)
        return None

    def insert_template_version(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        existing = self.get_template_version(str(payload.get("template_id")), int(payload.get("version_number") or 0))
        if existing:
            raise RuntimeError("La clave duplicada viola la restricción de unicidad")
        self.template_versions.append(self._copy(payload))
        return self._copy(payload)

    def upload_text(self, path: str, content: str, content_type: str) -> None:
        _ = content_type
        self.storage[path] = content

    def download_text(self, path: str) -> Optional[str]:
        return self.storage.get(path)

    def copy_object(self, source_path: str, target_path: str, content_type: str) -> None:
        _ = content_type
        if source_path not in self.storage:
            raise RuntimeError("Objeto fuente no encontrado")
        self.storage[target_path] = self.storage[source_path]


def _get_store(required: bool = False) -> Optional[SupabaseTemplateStore]:
    global _STORE
    if _STORE is None:
        with _STORE_LOCK:
            if _STORE is None:
                _STORE = SupabaseTemplateStore() if is_supabase_enabled() else SupabaseTemplateStore(InMemoryTemplateClient())
    if required and _STORE is None:
        raise ValueError("Supabase no configurado")
    return _STORE


def create_template(name: str, report_type: str, template_json: TemplateJson, author: str, feature_flag: bool = False) -> TemplateEditorRecord:
    store = _get_store(required=True)
    assert store is not None
    return store.create_template(name, report_type, template_json, author, feature_flag=feature_flag)


def get_template(template_id: str) -> Optional[TemplateEditorRecord]:
    store = _get_store(required=False)
    if store is None:
        return None
    return store.get_template(template_id)


def update_template(template_id: str, template_json: TemplateJson, author: str, role: UserRole) -> Tuple[TemplateEditorRecord, ValidationResult]:
    store = _get_store(required=True)
    assert store is not None
    return store.update_template(template_id, template_json, author, role)


def publish_template(template_id: str, author: str) -> TemplateEditorRecord:
    store = _get_store(required=True)
    assert store is not None
    return store.publish_template(template_id, author)


def delete_template(template_id: str, author: str) -> TemplateEditorRecord:
    store = _get_store(required=True)
    assert store is not None
    return store.delete_template(template_id, author)


def get_all_editor_templates() -> List[Dict[str, str]]:
    store = _get_store(required=False)
    if store is None:
        return []
    return store.list_editor_templates()


def get_all_published_templates() -> List[Dict[str, str]]:
    store = _get_store(required=False)
    if store is None:
        return []
    return store.list_published_templates()


def get_preview_html(template_id: str) -> Optional[str]:
    store = _get_store(required=False)
    if store is None:
        return None
    return store.get_preview_html(template_id)


def rollback_template(template_id: str, target_version: Optional[int], author: str) -> TemplateEditorRecord:
    store = _get_store(required=True)
    assert store is not None
    return store.rollback_template(template_id, target_version, author)


def get_published_template_by_name(template_name: str) -> Optional[str]:
    store = _get_store(required=False)
    if store is None:
        return None
    return store.get_published_template_by_name(template_name)


def set_template_status(template_id: str, status: str, author: str) -> TemplateEditorRecord:
    store = _get_store(required=True)
    assert store is not None
    return store.set_template_status(template_id, status, author)
