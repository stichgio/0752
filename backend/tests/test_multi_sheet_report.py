import base64
import io
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app
try:
    from msheets import multi_sheet_report
except Exception:
    from routers import multi_sheet_report


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_list_templates_returns_grouped_sections(client, monkeypatch):
    monkeypatch.setattr(
        multi_sheet_report,
        "get_all_published_templates",
        lambda: [
            {"name": "Plantilla Independiente A"},
            {"name": "Plantilla Independiente B"},
            {"name": "Grilla de Imágenes"},
            {"name": "Plantilla Independiente A"},
        ],
    )
    monkeypatch.setattr(
        multi_sheet_report,
        "_list_local_template_names",
        lambda: ["Volanteo_simple"],
    )

    response = client.get("/api/multi-sheet/templates")

    assert response.status_code == 200
    payload = response.json()
    assert payload["templates"] == [
        multi_sheet_report._GRID_TEMPLATE_NAME,
        multi_sheet_report._VOLANTEO_TEMPLATE_NAME,
        "Volanteo_simple",
        "Plantilla Independiente A",
        "Plantilla Independiente B",
    ]

    sections = {section["id"]: section for section in payload["sections"]}
    assert sections["builtin"]["templates"] == [
        multi_sheet_report._GRID_TEMPLATE_NAME,
        multi_sheet_report._VOLANTEO_TEMPLATE_NAME,
    ]
    assert sections["independent"]["templates"] == [
        "Plantilla Independiente A",
        "Plantilla Independiente B",
    ]


def test_list_independent_templates_handles_service_error(client, monkeypatch):
    def _raise_error():
        raise RuntimeError("service down")

    monkeypatch.setattr(
        multi_sheet_report,
        "get_all_published_templates",
        _raise_error,
    )

    response = client.get("/api/multi-sheet/templates/independent")

    assert response.status_code == 200
    assert response.json() == {"templates": [], "count": 0}


def _make_blank_pdf() -> bytes:
    from pypdf import PdfWriter

    buf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buf)
    buf.seek(0)
    return buf.read()


def test_generate_multi_sheet_pdf_volanteo_template_layout(client, monkeypatch):
    captured_html = []

    def fake_render_html_to_pdf(html_string: str, _base_url: str, output_path: str) -> None:
        captured_html.append(html_string)
        with open(output_path, "wb") as fout:
            fout.write(_make_blank_pdf())

    monkeypatch.setattr(multi_sheet_report, "_render_html_to_pdf", fake_render_html_to_pdf)

    response = client.post(
        "/api/multi-sheet/generate-pdf",
        data={
            "sheets_config": json.dumps(
                [
                    {
                        "order": 0,
                        "title": "Hoja Volanteo",
                        "templateName": "Panel Fotográfico Volanteo",
                        "useAltHeader": False,
                        "rowData": {
                            "CENTRO": "CS Norte",
                            "NIS": "12345",
                            "SECTOR": "S1",
                            "FECHA CORTE": "2026-03-04",
                            "DIRECCIONES AFECTADAS": "Av. Lima 123",
                            "DISTRITO": "San Miguel",
                            "CODIGO COMPONENTE": "CC-100",
                            "ESTADO": "Ejecutado",
                        },
                        "imageFilenames": [],
                        "imagesPerPage": 4,
                        "pageNum": 1,
                        "totalPages": 1,
                    }
                ]
            ),
            "header_config": json.dumps(
                {
                    "title": "Informe de prueba",
                    "subtitle": "",
                    "logoLeft": None,
                    "logoRight": None,
                }
            ),
            "alt_header_config": json.dumps(
                {"idField": "", "dateField": "", "extraText": "", "height": "compact"}
            ),
        },
    )

    assert response.status_code == 200
    assert captured_html
    html = captured_html[0]
    assert "Panel Fotográfico Volanteo" in html
    assert "Centro de Servicios:" in html
    assert "CS Norte" in html
    assert "CC-100" in html


