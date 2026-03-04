import base64
import io
import json
import os
import sys

import pytest  # pyre-ignore[21]
from fastapi.testclient import TestClient  # pyre-ignore[21]

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app  # pyre-ignore[21]
from routers import multi_sheet_report  # pyre-ignore[21]


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
        lambda: ["Volanteo Local"],
    )

    response = client.get("/api/multi-sheet/templates")

    assert response.status_code == 200
    payload = response.json()
    assert payload["templates"] == [
        "Grilla de Imágenes",
        "Panel Fotográfico Volanteo",
        "Volanteo Local",
        "Plantilla Independiente A",
        "Plantilla Independiente B",
    ]

    sections = {section["id"]: section for section in payload["sections"]}
    assert sections["builtin"]["templates"] == [
        "Grilla de Imágenes",
        "Panel Fotográfico Volanteo",
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
    from pypdf import PdfWriter  # pyre-ignore[21]

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
    assert "Volanteo Local" in sections["local"]["templates"]


def test_get_local_template_html_returns_content(client):
    """GET /templates/{name}/html returns the HTML file content."""
    response = client.get("/api/multi-sheet/templates/Volanteo%20Local/html")
    assert response.status_code == 200
    content = response.text
    assert "Panel Fotográfico Volanteo" in content
    assert "{{ data.get(" in content


def test_get_local_template_html_404_for_unknown(client):
    """GET /templates/{name}/html returns 404 for non-existent template."""
    response = client.get("/api/multi-sheet/templates/DoesNotExist/html")
    assert response.status_code == 404


def test_generate_pdf_with_local_volanteo_template(client, monkeypatch):
    """Generating PDF with 'Volanteo Local' renders via Jinja2 from the HTML file."""
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
                "title": "Hoja Volanteo Local",
                "templateName": "Volanteo Local",
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
    assert "Panel Fotográfico Volanteo" in html
