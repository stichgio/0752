import asyncio
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app
from services import report_service
from technical_reports.models import TechnicalReport
from technical_reports import router as tech_router
from fichas_tecnicas.models import FichaTecnica
from fichas_tecnicas import router as fichas_router
from msheets import multi_sheet_report


def _make_blank_pdf() -> bytes:
    from pypdf import PdfWriter

    buf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buf)
    buf.seek(0)
    return buf.read()


def _install_fake_weasyprint(monkeypatch):
    calls = []

    class FakeHTML:
        def __init__(self, string: str, base_url: str | None = None):
            self.string = string
            self.base_url = base_url

        def write_pdf(self, target=None, *args, **kwargs):
            calls.append({"html": self.string, "target": target, "base_url": self.base_url})
            pdf_bytes = _make_blank_pdf()
            if target is None:
                return pdf_bytes
            with open(target, "wb") as fout:
                fout.write(pdf_bytes)

    monkeypatch.setitem(sys.modules, "weasyprint", types.SimpleNamespace(HTML=FakeHTML))
    return calls


def _make_technical_report(report_id: str, cs: str) -> TechnicalReport:
    return TechnicalReport(
        id=report_id,
        metadata={
            "informe_id": int(report_id.split("-")[-1]),
            "dia": 5,
            "mes": "MARZO",
            "anio": 2026,
            "pagina": "1 de 2",
        },
        header={
            "cs": cs,
            "contratista": "Contrata QA",
            "codigo_infraestructura": "INF-001",
            "ubicacion": "Av. Lima 123",
            "suministro": "SUM-001",
            "tipo": "ELEVADO",
            "volumen": 25,
        },
        inspeccion={},
        valvulas={},
        canastillas={},
        medidas={
            "diametro": "",
            "diametro_interno": "",
            "altura_util": "",
            "altura_total": "",
        },
        last_modified="2026-03-05T10:00:00",
    )


def _make_ficha(ficha_id: str, cliente: str) -> FichaTecnica:
    return FichaTecnica(
        id=ficha_id,
        os_numero=f"OS-{ficha_id}",
        cliente=cliente,
        fecha="2026-03-05",
        direccion="Jr. Prueba 123",
        distrito="Lima",
        last_modified="2026-03-05T10:00:00",
    )


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_technical_reports_consolidated_pdf_endpoints(client, monkeypatch):
    fake_calls = _install_fake_weasyprint(monkeypatch)
    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(
        tech_router.db,
        "get_all_reports",
        lambda: [
            _make_technical_report("RPT-0001", "CS Norte"),
            _make_technical_report("RPT-0002", "CS Sur"),
        ],
    )

    response = client.post(
        "/api/technical-reports/generate-consolidated-pdf",
        data={"report_ids": json.dumps(["RPT-0002"])},
    )

    assert response.status_code == 200
    assert "application/pdf" in response.headers.get("content-type", "")
    assert "consolidado_1.pdf" in response.headers.get("content-disposition", "")
    assert fake_calls

    progress_response = client.post("/api/technical-reports/generate-consolidated-pdf-progress")
    assert progress_response.status_code == 200
    assert "text/event-stream" in progress_response.headers.get("content-type", "")
    progress_text = progress_response.text
    assert "event: progress" in progress_text
    assert "event: done" in progress_text
    render_first = '"phase": "rendering", "current": 1, "total": 2'
    render_last = '"phase": "rendering", "current": 2, "total": 2'
    assert render_first in progress_text
    assert render_last in progress_text
    assert progress_text.index(render_first) < progress_text.index(render_last)


def test_fichas_consolidated_pdf_endpoints(client, monkeypatch):
    fake_calls = _install_fake_weasyprint(monkeypatch)
    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(
        fichas_router.db,
        "get_all_fichas",
        lambda: [
            _make_ficha("FT-00001", "Cliente A"),
            _make_ficha("FT-00002", "Cliente B"),
        ],
    )

    response = client.post(
        "/api/fichas-tecnicas/generate-consolidated-pdf",
        data={"ficha_ids": json.dumps(["FT-00001"])},
    )

    assert response.status_code == 200
    assert "application/pdf" in response.headers.get("content-type", "")
    assert "consolidado_1.pdf" in response.headers.get("content-disposition", "")
    assert fake_calls

    progress_response = client.post("/api/fichas-tecnicas/generate-consolidated-pdf-progress")
    assert progress_response.status_code == 200
    assert "text/event-stream" in progress_response.headers.get("content-type", "")
    progress_text = progress_response.text
    assert "event: progress" in progress_text
    assert "event: done" in progress_text
    render_first = '"phase": "rendering", "current": 1, "total": 2'
    render_last = '"phase": "rendering", "current": 2, "total": 2'
    assert render_first in progress_text
    assert render_last in progress_text
    assert progress_text.index(render_first) < progress_text.index(render_last)


