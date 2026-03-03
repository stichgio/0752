from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Dict, List, Optional

import httpx

from config import settings  # type: ignore


class OCRServiceError(RuntimeError):
    """Base OCR service error."""


class OCRConfigurationError(OCRServiceError):
    """Raised when OCR service credentials are missing or invalid."""


@dataclass
class OCRResult:
    text: str
    model: str
    pages_processed: int


@dataclass
class OCRStructuredResult:
    data: Any
    model: str
    pages_processed: int


def _extract_error_message(response: httpx.Response) -> str:
    default_message = f"Error del proveedor OCR ({response.status_code})"
    try:
        payload = response.json()
    except Exception:
        body = response.text.strip()
        return body or default_message

    if isinstance(payload, dict):
        for key in ("message", "detail", "error"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value
            if isinstance(value, dict):
                nested = value.get("message") or value.get("detail")
                if isinstance(nested, str) and nested.strip():
                    return nested
    return default_message


class MistralOCRService:
    def __init__(self) -> None:
        self.api_base = settings.mistral_api_base.rstrip("/")
        self.api_key = settings.mistral_api_key.strip()
        self.model = settings.mistral_ocr_model.strip() or "mistral-ocr-latest"
        self.timeout_seconds = max(20, int(settings.ocr_request_timeout_seconds))

    def _auth_headers(self) -> Dict[str, str]:
        if not self.api_key:
            raise OCRConfigurationError(
                "OCR no configurado: define MISTRAL_API_KEY en variables de entorno"
            )
        return {"Authorization": f"Bearer {self.api_key}"}

    @staticmethod
    def _extract_pages_text(ocr_result: Dict[str, Any]) -> List[str]:
        pages = ocr_result.get("pages")
        extracted_pages: List[str] = []
        if isinstance(pages, list):
            for page in pages:
                if isinstance(page, dict):
                    markdown = page.get("markdown")
                    if isinstance(markdown, str) and markdown.strip():
                        extracted_pages.append(markdown.strip())
        return extracted_pages

    @staticmethod
    def _extract_usage_pages(ocr_result: Dict[str, Any], fallback_count: int) -> int:
        usage_info = ocr_result.get("usage_info")
        pages_processed = 0
        if isinstance(usage_info, dict):
            value = usage_info.get("pages_processed")
            if isinstance(value, int):
                pages_processed = value
        return max(pages_processed, fallback_count)

    def _extract_model_name(self, ocr_result: Dict[str, Any]) -> str:
        model_name = ocr_result.get("model")
        if not isinstance(model_name, str) or not model_name:
            model_name = self.model
        return model_name

    async def _run_ocr(
        self,
        *,
        file_bytes: bytes,
        filename: str,
        content_type: str,
        extra_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        headers = self._auth_headers()
        upload_url = f"{self.api_base}/v1/files"
        ocr_url = f"{self.api_base}/v1/ocr"

        file_id: Optional[str] = None
        timeout = httpx.Timeout(timeout=self.timeout_seconds, connect=15.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                upload_response = await client.post(
                    upload_url,
                    headers=headers,
                    files={"file": (filename, file_bytes, content_type)},
                )
                if upload_response.status_code >= 400:
                    raise OCRServiceError(_extract_error_message(upload_response))

                upload_payload = upload_response.json()
                if not isinstance(upload_payload, dict):
                    raise OCRServiceError("Respuesta invalida al subir archivo al OCR")

                file_id = upload_payload.get("id")
                if not isinstance(file_id, str) or not file_id:
                    raise OCRServiceError("No se recibio file_id del proveedor OCR")

                ocr_payload: Dict[str, Any] = {
                    "model": self.model,
                    "document": {
                        "type": "file",
                        "file_id": file_id,
                    },
                    "include_image_base64": False,
                }
                if extra_payload:
                    ocr_payload.update(extra_payload)

                ocr_response = await client.post(
                    ocr_url,
                    headers={**headers, "Content-Type": "application/json"},
                    json=ocr_payload,
                )
                if ocr_response.status_code >= 400:
                    raise OCRServiceError(_extract_error_message(ocr_response))

                ocr_result = ocr_response.json()
                if not isinstance(ocr_result, dict):
                    raise OCRServiceError("Respuesta invalida del OCR")
                return ocr_result
            except httpx.TimeoutException:
                raise OCRServiceError("Tiempo de espera agotado al procesar OCR")
            except httpx.HTTPError as exc:
                raise OCRServiceError(f"Error de red con proveedor OCR: {exc}")
            finally:
                if file_id:
                    try:
                        await client.delete(f"{upload_url}/{file_id}", headers=headers)
                    except Exception:
                        pass

    async def extract_text(self, *, file_bytes: bytes, filename: str, content_type: str) -> OCRResult:
        ocr_result = await self._run_ocr(
            file_bytes=file_bytes,
            filename=filename,
            content_type=content_type,
        )

        extracted_pages = self._extract_pages_text(ocr_result)
        full_text = "\n\n".join(extracted_pages).strip()
        if not full_text:
            fallback = ocr_result.get("document_annotation")
            if isinstance(fallback, str):
                full_text = fallback.strip()

        return OCRResult(
            text=full_text,
            model=self._extract_model_name(ocr_result),
            pages_processed=self._extract_usage_pages(ocr_result, len(extracted_pages)),
        )

    async def extract_structured(
        self,
        *,
        file_bytes: bytes,
        filename: str,
        content_type: str,
        schema_name: str,
        schema: Dict[str, Any],
        prompt: Optional[str] = None,
    ) -> OCRStructuredResult:
        extra_payload: Dict[str, Any] = {
            "document_annotation_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "schema": schema,
                    "strict": True,
                },
            }
        }
        if prompt and prompt.strip():
            extra_payload["document_annotation_prompt"] = prompt.strip()

        ocr_result = await self._run_ocr(
            file_bytes=file_bytes,
            filename=filename,
            content_type=content_type,
            extra_payload=extra_payload,
        )

        parsed: Any = {}
        annotation = ocr_result.get("document_annotation")
        if isinstance(annotation, (dict, list)):
            parsed = annotation
        elif isinstance(annotation, str):
            text = annotation.strip()
            if text:
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    parsed = {"raw": text}

        page_count = len(self._extract_pages_text(ocr_result))
        return OCRStructuredResult(
            data=parsed,
            model=self._extract_model_name(ocr_result),
            pages_processed=self._extract_usage_pages(ocr_result, page_count),
        )