def test_generate_multi_sheet_pdf_uses_uploaded_logo_files(client, monkeypatch):
    captured_html = []

    def fake_render_html_to_pdf(html_string: str, _base_url: str, output_path: str) -> None:
        captured_html.append(html_string)
        with open(output_path, "wb") as fout:
            fout.write(_make_blank_pdf())

    monkeypatch.setattr(multi_sheet_report, "_render_html_to_pdf", fake_render_html_to_pdf)

    logo_bytes = b"left-logo-binary"
    expected_logo_data_uri = "data:image/png;base64," + base64.b64encode(logo_bytes).decode()

    response = client.post(
        "/api/multi-sheet/generate-pdf",
        data={
            "sheets_config": json.dumps(
                [
                    {
                        "order": 0,
                        "title": "Hoja 1",
                        "useAltHeader": False,
                        "rowData": {},
                        "imageFilenames": [],
                        "imagesPerPage": 4,
                        "pageNum": 1,
                        "totalPages": 1,
                    }
                ]
            ),
            "header_config": json.dumps(
                {
                    "title": "Informe de prueba",
                    "subtitle": "",
                    "logoLeft": None,
                    "logoRight": None,
                }
            ),
            "alt_header_config": json.dumps(
                {"idField": "", "dateField": "", "extraText": "", "height": "compact"}
            ),
        },
        files=[("logoLeftFile", ("logo-left.png", logo_bytes, "image/png"))],
    )

    assert response.status_code == 200
    assert "application/pdf" in response.headers.get("content-type", "")
    assert len(response.content) > 0
    assert captured_html
    assert expected_logo_data_uri in captured_html[0]


def test_list_templates_includes_local_section(client):
    """Local templates folder adds a 'local' section to /templates."""
    response = client.get("/api/multi-sheet/templates")
    assert response.status_code == 200
    payload = response.json()
    sections = {s["id"]: s for s in payload["sections"]}
    assert "local" in sections
    assert "Volanteo_simple" in sections["local"]["templates"]


