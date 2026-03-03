from __future__ import annotations

from dataclasses import dataclass
import base64
import io
import json
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx  # type: ignore

from config import settings  # type: ignore


class OCRServiceError(RuntimeError):
    """Base OCR service error."""


class OCRConfigurationError(OCRServiceError):
    """Raised when OCR dependencies/configuration are not available."""


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


def _render_pdf_pages_to_png(pdf_bytes: bytes, *, dpi: int, max_pages: int) -> Tuple[List[bytes], int]:
    try:
        import fitz  # type: ignore
    except Exception as exc:
        raise OCRConfigurationError(
            "OCR de PDF no disponible. Instala PyMuPDF para renderizar paginas escaneadas."
        ) from exc

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages_to_process = min(len(doc), max_pages)

    images: List[bytes] = []
    for page_index in range(pages_to_process):
        page = doc.load_page(page_index)
        pix = page.get_pixmap(dpi=dpi, alpha=False)
        images.append(pix.tobytes("png"))
    return images, pages_to_process


class StructuredPostProcessor:
    @staticmethod
    def _first_date(text: str) -> str:
        match = re.search(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", text)
        return match.group(0) if match else ""

    @staticmethod
    def _extract_amounts(text: str) -> List[str]:
        return re.findall(r"\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b", text)

    @staticmethod
    def _safe_line(text: str) -> str:
        for line in text.splitlines():
            clean = line.strip()
            if clean:
                return clean[:140]  # type: ignore
        return ""

    def _structured_general(self, text: str) -> Dict[str, Any]:
        key_values: List[Dict[str, str]] = []
        for line in text.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            k = key.strip()
            v = value.strip()
            if k and v:
                key_values.append({"campo": k[:80], "valor": v[:200]})  # type: ignore
            if len(key_values) >= 20:
                break

        entities = sorted({item["campo"] for item in key_values})[:15]  # type: ignore
        summary = " ".join([ln.strip() for ln in text.splitlines() if ln.strip()][:8])[:800]  # type: ignore

        if not key_values and text.strip():
            key_values.append({"campo": "texto_principal", "valor": text.strip()[:300]})  # type: ignore

        return {
            "titulo": self._safe_line(text),
            "fecha_principal": self._first_date(text),
            "resumen": summary,
            "entidades_clave": entities,
            "valores_clave": key_values,
        }

    def _structured_invoice(self, text: str) -> Dict[str, Any]:
        invoice_match = re.search(
            r"(?:factura|invoice|comprobante|numero|nro|no)\s*(?:de\s*)?(?:[:#-]\s*)?([A-Z0-9-]{3,})",
            text,
            flags=re.IGNORECASE,
        )
        client_match = re.search(r"(?:cliente|bill\s*to)\s*[:\-]\s*(.+)", text, flags=re.IGNORECASE)
        tax_match = re.search(r"(?:igv|iva|tax|impuesto)\s*[:\-]?\s*([\d.,]+)", text, flags=re.IGNORECASE)

        amounts = self._extract_amounts(text)
        subtotal = amounts[-3] if len(amounts) >= 3 else (amounts[0] if amounts else "")
        impuestos = tax_match.group(1) if tax_match else (amounts[-2] if len(amounts) >= 2 else "")
        total = amounts[-1] if amounts else ""

        currency = ""
        upper = text.upper()
        if "USD" in upper or "$" in text:
            currency = "USD"
        elif "EUR" in upper:
            currency = "EUR"
        elif "S/" in text or "PEN" in upper:
            currency = "PEN"

        return {
            "proveedor": self._safe_line(text),
            "cliente": (client_match.group(1).strip()[:160] if client_match else ""),  # type: ignore
            "numero_documento": (invoice_match.group(1).strip() if invoice_match else ""),
            "fecha_emision": self._first_date(text),
            "moneda": currency,
            "subtotal": subtotal,
            "impuestos": impuestos,
            "total": total,
            "items": [],
        }

    def _structured_identity(self, text: str) -> Dict[str, Any]:
        doc_match = re.search(r"\b\d{6,14}[A-Z]?\b", text)
        name_match = re.search(r"(?:nombres?|name)\s*[:\-]\s*(.+)", text, flags=re.IGNORECASE)
        surname_match = re.search(r"(?:apellidos?|surname)\s*[:\-]\s*(.+)", text, flags=re.IGNORECASE)
        address_match = re.search(r"(?:direccion|address)\s*[:\-]\s*(.+)", text, flags=re.IGNORECASE)

        return {
            "tipo_documento": "identidad",
            "numero_documento": (doc_match.group(0) if doc_match else ""),
            "nombres": (name_match.group(1).strip()[:120] if name_match else ""),  # type: ignore
            "apellidos": (surname_match.group(1).strip()[:120] if surname_match else ""),  # type: ignore
            "fecha_nacimiento": "",
            "fecha_emision": self._first_date(text),
            "fecha_vencimiento": "",
            "direccion": (address_match.group(1).strip()[:180] if address_match else ""),  # type: ignore
        }

    def build_structured_data(self, *, schema_name: str, text: str) -> Dict[str, Any]:
        key = (schema_name or "").lower()
        if "factura" in key:
            return self._structured_invoice(text)
        if "identidad" in key:
            return self._structured_identity(text)
        return self._structured_general(text)


class FreeOCRService(StructuredPostProcessor):
    """Free local OCR service based on RapidOCR + PyMuPDF."""

    def __init__(self) -> None:
        self.model = "rapidocr-local-free"
        self.pdf_dpi = max(96, int(settings.ocr_pdf_dpi))
        self.max_pages = max(1, int(settings.ocr_max_pages))
        self._engine: Any = None

    def _get_engine(self) -> Any:
        if self._engine is not None:
            return self._engine

        try:
            from rapidocr_onnxruntime import RapidOCR  # type: ignore
        except Exception as exc:
            raise OCRConfigurationError(
                "OCR local no disponible. Instala rapidocr-onnxruntime y sus dependencias."
            ) from exc

        self._engine = RapidOCR()
        return self._engine

    @staticmethod
    def _normalize_ocr_lines(result: Any) -> List[str]:
        lines: List[str] = []
        if not isinstance(result, list):
            return lines

        for row in result:
            if isinstance(row, (list, tuple)) and len(row) >= 2:
                text = row[1]
                if isinstance(text, str) and text.strip():
                    lines.append(text.strip())
        return lines

    def _ocr_image_bytes(self, image_bytes: bytes) -> str:
        try:
            from PIL import Image  # type: ignore
            import numpy as np  # type: ignore
        except Exception as exc:
            raise OCRConfigurationError(
                "OCR local no disponible. Instala Pillow y numpy para procesar imagenes."
            ) from exc

        engine = self._get_engine()

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_array = np.array(image)

        result, _ = engine(image_array)
        return "\n".join(self._normalize_ocr_lines(result)).strip()

    def _ocr_pdf_bytes(self, pdf_bytes: bytes) -> Tuple[str, int]:
        images, pages_to_process = _render_pdf_pages_to_png(
            pdf_bytes,
            dpi=self.pdf_dpi,
            max_pages=self.max_pages,
        )

        page_texts: List[str] = []
        for image_bytes in images:
            text = self._ocr_image_bytes(image_bytes)
            if text:
                page_texts.append(text)

        return "\n\n".join(page_texts).strip(), pages_to_process

    async def extract_text(self, *, file_bytes: bytes, filename: str, content_type: str) -> OCRResult:
        is_pdf = filename.lower().endswith(".pdf") or content_type == "application/pdf"

        if is_pdf:
            text, pages = self._ocr_pdf_bytes(file_bytes)
            return OCRResult(text=text, model=self.model, pages_processed=pages)

        text = self._ocr_image_bytes(file_bytes)
        return OCRResult(text=text, model=self.model, pages_processed=1)

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
        _ = schema
        _ = prompt

        text_result = await self.extract_text(
            file_bytes=file_bytes,
            filename=filename,
            content_type=content_type,
        )
        data = self.build_structured_data(schema_name=schema_name, text=(text_result.text or ""))

        return OCRStructuredResult(
            data=data,
            model=self.model,
            pages_processed=text_result.pages_processed,
        )


class OllamaOCRService(StructuredPostProcessor):
    """Optional OCR backend using local Ollama models (DeepSeek/GLM)."""

    def __init__(self, *, model: str, backend_name: str = "ollama-custom", base_url: str = "") -> None:
        self.model = model.strip()
        self.backend_name = backend_name
        self.base_url = (base_url.strip() or settings.ocr_ollama_base_url).rstrip("/")
        self.timeout_seconds = max(20, int(settings.ocr_request_timeout_seconds))
        self.pdf_dpi = max(96, int(settings.ocr_pdf_dpi))
        self.max_pages = max(1, int(settings.ocr_max_pages))

        if not self.model:
            raise OCRConfigurationError(
                f"Modelo no configurado para backend OCR {backend_name}. Revisa variables OCR_OLLAMA_MODEL_*"
            )

    async def _chat(self, *, prompt: str, images: Optional[List[str]] = None, force_json: bool = False) -> str:
        payload: Dict[str, Any] = {
            "model": self.model,
            "stream": False,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "options": {
                "temperature": 0,
            },
        }

        if images:
            payload["messages"][0]["images"] = images
        if force_json:
            payload["format"] = "json"

        timeout = httpx.Timeout(timeout=self.timeout_seconds, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                response = await client.post(f"{self.base_url}/api/chat", json=payload)
            except httpx.HTTPError as exc:
                raise OCRServiceError(
                    f"No se pudo conectar con Ollama ({self.base_url}). Error: {exc}"
                ) from exc

        if response.status_code >= 400:
            body = response.text.strip()
            raise OCRServiceError(
                f"Ollama devolvio error {response.status_code}: {body or 'sin detalle'}"
            )

        try:
            data = response.json()
        except Exception as exc:
            raise OCRServiceError("Respuesta invalida de Ollama (no es JSON)") from exc

        message = data.get("message") if isinstance(data, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            raise OCRServiceError("Respuesta invalida de Ollama: falta message.content")
        return content.strip()

    async def extract_text(self, *, file_bytes: bytes, filename: str, content_type: str) -> OCRResult:
        is_pdf = filename.lower().endswith(".pdf") or content_type == "application/pdf"

        prompt = (
            "Extrae TODO el texto visible de la imagen de documento. "
            "Devuelve solo texto plano, sin explicaciones."
        )

        if is_pdf:
            images, pages_to_process = _render_pdf_pages_to_png(
                file_bytes,
                dpi=self.pdf_dpi,
                max_pages=self.max_pages,
            )
            page_texts: List[str] = []
            for image_bytes in images:
                b64 = base64.b64encode(image_bytes).decode("ascii")
                page_text = await self._chat(prompt=prompt, images=[b64], force_json=False)
                if page_text:
                    page_texts.append(page_text)

            return OCRResult(
                text="\n\n".join(page_texts).strip(),
                model=f"{self.backend_name}:{self.model}",
                pages_processed=pages_to_process,
            )

        b64 = base64.b64encode(file_bytes).decode("ascii")
        text = await self._chat(prompt=prompt, images=[b64], force_json=False)
        return OCRResult(
            text=text,
            model=f"{self.backend_name}:{self.model}",
            pages_processed=1,
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
        text_result = await self.extract_text(
            file_bytes=file_bytes,
            filename=filename,
            content_type=content_type,
        )

        instruction = (prompt or "Extrae informacion estructurada").strip()
        schema_json = json.dumps(schema, ensure_ascii=True)
        ocr_text = (text_result.text or "")[:25000]  # type: ignore
        model_prompt = (
            f"{instruction}\n\n"
            f"Schema name: {schema_name}\n"
            f"JSON schema:\n{schema_json}\n\n"
            f"OCR text:\n{ocr_text}\n\n"
            "Devuelve solo un JSON valido que siga el esquema."
        )

        parsed: Optional[Dict[str, Any]] = None
        try:
            response_text = await self._chat(prompt=model_prompt, force_json=True)
            candidate = json.loads(response_text)
            if isinstance(candidate, dict):
                parsed = candidate
        except Exception:
            parsed = None

        if parsed is None:
            parsed = self.build_structured_data(schema_name=schema_name, text=(text_result.text or ""))

        return OCRStructuredResult(
            data=parsed,
            model=f"{self.backend_name}:{self.model}",
            pages_processed=text_result.pages_processed,
        )


def create_ocr_service() -> Any:
    backend = settings.ocr_backend.strip().lower()

    if backend in {"rapidocr", "local", "free"}:
        return FreeOCRService()

    if backend in {"ollama-deepseek", "deepseek", "deepseek-ocr"}:
        return OllamaOCRService(
            model=settings.ocr_ollama_model_deepseek,
            backend_name="ollama-deepseek",
        )

    if backend in {"ollama-glm", "glm", "glm-ocr"}:
        return OllamaOCRService(
            model=settings.ocr_ollama_model_glm,
            backend_name="ollama-glm",
        )

    if backend in {"ollama-custom", "custom"}:
        return OllamaOCRService(
            model=settings.ocr_ollama_model_custom,
            backend_name="ollama-custom",
        )

    return FreeOCRService()
