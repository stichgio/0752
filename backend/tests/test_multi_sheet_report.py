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


def _make_blank_pdf() -> bytes:
    from pypdf import PdfWriter  # pyre-ignore[21]

    buf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buf)
    buf.seek(0)
    return buf.read()


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
