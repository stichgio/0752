"""
# -*- coding: utf-8 -*-
Integration tests for PDF Tools and DB endpoints using FastAPI TestClient.
"""
import json
import io
import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _make_blank_pdf(pages=1) -> bytes:
    """Create a minimal valid PDF with N blank pages."""
    from pypdf import PdfWriter
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

        from pypdf import PdfReader
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
        assert "no es un PDF vÃ¡lido" in response.json()["detail"]

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
        assert "no es un PDF vÃ¡lido" in response.json()["detail"]


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


class TestOrganizeAndExtractPDF:
    def test_split_rejects_non_pdf_payload(self):
        response = client.post(
            "/api/tools/split-pdf",
            files=[("file", ("bad.txt", b"not-a-pdf", "text/plain"))],
            data={"mode": "pages", "pages_per_file": "1"}
        )
        assert response.status_code == 400

    def test_organize_rejects_non_pdf_payload(self):
        response = client.post(
            "/api/tools/organize-pdf",
            files=[("file", ("bad.txt", b"not-a-pdf", "text/plain"))],
            data={"operations": json.dumps({"pageOrder": [1], "rotations": [0], "cuts": []})}
        )
        assert response.status_code == 400

    def test_extract_rejects_non_pdf_payload(self):
        response = client.post(
            "/api/tools/extract-pages",
            files=[("file", ("bad.txt", b"not-a-pdf", "text/plain"))],
            data={"pages": json.dumps([1])}
        )
        assert response.status_code == 400

    def test_extract_rejects_invalid_page_type(self):
        pdf = _make_blank_pdf(pages=2)
        response = client.post(
            "/api/tools/extract-pages",
            files=[("file", ("ok.pdf", pdf, "application/pdf"))],
            data={"pages": json.dumps(["A"])},
        )
        assert response.status_code == 400

    def test_extract_accepts_numeric_string_pages(self):
        pdf = _make_blank_pdf(pages=2)
        response = client.post(
            "/api/tools/extract-pages",
            files=[("file", ("ok.pdf", pdf, "application/pdf"))],
            data={"pages": json.dumps(["1", "2"])},
        )
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")



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


# --- Fichas TÃ©cnicas DB Endpoints ---

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

    def test_list_templates_recovers_when_editor_templates_backend_fails(self, monkeypatch):
        monkeypatch.setattr("main.get_all_published_templates", lambda: (_ for _ in ()).throw(RuntimeError("supabase down")))
        r = client.get("/api/templates")
        assert r.status_code == 200
        assert r.json()["editorTemplates"] == []

