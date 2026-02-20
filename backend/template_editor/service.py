import json
import uuid
import threading
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from pydantic import ValidationError

from core.supabase import supabase
from .compiler import compileTemplateJsonToJinja
from .models import (
    TemplateEditorRecord,
    TemplateJson,
    TemplateVersion,
    UserRole,
    ValidationResult,
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

def get_variable_catalog(report_type: str) -> Dict[str, Dict[str, bool]]:
    if not report_type: report_type = "generic"
    mapped = report_type.replace("-", "_")
    return ALLOWED_VARIABLES.get(mapped, ALLOWED_VARIABLES["generic"])

def run_validations(template_json: TemplateJson, role: UserRole) -> ValidationResult:
    structure_result = validateTemplateStructure(template_json)
    vars_result = validateVariables(template_json, get_variable_catalog(template_json.reportType), FILTER_WHITELIST)
    protected_result = validateProtectedBlocks(template_json, role)
    issues = structure_result.issues + vars_result.issues + protected_result.issues
    return ValidationResult(valid=not any(i.level == "error" for i in issues), issues=issues)

def _sanitize_and_compile(template_json: TemplateJson) -> Tuple[TemplateJson, str]:
    sanitized = template_json.model_copy(deep=True) if hasattr(template_json, "model_copy") else template_json.copy(deep=True)
    for section in sanitized.sections:
        for block in section.blocks:
            block.content = sanitizeHtml(block.content)
    compiled = compileTemplateJsonToJinja(sanitized)
    return sanitized, compiled

def _build_record(row: Dict[str, Any]) -> TemplateEditorRecord:
    data = row.get("data", {})
    t_json = data.get("templateJson", {})
    if not t_json.get("reportType"):
        t_json["reportType"] = "technical-report"
    template_json = TemplateJson(**t_json)
    compiled = data.get("compiledJinja", "")
    
    version = TemplateVersion(
        version=int(row.get("version", 1)),
        status=row.get("status", "draft"),
        author="system",
        createdAt=str(row.get("updated_at", _now_iso())),
        templateJson=template_json,
        compiledJinja=compiled,
        diffSummary={}
    )
    
    return TemplateEditorRecord(
        id=str(row["id"]),
        name=str(row.get("name", "Unnamed Template")),
        reportType=template_json.reportType,
        status=row.get("status", "draft"),
        currentVersion=int(row.get("version", 1)),
        createdAt=str(row.get("created_at", _now_iso())),
        updatedAt=str(row.get("updated_at", _now_iso())),
        createdBy="system",
        updatedBy="system",
        featureFlag=True,
        versions=[version]
    )

def create_template(name: str, report_type: str, template_json: TemplateJson, author: str, feature_flag: bool = False) -> TemplateEditorRecord:
    if supabase is None: raise ValueError("Supabase not configured")
    sanitized, compiled = _sanitize_and_compile(template_json)
    data_payload = {
        "templateJson": sanitized.model_dump() if hasattr(sanitized, "model_dump") else sanitized.dict(),
        "compiledJinja": compiled,
    }
    row_data = {
        "id": str(uuid.uuid4()),
        "name": name,
        "data": data_payload,
        "status": "draft",
        "version": 1,
    }
    res = supabase.table("templates").insert(row_data).execute()
    if not res.data: raise ValueError("Failed to create template")
    return _build_record(res.data[0])

def get_template(template_id: str) -> Optional[TemplateEditorRecord]:
    if supabase is None: return None
    res = supabase.table("templates").select("*").eq("id", template_id).execute()
    if not res.data: return None
    return _build_record(res.data[0])

def update_template(template_id: str, template_json: TemplateJson, author: str, role: UserRole) -> Tuple[TemplateEditorRecord, ValidationResult]:
    if supabase is None: raise ValueError("Supabase not configured")
    val = run_validations(template_json, role)
    sanitized, compiled = _sanitize_and_compile(template_json)
    
    current = get_template(template_id)
    if not current: raise ValueError("Template not found")
    
    data_payload = {
        "templateJson": sanitized.model_dump() if hasattr(sanitized, "model_dump") else sanitized.dict(),
        "compiledJinja": compiled,
    }
    
    new_version = current.currentVersion + 1
    update_data = {
        "data": data_payload,
        "version": new_version,
        "updated_at": _now_iso()
    }
    
    res = supabase.table("templates").update(update_data).eq("id", template_id).execute()
    if not res.data: raise ValueError("Failed to update template")
    return _build_record(res.data[0]), val

def publish_template(template_id: str, author: str) -> TemplateEditorRecord:
    if supabase is None: raise ValueError("Supabase not configured")
    current = get_template(template_id)
    if not current: raise ValueError("Template not found")
    res = supabase.table("templates").update({"status": "published", "updated_at": _now_iso()}).eq("id", template_id).execute()
    if not res.data: raise ValueError("Failed to publish template")
    return _build_record(res.data[0])

def delete_template(template_id: str, author: str) -> TemplateEditorRecord:
    if supabase is None: raise ValueError("Supabase not configured")
    current = get_template(template_id)
    if not current: raise ValueError("Template not found")
    supabase.table("templates").delete().eq("id", template_id).execute()
    current.status = "archived"
    return current

def get_all_editor_templates() -> List[Dict[str, str]]:
    if supabase is None: return []
    res = supabase.table("templates").select("id, name, status, updated_at").execute()
    out = []
    for r in res.data:
        out.append({
            "id": r["id"],
            "name": r["name"],
            "status": r.get("status", "draft"),
            "updatedAt": r.get("updated_at", "")
        })
    return sorted(out, key=lambda x: str(x.get("updatedAt", "")), reverse=True)

def get_all_published_templates() -> List[Dict[str, str]]:
    if supabase is None: return []
    res = supabase.table("templates").select("id, name, status, updated_at").eq("status", "published").execute()
    out = []
    for r in res.data:
        out.append({
            "id": r["id"],
            "name": r["name"],
            "status": "published",
            "updatedAt": r.get("updated_at", "")
        })
    return sorted(out, key=lambda x: str(x.get("updatedAt", "")), reverse=True)

def get_preview_html(template_id: str) -> Optional[str]:
    rec = get_template(template_id)
    if not rec or not rec.versions: return None
    return rec.versions[-1].compiledJinja

def rollback_template(template_id: str, target_version: Optional[int], author: str) -> TemplateEditorRecord:
    if supabase is None: raise ValueError("Supabase not configured")
    res = supabase.table("templates").update({"status": "published", "updated_at": _now_iso()}).eq("id", template_id).execute()
    if not res.data: raise ValueError("Failed to rollback template")
    return _build_record(res.data[0])

def get_published_template_by_name(template_name: str) -> Optional[str]:
    if supabase is None: return None
    res = supabase.table("templates").select("*").eq("name", template_name).eq("status", "published").execute()
    if not res.data: return None
    rec = _build_record(res.data[0])
    if not rec.versions: return None
    return rec.versions[-1].compiledJinja

def set_template_status(template_id: str, status: str, author: str) -> TemplateEditorRecord:
    if supabase is None: raise ValueError("Supabase not configured")
    current = get_template(template_id)
    if not current: raise ValueError("Template not found")
    res = supabase.table("templates").update({"status": status, "updated_at": _now_iso()}).eq("id", template_id).execute()
    if not res.data: raise ValueError("Failed to update template status")
    return _build_record(res.data[0])

