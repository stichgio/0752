# -*- coding: utf-8 -*-
import io

from pypdf import PdfReader

from formatos.catalog import catalog
from formatos.models import GenerateRequest
from formatos.router import (
    _build_overlay_stamp_pdf,
    _generate_visual,
    _load_template_bytes,
    generate,
)


def test_template_d_still_uses_legacy_strategy(monkeypatch):
    called = {"legacy": 0, "visual": 0}

    monkeypatch.setattr("formatos.router._load_template_bytes", lambda entry: b"template")

    def fake_legacy(template_bytes, desde, hasta):
        called["legacy"] += 1
        return b"legacy-pdf"

    def fake_visual(template_bytes, desde, hasta, mapping):
        called["visual"] += 1
        return b"visual-pdf"

    monkeypatch.setattr("formatos.router._generate_legacy", fake_legacy)
    monkeypatch.setattr("formatos.router._generate_visual", fake_visual)

    response = generate(GenerateRequest(format_id="template-d", desde=1, hasta=1))

    assert response.body == b"legacy-pdf"
    assert called == {"legacy": 1, "visual": 0}


def test_overlay_stamp_pdf_is_well_formed():
    stamp_pdf = _build_overlay_stamp_pdf(0, 0, 100, 100, 'Helvetica-Bold', 'q\nQ\n')
    reader = PdfReader(io.BytesIO(stamp_pdf))

    assert len(reader.pages) == 1


def test_televisiva_keeps_original_badge_and_overlays_only_the_number():
    entry = catalog.get("televisiva")
    assert entry is not None
    assert entry.mapping is not None
    assert entry.mapping.redraw_ot_badge is False

    pdf_bytes = _generate_visual(_load_template_bytes(entry), 123, 123, entry.mapping)
    page = PdfReader(io.BytesIO(pdf_bytes)).pages[0]
    content = page.get_contents().get_data()

    assert b"(00123) Tj" in content
    assert b"(OT\\072) Tj" not in content
    assert b"h\nB\n" not in content and b"h\r\nB\r\n" not in content


def test_televisiva_preserves_hora_final_label_when_overlaying_number():
    entry = catalog.get("televisiva")
    assert entry is not None
    assert entry.mapping is not None

    pdf_bytes = _generate_visual(_load_template_bytes(entry), 123, 123, entry.mapping)
    text = PdfReader(io.BytesIO(pdf_bytes)).pages[0].extract_text() or ""

    assert "HORA FINAL:" in text
    assert "00123" in text


def test_maquina_keeps_original_badge_and_overlays_only_the_number():
    entry = catalog.get("maquina")
    assert entry is not None
    assert entry.mapping is not None
    assert entry.mapping.redraw_ot_badge is False

    pdf_bytes = _generate_visual(_load_template_bytes(entry), 1, 1, entry.mapping)
    page = PdfReader(io.BytesIO(pdf_bytes)).pages[0]
    content = page.get_contents().get_data()

    assert b"(00001) Tj" in content
    assert b"(OT\\072) Tj" not in content
    assert b"h\nB\n" not in content and b"h\r\nB\r\n" not in content


def test_maquina_preserves_longitud_label_when_overlaying_number():
    entry = catalog.get("maquina")
    assert entry is not None
    assert entry.mapping is not None

    pdf_bytes = _generate_visual(_load_template_bytes(entry), 1, 1, entry.mapping)
    text = PdfReader(io.BytesIO(pdf_bytes)).pages[0].extract_text() or ""

    assert "L O N G I T U D :" in text
    assert "00001" in text


def test_visual_formats_have_the_adjusted_ot_mapping():
    maquina = catalog.get("maquina")
    televisiva = catalog.get("televisiva")

    assert maquina is not None and maquina.mapping is not None
    assert maquina.mapping.font_name == "Helvetica-Bold"
    assert maquina.mapping.x == 535
    assert maquina.mapping.y == 26
    assert maquina.mapping.blank_x is None
    assert maquina.mapping.blank_width is None
    assert maquina.mapping.blank_height is None
    assert maquina.mapping.redraw_ot_badge is False
    assert maquina.mapping.blank_mcids is None

    assert televisiva is not None and televisiva.mapping is not None
    assert televisiva.mapping.font_name == "Helvetica-Bold"
    assert televisiva.mapping.x == 534
    assert televisiva.mapping.y == 25
    assert televisiva.mapping.blank_x is None
    assert televisiva.mapping.blank_width is None
    assert televisiva.mapping.blank_height is None
    assert televisiva.mapping.redraw_ot_badge is False
    assert televisiva.mapping.blank_mcids == [63]