def test_generate_pdf_progress_emits_incremental_preparing_updates(client, monkeypatch):
    def fake_render_pdf_to_file(html_string: str, original_quality: bool = False):
        tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp_path.close()
        with open(tmp_path.name, "wb") as fout:
            fout.write(_make_blank_pdf())
        return tmp_path.name

    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(report_service, "_render_pdf_to_file_safe", fake_render_pdf_to_file)

    payload = [
        {"row_data": {"CENTRO": "CS Norte", "NIS": "1001"}, "image_filenames": []},
        {"row_data": {"CENTRO": "CS Sur", "NIS": "1002"}, "image_filenames": []},
    ]

    progress_response = client.post(
        "/api/generate-pdf-progress",
        data={"data": json.dumps(payload)},
    )

    assert progress_response.status_code == 200
    assert "text/event-stream" in progress_response.headers.get("content-type", "")
    progress_text = progress_response.text
    first_update = '"phase": "preparing", "current": 1, "total": 2'
    second_update = '"phase": "preparing", "current": 2, "total": 2'
    assert first_update in progress_text
    assert second_update in progress_text
    assert progress_text.index(first_update) < progress_text.index(second_update)
    assert "event: done" in progress_text


def test_report_service_renders_default_template_per_report_for_batch_exports(monkeypatch):
    calls = []

    def fake_render_pdf_to_file(html_string: str, original_quality: bool = False):
        calls.append(html_string)
        tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp_path.close()
        with open(tmp_path.name, "wb") as fout:
            fout.write(_make_blank_pdf())
        return tmp_path.name

    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(report_service, "_render_pdf_to_file_safe", fake_render_pdf_to_file)

    service = report_service.ReportService()
    try:
        pdf_bytes = asyncio.run(
            service.generate_batch_pdf(
                [
                    {"data": {"CENTRO": "CS Norte", "NIS": "1001"}, "files": []},
                    {"data": {"CENTRO": "CS Sur", "NIS": "1002"}, "files": []},
                ]
            )
        )
    finally:
        asyncio.run(service.close())

    assert isinstance(pdf_bytes, bytes)
    assert len(calls) == 2
    assert "CS Norte" in calls[0]
    assert "CS Sur" in calls[1]


def test_report_service_keeps_single_render_for_single_default_report(monkeypatch):
    calls = []

    def fake_render_pdf_to_file(html_string: str, original_quality: bool = False):
        calls.append(html_string)
        tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp_path.close()
        with open(tmp_path.name, "wb") as fout:
            fout.write(_make_blank_pdf())
        return tmp_path.name

    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(report_service, "_render_pdf_to_file_safe", fake_render_pdf_to_file)

    service = report_service.ReportService()
    try:
        pdf_bytes = asyncio.run(
            service.generate_batch_pdf(
                [
                    {"data": {"CENTRO": "CS Norte", "NIS": "1001"}, "files": []},
                ]
            )
        )
    finally:
        asyncio.run(service.close())

    assert isinstance(pdf_bytes, bytes)
    assert len(calls) == 1
    assert "CS Norte" in calls[0]


def test_report_service_keeps_per_report_render_for_custom_templates(monkeypatch):
    calls = []

    def fake_render_pdf_to_file(html_string: str, original_quality: bool = False):
        calls.append(html_string)
        tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp_path.close()
        with open(tmp_path.name, "wb") as fout:
            fout.write(_make_blank_pdf())
        return tmp_path.name

    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(report_service, "_render_pdf_to_file_safe", fake_render_pdf_to_file)

    service = report_service.ReportService()
    try:
        pdf_bytes = asyncio.run(
            service.generate_batch_pdf(
                [
                    {"data": {"CENTRO": "CS Norte"}, "files": []},
                    {"data": {"CENTRO": "CS Sur"}, "files": []},
                ],
                custom_template_str="<html><body>{{ report.get('CENTRO', '-') }}</body></html>",
            )
        )
    finally:
        asyncio.run(service.close())

    assert isinstance(pdf_bytes, bytes)
    assert len(calls) == 2


