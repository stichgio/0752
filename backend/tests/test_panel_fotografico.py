"""
# -*- coding: utf-8 -*-
Tests para el mÃƒÆ’Ã‚Â³dulo panel_fotografico.
PatrÃƒÆ’Ã‚Â³n: monkeypatch sobre _render_html_to_pdf para no requerir WeasyPrint en CI.
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app
from panel_fotografico import router as panel_foto_module


# ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ helpers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬


def _make_blank_pdf() -> bytes:
    from pypdf import PdfWriter

    buf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    writer.write(buf)
    buf.seek(0)
    return buf.read()


def _fake_render(captured: list[str]):
    """Returns a fake _render_html_to_pdf that records HTML and writes a blank PDF."""

    def _inner(html_string: str, _base_url: str, output_path: str) -> None:
        captured.append(html_string)
        with open(output_path, "wb") as fout:
            fout.write(_make_blank_pdf())

    return _inner


def _tiny_png() -> bytes:
    """1ÃƒÆ’Ã¢â‚¬â€1 transparent PNG ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â minimal valid image."""
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )


HEADER = {
    "titulo": "Panel de Prueba",
    "CENTRO": "CS Lima Norte",
    "NIS": "12345",
    "SECTOR": "S1",
    "FECHA_CORTE": "2026-03-18",
    "DIRECCIONES_AFECTADAS": "Av. Lima 100",
    "DISTRITO": "Los Olivos",
    "ESTADO": "Ejecutado",
}


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


# ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ tests ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬


def test_render_pdf_no_images_returns_400(client, monkeypatch):
    """0 imÃƒÆ’Ã‚Â¡genes ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 400 con mensaje claro."""
    monkeypatch.setattr(panel_foto_module, "_render_html_to_pdf", _fake_render([]))

    response = client.post(
        "/api/panel-fotografico/render-pdf",
        data={"header_config": json.dumps(HEADER)},
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "imagen" in detail.lower()


def test_render_pdf_1_to_4_images_produces_one_page(client, monkeypatch):
    """1-4 imagenes -> 1 pagina, con layout especial cuando el chunk tiene 3 fotos."""
    captured: list[str] = []
    monkeypatch.setattr(panel_foto_module, "_render_html_to_pdf", _fake_render(captured))

    png = _tiny_png()
    response = client.post(
        "/api/panel-fotografico/render-pdf",
        data={"header_config": json.dumps(HEADER)},
        files=[
            ("images", ("foto1.png", png, "image/png")),
            ("images", ("foto2.png", png, "image/png")),
            ("images", ("foto3.png", png, "image/png")),
        ],
    )
    assert response.status_code == 200
    assert "application/pdf" in response.headers.get("content-type", "")
    assert captured
    html = captured[0]
    assert 'class="photo-grid photo-grid-three"' in html
    assert 'class="photo-grid-three-bottom"' in html
    assert "Sin imagen" not in html
    assert html.count('class="photo-cell"') == 3
    assert "photo-table" not in html
    assert "CS Lima Norte" in html
    assert len(captured) == 1

def test_render_pdf_5_to_8_images_produces_two_pages(client, monkeypatch):
    """5-8 imÃƒÆ’Ã‚Â¡genes ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 2 renders (2 pÃƒÆ’Ã‚Â¡ginas), sin duplicados."""
    captured: list[str] = []
    monkeypatch.setattr(panel_foto_module, "_render_html_to_pdf", _fake_render(captured))

    png = _tiny_png()
    files = [("images", (f"foto{i}.png", png, "image/png")) for i in range(6)]
    response = client.post(
        "/api/panel-fotografico/render-pdf",
        data={"header_config": json.dumps(HEADER)},
        files=files,
    )
    assert response.status_code == 200
    # Only 1 render call because we stitch all pages into a single HTML document
    assert captured
    html = captured[0]
    # Both page indicators present
    assert "Hoja 1/2" in html
    assert "Hoja 2/2" in html
    # 2 last slots are placeholders
    assert html.count("Sin imagen") == 2


def test_render_pdf_9_images_produces_three_pages(client, monkeypatch):
    """9 imÃƒÆ’Ã‚Â¡genes ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 3 pÃƒÆ’Ã‚Â¡ginas, ÃƒÆ’Ã‚Âºltima con 1 foto + 3 placeholders."""
    captured: list[str] = []
    monkeypatch.setattr(panel_foto_module, "_render_html_to_pdf", _fake_render(captured))

    png = _tiny_png()
    files = [("images", (f"foto{i}.png", png, "image/png")) for i in range(9)]
    response = client.post(
        "/api/panel-fotografico/render-pdf",
        data={"header_config": json.dumps(HEADER)},
        files=files,
    )
    assert response.status_code == 200
    assert captured
    html = captured[0]
    assert "Hoja 1/3" in html
    assert "Hoja 2/3" in html
    assert "Hoja 3/3" in html
    # chunk 3 has 1 image + 3 placeholders
    assert html.count("Sin imagen") == 3


def test_render_pdf_header_fields_present_in_all_pages(client, monkeypatch):
    """Los campos de cabecera deben aparecer en todas las pÃƒÆ’Ã‚Â¡ginas del HTML generado."""
    captured: list[str] = []
    monkeypatch.setattr(panel_foto_module, "_render_html_to_pdf", _fake_render(captured))

    png = _tiny_png()
    files = [("images", (f"foto{i}.png", png, "image/png")) for i in range(5)]
    response = client.post(
        "/api/panel-fotografico/render-pdf",
        data={"header_config": json.dumps(HEADER)},
        files=files,
    )
    assert response.status_code == 200
    html = captured[0]
    # Both page divs contain the header data
    assert html.count("CS Lima Norte") == 2


def test_render_pdf_invalid_header_json_returns_400(client):
    """header_config con JSON invÃƒÆ’Ã‚Â¡lido ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 400."""
    response = client.post(
        "/api/panel-fotografico/render-pdf",
        data={"header_config": "not-json"},
    )
    assert response.status_code == 400


def test_render_pdf_with_logo_embeds_logo_in_html(client, monkeypatch):
    """Logo subido debe aparecer como data URI en el HTML."""
    captured: list[str] = []
    monkeypatch.setattr(panel_foto_module, "_render_html_to_pdf", _fake_render(captured))

    png = _tiny_png()
    expected_b64 = "data:image/png;base64," + base64.b64encode(png).decode()

    response = client.post(
        "/api/panel-fotografico/render-pdf",
        data={"header_config": json.dumps(HEADER)},
        files=[
            ("images", ("foto1.png", png, "image/png")),
            ("logoLeft", ("logo.png", png, "image/png")),
        ],
    )
    assert response.status_code == 200
    assert expected_b64 in captured[0]


def test_render_pdf_falls_back_to_pillow_when_html_engines_unavailable(client, monkeypatch):
    png = _tiny_png()
    monkeypatch.setattr(panel_foto_module, "WEASYPRINT_AVAILABLE", False)
    monkeypatch.setattr(panel_foto_module, "WEASYPRINT_HTML", None)
    monkeypatch.setattr(panel_foto_module, "_WEASYPRINT_IMPORT_ERROR", RuntimeError("missing gtk"))
    monkeypatch.setattr(panel_foto_module, "CHROME_PATH", None)

    response = client.post(
        "/api/panel-fotografico/render-pdf",
        data={"header_config": json.dumps(HEADER)},
        files=[("images", ("foto1.png", png, "image/png"))],
    )

    assert response.status_code == 200
    assert "application/pdf" in response.headers.get("content-type", "")
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == 1



def test_chunk_images_helper():
    """Unit test for the _chunk_images helper (no HTTP)."""
    from panel_fotografico.router import _chunk_images

    assert _chunk_images([], 4) == []
    assert _chunk_images(["a", "b", "c"], 4) == [["a", "b", "c"]]
    assert _chunk_images(["a", "b", "c", "d"], 4) == [["a", "b", "c", "d"]]
    assert _chunk_images(["a", "b", "c", "d", "e"], 4) == [["a", "b", "c", "d"], ["e"]]
    result = _chunk_images(list(range(9)), 4)
    assert len(result) == 3
    assert result[2] == [8]

