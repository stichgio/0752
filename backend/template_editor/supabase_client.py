import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


class SupabaseNotConfiguredError(RuntimeError):
    pass


class SupabaseOperationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SupabaseSettings:
    url: str
    service_role_key: str
    bucket: str


def load_supabase_settings() -> Optional[SupabaseSettings]:
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    bucket = (os.getenv("TEMPLATE_STORAGE_BUCKET") or "template-assets").strip() or "template-assets"
    if not url or not key:
        return None
    return SupabaseSettings(url=url, service_role_key=key, bucket=bucket)


def is_supabase_enabled() -> bool:
    return load_supabase_settings() is not None


class SupabaseTemplateClient:
    def __init__(self, settings: Optional[SupabaseSettings] = None):
        self._settings = settings or load_supabase_settings()
        if self._settings is None:
            raise SupabaseNotConfiguredError("Se requieren SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")

        try:
            from supabase import create_client  # type: ignore
        except Exception as exc:  # pragma: no cover - depends on runtime env
            raise SupabaseOperationError(
                "El paquete supabase no está instalado. Agréguelo a requirements antes de habilitar la persistencia con Supabase."
            ) from exc

        self._client = create_client(self._settings.url, self._settings.service_role_key)
        self._bucket = self._settings.bucket

    @property
    def bucket(self) -> str:
        return self._bucket

    def _first(self, response: Any) -> Optional[Dict[str, Any]]:
        data = getattr(response, "data", None)
        if isinstance(data, dict):
            return data
        if isinstance(data, list) and data:
            first = data[0]
            return first if isinstance(first, dict) else None
        return None

    def _as_list(self, response: Any) -> List[Dict[str, Any]]:
        data = getattr(response, "data", None)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        if isinstance(data, dict):
            return [data]
        return []

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        response = (
            self._client.table("templates")
            .select("*")
            .eq("id", template_id)
            .limit(1)
            .execute()
        )
        return self._first(response)

    def get_template_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        response = (
            self._client.table("templates")
            .select("*")
            .eq("name", name)
            .limit(1)
            .execute()
        )
        return self._first(response)

    def list_templates_by_name(self, name: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        query = self._client.table("templates").select("*").eq("name", name)
        if status:
            query = query.eq("status", status)
        response = query.order("updated_at", desc=True).execute()
        return self._as_list(response)

    def list_templates(self) -> List[Dict[str, Any]]:
        response = (
            self._client.table("templates")
            .select("*")
            .order("updated_at", desc=True)
            .execute()
        )
        return self._as_list(response)

    def create_template(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        response = self._client.table("templates").insert(payload).execute()
        row = self._first(response)
        if not row:
            raise SupabaseOperationError("La inserción en Supabase en templates devolvió una respuesta vacía")
        return row

    def update_template(self, template_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        response = self._client.table("templates").update(payload).eq("id", template_id).execute()
        row = self._first(response)
        if not row:
            row = self.get_template(template_id)
        if not row:
            raise SupabaseOperationError("La actualización en Supabase en templates no devolvió la fila actualizada")
        return row

    def list_published_templates(self) -> List[Dict[str, Any]]:
        response = (
            self._client.table("templates")
            .select("*")
            .eq("status", "published")
            .order("updated_at", desc=True)
            .execute()
        )
        return self._as_list(response)

    def list_template_versions(self, template_id: str) -> List[Dict[str, Any]]:
        response = (
            self._client.table("template_versions")
            .select("*")
            .eq("template_id", template_id)
            .order("version_number", desc=False)
            .execute()
        )
        return self._as_list(response)

    def get_template_version(self, template_id: str, version_number: int) -> Optional[Dict[str, Any]]:
        response = (
            self._client.table("template_versions")
            .select("*")
            .eq("template_id", template_id)
            .eq("version_number", version_number)
            .limit(1)
            .execute()
        )
        return self._first(response)

    def insert_template_version(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        response = self._client.table("template_versions").insert(payload).execute()
        row = self._first(response)
        if not row:
            raise SupabaseOperationError("La inserción en Supabase en template_versions devolvió una respuesta vacía")
        return row

    def _storage(self):
        return self._client.storage.from_(self._bucket)

    def upload_bytes(self, path: str, content: bytes, content_type: str) -> None:
        bucket = self._storage()
        try:
            bucket.remove([path])
        except Exception:
            pass

        try:
            bucket.upload(path, content, {"content-type": content_type})
        except TypeError:
            bucket.upload(path, content)
        except Exception as exc:
            raise SupabaseOperationError(f"Error al subir objeto de almacenamiento '{path}': {exc}") from exc

    def upload_text(self, path: str, content: str, content_type: str) -> None:
        self.upload_bytes(path, content.encode("utf-8"), content_type)

    def download_bytes(self, path: str) -> Optional[bytes]:
        bucket = self._storage()
        try:
            payload = bucket.download(path)
        except Exception:
            return None
        if payload is None:
            return None
        if isinstance(payload, bytes):
            return payload
        if isinstance(payload, str):
            return payload.encode("utf-8")
        return bytes(payload)

    def download_text(self, path: str) -> Optional[str]:
        payload = self.download_bytes(path)
        if payload is None:
            return None
        try:
            return payload.decode("utf-8")
        except Exception:
            return None

    def copy_object(self, source_path: str, target_path: str, content_type: str) -> None:
        bucket = self._storage()
        try:
            bucket.copy(source_path, target_path)
            return
        except Exception:
            content = self.download_bytes(source_path)
            if content is None:
                raise SupabaseOperationError(f"No se puede copiar '{source_path}' porque el objeto fuente no existe")
            self.upload_bytes(target_path, content, content_type)
