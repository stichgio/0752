"""
Integration tests for PDF Tools and DB endpoints using FastAPI TestClient.
"""
import json
import io
import os
import sys
import pytest  # pyre-ignore[21]
from docx import Document  # type: ignore

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # pyre-ignore[21]
from main import app  # pyre-ignore[21]
from ocr_tools import router as ocr_router  # pyre-ignore[21]

client = TestClient(app)


def _make_blank_pdf(pages=1) -> bytes:
    """Create a minimal valid PDF with N blank pages."""
    from pypdf import PdfWriter  # pyre-ignore[21]
    buf = io.BytesIO()
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=200, height=200)
    w.write(buf)
    buf.seek(0)
    return buf.read()


# --- PDF Merge Endpoints ---

class TestMergePDFs:
    def test_merge_interleaved_rejects_single_file(self):
        pdf = _make_blank_pdf()
        response = client.post(
            "/api/tools/merge-pdfs",
            files=[("files", ("one.pdf", pdf, "application/pdf"))],
            data={"strict": "false"}
        )
        assert response.status_code == 400

    def test_merge_interleaved_two_pdfs(self):
        pdfs = [_make_blank_pdf() for _ in range(2)]
        response = client.post(
            "/api/tools/merge-pdfs",
            files=[
                ("files", ("a.pdf", pdfs[0], "application/pdf")),
                ("files", ("b.pdf", pdfs[1], "application/pdf")),
            ],
            data={"strict": "false"}
        )
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 0


    def test_merge_interleaved_allows_duplicate_filenames(self):
        pdf_short = _make_blank_pdf(pages=1)
        pdf_long = _make_blank_pdf(pages=2)

        response = client.post(
            "/api/tools/merge-pdfs",
            files=[
                ("files", ("same.pdf", pdf_short, "application/pdf")),
                ("files", ("same.pdf", pdf_long, "application/pdf")),
            ],
            data={"strict": "false"}
        )

        assert response.status_code == 200

        from pypdf import PdfReader  # pyre-ignore[21]
        merged = PdfReader(io.BytesIO(response.content))
        assert len(merged.pages) == 3

    def test_merge_interleaved_rejects_non_pdf_payload(self):
        valid_pdf = _make_blank_pdf()
        response = client.post(
            "/api/tools/merge-pdfs",
            files=[
                ("files", ("a.pdf", valid_pdf, "application/pdf")),
                ("files", ("b.txt", b"not-a-pdf", "text/plain")),
            ],
            data={"strict": "false"}
        )
        assert response.status_code == 400
        assert "no es un PDF válido" in response.json()["detail"]

    def test_merge_normal_rejects_single_file(self):
        pdf = _make_blank_pdf()
        response = client.post(
            "/api/tools/merge-pdfs-normal",
            files=[("files", ("one.pdf", pdf, "application/pdf"))],
        )
        assert response.status_code == 400

    def test_merge_normal_two_pdfs(self):
        pdfs = [_make_blank_pdf() for _ in range(2)]
        response = client.post(
            "/api/tools/merge-pdfs-normal",
            files=[
                ("files", ("a.pdf", pdfs[0], "application/pdf")),
                ("files", ("b.pdf", pdfs[1], "application/pdf")),
            ],
        )
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")

    def test_merge_normal_rejects_non_pdf_payload(self):
        valid_pdf = _make_blank_pdf()
        response = client.post(
            "/api/tools/merge-pdfs-normal",
            files=[
                ("files", ("a.pdf", valid_pdf, "application/pdf")),
                ("files", ("b.txt", b"not-a-pdf", "text/plain")),
            ],
        )
        assert response.status_code == 400
        assert "no es un PDF válido" in response.json()["detail"]


# --- PDF Split Endpoint ---

class TestSplitPDF:
    def test_split_returns_zip(self):
        pdf = _make_blank_pdf(pages=4)
        response = client.post(
            "/api/tools/split-pdf",
            files=[("file", ("test.pdf", pdf, "application/pdf"))],
            data={"mode": "pages", "pages_per_file": "2"}
        )
        assert response.status_code == 200
        ct = response.headers.get("content-type", "")
        assert "application/zip" in ct or "application/x-zip" in ct

    def test_split_single_page_per_file(self):
        pdf = _make_blank_pdf(pages=3)
        response = client.post(
            "/api/tools/split-pdf",
            files=[("file", ("test.pdf", pdf, "application/pdf"))],
            data={"mode": "pages", "pages_per_file": "1"}
        )
        assert response.status_code == 200