def test_report_service_emits_incremental_progress_for_custom_templates(monkeypatch):
    progress_events = []

    def fake_render_pdf_to_file(html_string: str, original_quality: bool = False):
        tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp_path.close()
        with open(tmp_path.name, "wb") as fout:
            fout.write(_make_blank_pdf())
        return tmp_path.name

    async def on_progress(phase: str, current: int, total: int, detail: str = ""):
        progress_events.append((phase, current, total, detail))

    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(report_service, "_render_pdf_to_file_safe", fake_render_pdf_to_file)

    service = report_service.ReportService()
    try:
        pdf_bytes = asyncio.run(
            service.generate_batch_pdf(
                [
                    {"data": {"CENTRO": "CS Norte"}, "files": []},
                    {"data": {"CENTRO": "CS Sur"}, "files": []},
                    {"data": {"CENTRO": "CS Este"}, "files": []},
                ],
                custom_template_str="<html><body>{{ report.get('CENTRO', '-') }}</body></html>",
                on_progress=on_progress,
            )
        )
    finally:
        asyncio.run(service.close())

    assert isinstance(pdf_bytes, bytes)
    preparing_counts = [current for phase, current, total, _ in progress_events if phase == "preparing"]
    rendering_counts = [current for phase, current, total, _ in progress_events if phase == "rendering"]
    merging_counts = [current for phase, current, total, _ in progress_events if phase == "merging"]

    assert preparing_counts == [1, 2, 3]
    assert rendering_counts == [1, 2, 3]
    assert merging_counts == [0, 1, 2, 3]


@pytest.mark.parametrize(
    "template_name",
    sorted(path.name for path in Path(os.path.join(os.path.dirname(__file__), "..", "templates")).glob("*.html")),
)
def test_report_service_renders_backend_templates_per_report_for_batch_exports(monkeypatch, template_name):
    calls = []

    def fake_render_pdf_to_file(html_string: str, original_quality: bool = False):
        calls.append({"template": template_name, "html": html_string})
        tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp_path.close()
        with open(tmp_path.name, "wb") as fout:
            fout.write(_make_blank_pdf())
        return tmp_path.name

    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(report_service, "_render_pdf_to_file_safe", fake_render_pdf_to_file)

    service = report_service.ReportService()
    try:
        pdf_bytes = asyncio.run(
            service.generate_batch_pdf(
                [
                    {"data": {"CENTRO": "CS Norte", "NIS": "1001", "COD INFRAESTRUCT": "INF-1"}, "files": []},
                    {"data": {"CENTRO": "CS Sur", "NIS": "1002", "COD INFRAESTRUCT": "INF-2"}, "files": []},
                ],
                template_name=template_name,
            )
        )
    finally:
        asyncio.run(service.close())

    assert isinstance(pdf_bytes, bytes)
    assert len(calls) == 2



def test_report_service_rejects_partial_batch_pdf_generation(monkeypatch):
    calls = {"count": 0}

    def fake_render_pdf_to_file(_html_string: str, original_quality: bool = False):
        calls["count"] += 1
        if calls["count"] == 1:
            tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            tmp_path.close()
            with open(tmp_path.name, "wb") as fout:
                fout.write(_make_blank_pdf())
            return tmp_path.name
        return None

    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(report_service, "_render_pdf_to_file_safe", fake_render_pdf_to_file)

    service = report_service.ReportService()
    try:
        with pytest.raises(RuntimeError, match=r"Fallo la renderizacion de 1 de 2 PDF\(s\)"):
            asyncio.run(
                service.generate_batch_pdf(
                    [
                        {"data": {"CENTRO": "CS Norte", "NIS": "1001"}, "files": []},
                        {"data": {"CENTRO": "CS Sur", "NIS": "1002"}, "files": []},
                    ],
                    template_name="report_volanteo.html",
                )
            )
    finally:
        asyncio.run(service.close())