def test_get_template_mapping_fields_for_builtin_volanteo(client):
    response = client.get(
        "/api/multi-sheet/templates/Panel%20Fotogr%C3%A1fico%20Volanteo/mapping-fields"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "builtin"
    assert payload["fields"] == [
        "CENTRO",
        "NIS",
        "SECTOR",
        "FECHA CORTE",
        "DIRECCIONES AFECTADAS",
        "DISTRITO",
        "CODIGO COMPONENTE",
        "ESTADO",
    ]


def test_get_template_mapping_fields_for_local_template(client):
    response = client.get("/api/multi-sheet/templates/Volanteo_simple/mapping-fields")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "local"
    assert "CENTRO" in payload["fields"]
    assert "NIS" in payload["fields"]
    assert "CODIGO COMPONENTE" in payload["fields"]


def test_get_template_mapping_fields_for_published_template(client, monkeypatch):
    monkeypatch.setattr(
        multi_sheet_report,
        "get_published_template_by_name",
        lambda _name: (
            "<div>{{ report.data.get('CLIENTE', '-') }}</div>"
            "<div>{{ data.get(\"CODIGO\", '-') }}</div>"
            "<div>{{ report.data.get('CLIENTE', '-') }}</div>"
        ),
    )

    response = client.get("/api/multi-sheet/templates/Plantilla%20Mapeo/mapping-fields")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "independent"
    assert payload["fields"] == ["CLIENTE", "CODIGO"]


def test_get_local_template_html_returns_content(client):
    """GET /templates/{name}/html returns the HTML file content."""
    response = client.get("/api/multi-sheet/templates/Volanteo_simple/html")
    assert response.status_code == 200
    content = response.text
    assert "Panel Fot" in content and "Volanteo" in content
    assert "{{ data.get(" in content


def test_get_local_template_html_404_for_unknown(client):
    """GET /templates/{name}/html returns 404 for non-existent template."""
    response = client.get("/api/multi-sheet/templates/DoesNotExist/html")
    assert response.status_code == 404


def test_generate_pdf_with_local_volanteo_template(client, monkeypatch):
    """Generating PDF with 'Volanteo_simple' renders via Jinja2 from the HTML file."""
    captured_html = []

    def fake_render(html_string: str, _base_url: str, output_path: str) -> None:
        captured_html.append(html_string)
        with open(output_path, "wb") as fout:
            fout.write(_make_blank_pdf())

    monkeypatch.setattr(multi_sheet_report, "_render_html_to_pdf", fake_render)

    response = client.post(
        "/api/multi-sheet/generate-pdf",
        data={
            "sheets_config": json.dumps([{
                "order": 0,
                "title": "Hoja Volanteo_simple",
                "templateName": "Volanteo_simple",
                "useAltHeader": False,
                "rowData": {
                    "CENTRO": "CS Sur",
                    "NIS": "99999",
                    "SECTOR": "S2",
                    "FECHA CORTE": "2026-03-04",
                    "DIRECCIONES AFECTADAS": "Jr. Tacna 456",
                    "DISTRITO": "Miraflores",
                    "CODIGO COMPONENTE": "CC-200",
                    "ESTADO": "Pendiente",
                },
                "imageFilenames": [],
                "imagesPerPage": 4,
                "pageNum": 1,
                "totalPages": 1,
            }]),
            "header_config": json.dumps({"title": "Test", "subtitle": "", "logoLeft": None, "logoRight": None}),
            "alt_header_config": json.dumps({"idField": "", "dateField": "", "extraText": "", "height": "compact"}),
        },
    )

    assert response.status_code == 200
    assert captured_html
    html = captured_html[0]
    assert "CS Sur" in html
    assert "99999" in html
    assert "CC-200" in html
    assert "Panel Fot" in html and "Volanteo" in html


def test_generate_multi_sheet_pdf_splits_sorted_images_into_multiple_pages(client, monkeypatch):
    captured_html: list[str] = []

    def fake_render(html_string: str, _base_url: str, output_path: str) -> None:
        captured_html.append(html_string)
        with open(output_path, "wb") as fout:
            fout.write(_make_blank_pdf())

    monkeypatch.setattr(multi_sheet_report, "_render_html_to_pdf", fake_render)

    image_payloads = {
        "NIS_010.jpg": b"img-10",
        "NIS_002.jpg": b"img-02",
        "NIS_001.jpg": b"img-01",
        "NIS_011.jpg": b"img-11",
        "NIS_003.jpg": b"img-03",
    }
    expected_uris = {
        name: "data:image/jpeg;base64," + base64.b64encode(content).decode()
        for name, content in image_payloads.items()
    }

    response = client.post(
        "/api/multi-sheet/generate-pdf",
        data={
            "sheets_config": json.dumps(
                [
                    {
                        "order": 0,
                        "title": "Hoja paginada",
                        "templateName": "Grilla de Imágenes",
                        "useAltHeader": False,
                        "rowData": {"NIS": "99999"},
                        "imageFilenames": list(image_payloads.keys()),
                        "imagesPerPage": 2,
                        "pageNum": 1,
                        "totalPages": 1,
                    }
                ]
            ),
            "header_config": json.dumps(
                {
                    "title": "Informe de prueba",
                    "subtitle": "",
                    "logoLeft": None,
                    "logoRight": None,
                }
            ),
            "alt_header_config": json.dumps(
                {"idField": "", "dateField": "", "extraText": "", "height": "compact"}
            ),
        },
        files=[
            ("files", (name, content, "image/jpeg"))
            for name, content in image_payloads.items()
        ],
    )

    assert response.status_code == 200
    assert len(captured_html) == 3
    assert "Pág. 1/3" in captured_html[0]
    assert "Pág. 2/3" in captured_html[1]
    assert "Pág. 3/3" in captured_html[2]
    assert expected_uris["NIS_001.jpg"] in captured_html[0]
    assert expected_uris["NIS_002.jpg"] in captured_html[0]
    assert expected_uris["NIS_003.jpg"] in captured_html[1]
    assert expected_uris["NIS_010.jpg"] in captured_html[1]
    assert expected_uris["NIS_011.jpg"] in captured_html[2]


def test_list_local_template_names_merges_candidate_directories(tmp_path, monkeypatch):
    dir_primary = tmp_path / "multi_sheet_templates"
    dir_legacy = tmp_path / "mtemplates"
    dir_primary.mkdir()
    dir_legacy.mkdir()

    (dir_primary / "B Template.html").write_text("<html>B</html>", encoding="utf-8")
    (dir_primary / "A Template.html").write_text("<html>A</html>", encoding="utf-8")
    (dir_legacy / "A Template.html").write_text("<html>legacy-A</html>", encoding="utf-8")
    (dir_legacy / "C Template.html").write_text("<html>C</html>", encoding="utf-8")

    monkeypatch.setattr(
        multi_sheet_report,
        "_local_template_directories",
        lambda: [str(dir_primary), str(dir_legacy)],
    )

    names = multi_sheet_report._list_local_template_names()
    assert names == ["A Template", "B Template", "C Template"]



def test_generate_multi_sheet_pdf_falls_back_to_browser_when_weasyprint_is_unavailable(client, monkeypatch):
    browser_calls = []

    def fake_browser_render(html_string: str, _base_url: str, output_path: str) -> None:
        browser_calls.append(html_string)
        with open(output_path, "wb") as fout:
            fout.write(_make_blank_pdf())

    monkeypatch.setattr(multi_sheet_report, "WEASYPRINT_AVAILABLE", False)
    monkeypatch.setattr(multi_sheet_report, "WEASYPRINT_HTML", None)
    monkeypatch.setattr(
        multi_sheet_report,
        "_WEASYPRINT_IMPORT_ERROR",
        OSError("cannot load library 'libgobject-2.0-0'"),
    )
    monkeypatch.setattr(multi_sheet_report, "CHROME_PATH", "C:/Program Files/Google/Chrome/Application/chrome.exe")
    monkeypatch.setattr(multi_sheet_report, "_render_html_to_pdf_with_browser", fake_browser_render)

    response = client.post(
        "/api/multi-sheet/generate-pdf",
        data={
            "sheets_config": json.dumps(
                [
                    {
                        "order": 0,
                        "title": "Hoja fallback",
                        "useAltHeader": False,
                        "rowData": {"NIS": "1001"},
                        "imageFilenames": [],
                        "imagesPerPage": 4,
                        "pageNum": 1,
                        "totalPages": 1,
                    }
                ]
            ),
            "header_config": json.dumps(
                {
                    "title": "Informe fallback",
                    "subtitle": "",
                    "logoLeft": None,
                    "logoRight": None,
                }
            ),
            "alt_header_config": json.dumps(
                {"idField": "", "dateField": "", "extraText": "", "height": "compact"}
            ),
        },
    )

    assert response.status_code == 200
    assert "application/pdf" in response.headers.get("content-type", "")
    assert browser_calls



def test_generate_multi_sheet_pdf_returns_actionable_error_when_no_pdf_engine_available(client, monkeypatch):
    monkeypatch.setattr(multi_sheet_report, "WEASYPRINT_AVAILABLE", False)
    monkeypatch.setattr(multi_sheet_report, "WEASYPRINT_HTML", None)
    monkeypatch.setattr(
        multi_sheet_report,
        "_WEASYPRINT_IMPORT_ERROR",
        OSError("cannot load library 'libgobject-2.0-0'"),
    )
    monkeypatch.setattr(multi_sheet_report, "CHROME_PATH", None)

    response = client.post(
        "/api/multi-sheet/generate-pdf",
        data={
            "sheets_config": json.dumps(
                [
                    {
                        "order": 0,
                        "title": "Hoja error",
                        "useAltHeader": False,
                        "rowData": {},
                        "imageFilenames": [],
                        "imagesPerPage": 4,
                        "pageNum": 1,
                        "totalPages": 1,
                    }
                ]
            ),
            "header_config": json.dumps(
                {
                    "title": "Informe error",
                    "subtitle": "",
                    "logoLeft": None,
                    "logoRight": None,
                }
            ),
            "alt_header_config": json.dumps(
                {"idField": "", "dateField": "", "extraText": "", "height": "compact"}
            ),
        },
    )

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert "libgobject-2.0-0" in detail
    assert "GTK_RUNTIME_BIN" in detail
    assert "Chrome/Edge" in detail