class TestOCRTool:
    class _DummyResult:
        def __init__(self, text: str):
            self.text = text
            self.model = "rapidocr-local-free"
            self.pages_processed = 1

    class _DummyOCRService:
        def __init__(self, text: str):
            self.text = text

        async def extract_text(self, **kwargs):
            return TestOCRTool._DummyResult(self.text)

        async def extract_structured(self, **kwargs):
            return TestOCRTool._DummyStructuredResult(
                {
                    "numero_documento": "F001-123",
                    "total": "150.00",
                }
            )

    class _DummyStructuredResult:
        def __init__(self, data):
            self.data = data
            self.model = "rapidocr-local-free"
            self.pages_processed = 1

    def test_ocr_extract_txt(self, monkeypatch):
        monkeypatch.setattr(ocr_router, "_ocr_service", self._DummyOCRService("Linea 1\nLinea 2"))
        pdf = _make_blank_pdf(pages=1)

        response = client.post(
            "/api/tools/ocr-extract",
            files=[("file", ("scan.pdf", pdf, "application/pdf"))],
            data={"output_format": "txt"},
        )

        assert response.status_code == 200
        assert "text/plain" in response.headers.get("content-type", "")
        assert "Linea 1" in response.text

    def test_ocr_extract_docx(self, monkeypatch):
        monkeypatch.setattr(ocr_router, "_ocr_service", self._DummyOCRService("Texto OCR"))
        pdf = _make_blank_pdf(pages=1)

        response = client.post(
            "/api/tools/ocr-extract",
            files=[("file", ("scan.pdf", pdf, "application/pdf"))],
            data={"output_format": "docx"},
        )

        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in response.headers.get("content-type", "")

        doc = Document(io.BytesIO(response.content))
        all_text = "\n".join(p.text for p in doc.paragraphs)
        assert "Texto OCR" in all_text

    def test_ocr_rejects_unsupported_format(self):
        response = client.post(
            "/api/tools/ocr-extract",
            files=[("file", ("notes.txt", b"hola", "text/plain"))],
            data={"output_format": "txt"},
        )

        assert response.status_code == 400
        assert "Formato no soportado" in response.json()["detail"]

    def test_ocr_extract_structured_json(self, monkeypatch):
        monkeypatch.setattr(ocr_router, "_ocr_service", self._DummyOCRService("Texto OCR"))
        pdf = _make_blank_pdf(pages=1)

        response = client.post(
            "/api/tools/ocr-extract-structured",
            files=[("file", ("invoice.pdf", pdf, "application/pdf"))],
            data={"schema_type": "factura", "instructions": "Prioriza total"},
        )

        assert response.status_code == 200
        assert "application/json" in response.headers.get("content-type", "")

        payload = json.loads(response.content.decode("utf-8"))
        assert payload["schema_type"] == "factura"
        assert payload["data"]["numero_documento"] == "F001-123"


# --- Technical Reports DB Endpoints ---

class TestTechnicalReportsEndpoints:
    def test_list_reports(self):
        r = client.get("/api/technical-reports/reports")
        assert r.status_code == 200
        assert "reports" in r.json()

    def test_list_template_variables(self):
        r = client.get("/api/technical-reports/variables")
        assert r.status_code == 200
        payload = r.json()
        assert isinstance(payload, list)
        assert len(payload) > 0
        assert {"key", "label", "category"}.issubset(payload[0].keys())

    def test_get_nonexistent_returns_404(self):
        r = client.get("/api/technical-reports/reports/NONEXISTENT_ID_99999")
        assert r.status_code == 404


# --- Fichas Técnicas DB Endpoints ---

class TestFichasTecnicasEndpoints:
    def test_list_fichas(self):
        r = client.get("/api/fichas-tecnicas/fichas")
        assert r.status_code == 200
        assert "fichas" in r.json()

    def test_get_nonexistent_returns_404(self):
        r = client.get("/api/fichas-tecnicas/fichas/NONEXISTENT_FT_99999")
        assert r.status_code == 404


# --- Template Endpoints ---

class TestTemplateEndpoints:
    def test_list_templates(self):
        r = client.get("/api/templates")
        assert r.status_code == 200
        assert "templates" in r.json()