def test_report_service_cleans_up_partial_batch_temp_pdfs(monkeypatch):
    calls = {"count": 0}
    created_paths = []

    def fake_render_pdf_to_file(_html_string: str, original_quality: bool = False):
        calls["count"] += 1
        if calls["count"] == 1:
            tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            tmp_path.close()
            with open(tmp_path.name, "wb") as fout:
                fout.write(_make_blank_pdf())
            created_paths.append(tmp_path.name)
            return tmp_path.name
        return None

    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(report_service, "_render_pdf_to_file_safe", fake_render_pdf_to_file)

    service = report_service.ReportService()
    try:
        with pytest.raises(RuntimeError, match=r"Fallo la renderizacion de 1 de 2 PDF\(s\)"):
            asyncio.run(
                service.generate_batch_pdf(
                    [
                        {"data": {"CENTRO": "CS Norte", "NIS": "1001"}, "files": []},
                        {"data": {"CENTRO": "CS Sur", "NIS": "1002"}, "files": []},
                    ],
                    template_name="report_volanteo.html",
                )
            )
    finally:
        asyncio.run(service.close())

    assert created_paths
    assert all(not os.path.exists(path) for path in created_paths)


def test_multi_sheet_memoizes_template_scan_and_image_encoding(client, monkeypatch, tmp_path):
    counts = {"scan": 0, "image": 0}
    captured_html = []

    template_file = tmp_path / "CachedTemplate.html"
    template_file.write_text(
        "<html><body><div>{{ data.get('CLIENTE', '-') }}</div>{% for image in images %}<img src='{{ image.path }}'>{% endfor %}</body></html>",
        encoding="utf-8",
    )
    record = multi_sheet_report.LocalTemplateRecord(
        name="CachedTemplate",
        file_path=str(template_file),
        directory=str(tmp_path),
    )

    def fake_scan_local_templates():
        counts["scan"] += 1
        return [record]

    def fake_image_to_b64(_path: str):
        counts["image"] += 1
        return "data:image/jpeg;base64,ZmFrZQ=="

    def fake_render_html_to_pdf(html_string: str, _base_url: str, output_path: str, original_quality: bool = False) -> None:
        captured_html.append(html_string)
        with open(output_path, "wb") as fout:
            fout.write(_make_blank_pdf())

    monkeypatch.setattr(multi_sheet_report, "_scan_local_templates", fake_scan_local_templates)
    monkeypatch.setattr(multi_sheet_report, "_image_to_b64", fake_image_to_b64)
    monkeypatch.setattr(multi_sheet_report, "_render_html_to_pdf", fake_render_html_to_pdf)

    response = client.post(
        "/api/multi-sheet/generate-pdf",
        data={
            "sheets_config": json.dumps(
                [
                    {
                        "order": 0,
                        "title": "Hoja 1",
                        "templateName": "CachedTemplate",
                        "useAltHeader": False,
                        "rowData": {"CLIENTE": "Cliente A"},
                        "imageFilenames": ["foto.jpg"],
                        "imagesPerPage": 1,
                        "pageNum": 1,
                        "totalPages": 1,
                    },
                    {
                        "order": 1,
                        "title": "Hoja 2",
                        "templateName": "CachedTemplate",
                        "useAltHeader": False,
                        "rowData": {"CLIENTE": "Cliente B"},
                        "imageFilenames": ["foto.jpg"],
                        "imagesPerPage": 1,
                        "pageNum": 1,
                        "totalPages": 1,
                    },
                ]
            ),
            "header_config": json.dumps({"title": "Test", "subtitle": "", "logoLeft": None, "logoRight": None}),
            "alt_header_config": json.dumps({"idField": "", "dateField": "", "extraText": "", "height": "compact"}),
        },
        files=[("files", ("foto.jpg", b"fake-image", "image/jpeg"))],
    )

    assert response.status_code == 200
    assert len(captured_html) == 2
    assert counts["scan"] == 1
    assert counts["image"] == 1


