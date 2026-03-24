from __future__ import annotations

import base64
import importlib
import io
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app

maquina_balde_module = importlib.import_module("maquina_balde.router")


def _tiny_png() -> bytes:
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )


HEADER = {
    "titulo": "Maquina de Balde",
    "FECHA_TRABAJO": "2026-03-24",
    "NIS": "12345",
    "SGIO": "SG-77",
    "DIRECCION": "Av. Lima 100",
    "LOCALIDAD": "SJL",
    "DISTRITO": "San Juan de Lurigancho",
    "ACTIVIDAD": "Inspeccion y registro fotografico",
}


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_render_pdf_accepts_valid_header_json(client, monkeypatch):
    png = _tiny_png()
    monkeypatch.setattr(maquina_balde_module, "WEASYPRINT_AVAILABLE", False)
    monkeypatch.setattr(maquina_balde_module, "WEASYPRINT_HTML", None)
    monkeypatch.setattr(maquina_balde_module, "CHROME_PATH", None)

    response = client.post(
        "/api/maquina-balde/render-pdf",
        data={"header_config": json.dumps(HEADER)},
        files=[("images", ("foto1.png", png, "image/png"))],
    )

    assert response.status_code == 200
    assert "application/pdf" in response.headers.get("content-type", "")
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == 1


def test_render_pdf_rejects_invalid_header_json(client):
    response = client.post(
        "/api/maquina-balde/render-pdf",
        data={"header_config": "not-json"},
        files=[("images", ("foto1.png", _tiny_png(), "image/png"))],
    )

    assert response.status_code == 400
