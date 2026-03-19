import io

from pypdf import PdfReader

from backend.formatos.catalog import catalog
from backend.formatos.models import GenerateRequest
from backend.formatos.router import (
    _build_overlay_stamp_pdf,
    _generate_visual,
    _load_template_bytes,
    generate,
)


def test_template_d_still_uses_legacy_strategy(monkeypatch):
    called = {"legacy": 0, "visual": 0}

    monkeypatch.setattr("backend.formatos.router._load_template_bytes", lambda entry: b"template")

    def fake_legacy(template_bytes, desde, hasta):
        called["legacy"] += 1
        return b"legacy-pdf"

    def fake_visual(template_bytes, desde, hasta, mapping):
        called["visual"] += 1
        return b"visual-pdf"

    monkeypatch.setattr("backend.formatos.router._generate_legacy", fake_legacy)
    monkeypatch.setattr("backend.formatos.router._generate_visual", fake_visual)

    response = generate(GenerateRequest(format_id="template-d", desde=1, hasta=1))

    assert response.body == b"legacy-pdf"
    assert called == {"legacy": 1, "visual": 0}


def test_overlay_stamp_pdf_is_well_formed():
    stamp_pdf = _build_overlay_stamp_pdf(0, 0, 100, 100, 'Helvetica-Bold', 'q\nQ\n')
    reader = PdfReader(io.BytesIO(stamp_pdf))

    assert len(reader.pages) == 1


def test_visual_formats_redraw_a_full_ot_badge():
    for format_id in ("maquina", "televisiva"):
        entry = catalog.get(format_id)
        assert entry is not None
        assert entry.mapping is not None
        assert entry.mapping.redraw_ot_badge is True

        pdf_bytes = _generate_visual(_load_template_bytes(entry), 123, 123, entry.mapping)
        page = PdfReader(io.BytesIO(pdf_bytes)).pages[0]
        content = page.get_contents().get_data()

        assert b"(OT\\072) Tj" in content
        assert b"(00123) Tj" in content
        assert b"h\nB\n" in content or b"h\r\nB\r\n" in content
        assert b" c\n" in content or b" c\r\n" in content


def test_visual_formats_have_the_adjusted_ot_mapping():
    maquina = catalog.get("maquina")
    televisiva = catalog.get("televisiva")

    assert maquina is not None and maquina.mapping is not None
    assert maquina.mapping.font_name == "Helvetica-Bold"
    assert maquina.mapping.x == 545
    assert maquina.mapping.blank_x == 501
    assert maquina.mapping.blank_width == 100
    assert maquina.mapping.blank_height == 37
    assert maquina.mapping.redraw_ot_badge is True

    assert televisiva is not None and televisiva.mapping is not None
    assert televisiva.mapping.font_name == "Helvetica-Bold"
    assert televisiva.mapping.redraw_ot_badge is True