def test_resolve_backend_template_image_max_size_uses_template_slots():
    size = report_service.resolve_backend_template_image_max_size("format_reservorios.html", 4)

    assert size == report_service._size_from_mm(60, 54, report_service.SLOT_RENDER_DPI)
    assert size[0] < report_service.MAX_IMAGE_SIZE[0]
    assert size[1] < report_service.MAX_IMAGE_SIZE[1]
    assert report_service.resolve_backend_template_image_max_size("unknown.html", 2) == report_service.MAX_IMAGE_SIZE


def test_process_logo_resizes_large_binary_jpeg_and_keeps_mime():
    logo_img = Image.new(
        "RGB",
        (report_service.DEFAULT_LOGO_MAX_SIZE[0] + 600, report_service.DEFAULT_LOGO_MAX_SIZE[1] + 240),
        color=(240, 240, 240),
    )
    buffer = io.BytesIO()
    logo_img.save(buffer, format="JPEG", quality=95)
    original_bytes = buffer.getvalue()

    service = report_service.ReportService()
    try:
        data_uri = service._process_logo(original_bytes, "left")
    finally:
        asyncio.run(service.close())

    assert data_uri.startswith("data:image/jpeg;base64,")

    optimized_bytes, optimized_mime = report_service._decode_data_uri(data_uri)
    assert optimized_mime == "image/jpeg"
    assert optimized_bytes is not None
    assert len(optimized_bytes) < len(original_bytes)

    with Image.open(io.BytesIO(optimized_bytes)) as optimized_logo:
        assert optimized_logo.width <= report_service.DEFAULT_LOGO_MAX_SIZE[0]
        assert optimized_logo.height <= report_service.DEFAULT_LOGO_MAX_SIZE[1]


def test_report_service_uses_layout_specific_image_size_for_backend_template(monkeypatch):
    captured = {}

    async def fake_process_files_serial(self, files, max_size=report_service.MAX_IMAGE_SIZE, quality=report_service.JPEG_QUALITY, original_quality=False):
        captured["max_size"] = max_size
        return [], "4", len(files)

    def fake_render_pdf_to_file(html_string: str, original_quality: bool = False):
        tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp_path.close()
        with open(tmp_path.name, "wb") as fout:
            fout.write(_make_blank_pdf())
        return tmp_path.name

    monkeypatch.setattr(report_service, "GHOSTSCRIPT_ENABLED", False)
    monkeypatch.setattr(report_service, "_render_pdf_to_file_safe", fake_render_pdf_to_file)
    monkeypatch.setattr(report_service.ReportService, "_process_files_serial", fake_process_files_serial)

    service = report_service.ReportService()
    try:
        pdf_bytes = asyncio.run(
            service.generate_batch_pdf(
                [
                    {
                        "data": {"CENTRO": "CS Norte", "NIS": "1001"},
                        "files": [{"path": "a"}, {"path": "b"}, {"path": "c"}, {"path": "d"}],
                    }
                ],
                template_name="format_reservorios.html",
            )
        )
    finally:
        asyncio.run(service.close())

    assert isinstance(pdf_bytes, bytes)
    assert captured["max_size"] == report_service.resolve_backend_template_image_max_size("format_reservorios.html", 4)



def test_generate_pdf_forwards_original_quality_and_raw_logo_bytes(client):
    captured = {}

    class DummyService:
        async def generate_batch_pdf(self, reports_payload, output_path=None, logo_left=None, logo_right=None, custom_template_str=None, template_name=None, on_progress=None, original_quality=False):
            captured["reports_payload"] = reports_payload
            captured["logo_left"] = logo_left
            captured["logo_right"] = logo_right
            captured["original_quality"] = original_quality
            with open(output_path, "wb") as fout:
                fout.write(b"%PDF-1.4\n%mock\n")

        async def close(self):
            return None

    app.state.report_service = DummyService()
    response = client.post(
        "/api/generate-pdf",
        data={"data": json.dumps({"id": "RPT-RAW", "valvulas": {}}), "originalQuality": "true"},
        files=[
            ("logoLeft", ("logo-left.png", b"left-logo-bytes", "image/png")),
            ("logoRight", ("logo-right.jpg", b"right-logo-bytes", "image/jpeg")),
        ],
    )

    assert response.status_code == 200
    assert captured["original_quality"] is True
    assert captured["logo_left"] == b"left-logo-bytes"
    assert captured["logo_right"] == b"right-logo-bytes"
