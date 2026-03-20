# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
Test script: Render a mocked canvas-editor JSON template to PDF via WeasyPrint.

Usage:
    cd backend/
    python ../scripts/test_render_template.py

Generates: test_output.pdf in the current directory.
"""

import json
import os
import sys

# Add backend to path
backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.abspath(backend_dir))

from template_editor.compiler import compileTemplateJsonToJinja
from template_editor.models import TemplateJson

# ─── Mock canvas-editor JSON ─────────────────────────────────────────────────

MOCK_CANVAS_TEMPLATE = {
    "reportType": "default",
    "metadata": {
        "source": "canvas-editor-v3",
        "pageSettings": {
            "width": 210,
            "height": 297,
            "backgroundColor": "#ffffff",
        },
    },
    "variableBindings": {},
    "sections": [
        {
            "id": "sec_1",
            "type": "body",
            "title": "Page 1",
            "blocks": [
                # Logo top-left
                {
                    "id": "el_logo_left",
                    "type": "logo",
                    "content": "",
                    "metadata": {
                        "layout": {"x": 5, "y": 5, "width": 50, "height": 18},
                        "variableName": "logo_left",
                    },
                },
                # Logo top-right
                {
                    "id": "el_logo_right",
                    "type": "logo",
                    "content": "",
                    "metadata": {
                        "layout": {"x": 155, "y": 5, "width": 50, "height": 18},
                        "variableName": "logo_right",
                    },
                },
                # Title heading
                {
                    "id": "el_title",
                    "type": "heading",
                    "content": "PANEL FOTOGRAFICO",
                    "metadata": {
                        "layout": {"x": 55, "y": 5, "width": 100, "height": 18},
                        "style": {
                            "fontSize": 14,
                            "fontWeight": "bold",
                            "textAlign": "center",
                            "color": "#333",
                        },
                    },
                },
                # Horizontal divider
                {
                    "id": "el_divider",
                    "type": "divider",
                    "content": "",
                    "metadata": {
                        "layout": {"x": 5, "y": 25, "width": 200, "height": 2},
                        "dividerConfig": {
                            "orientation": "horizontal",
                            "color": "#6d4cff",
                            "thickness": 2,
                            "style": "solid",
                        },
                    },
                },
                # Data table
                {
                    "id": "el_table",
                    "type": "table",
                    "content": "",
                    "metadata": {
                        "layout": {"x": 5, "y": 30, "width": 200, "height": 25},
                        "tableData": {
                            "rowCount": 3,
                            "colCount": 4,
                            "data": [
                                ["CENTRO", "{{ report.data.get('centro', '-') }}", "CS", "{{ report.data.get('cs', '-') }}"],
                                ["CONTRATISTA", "{{ report.data.get('contratista', '-') }}", "FECHA", "{{ report.data.get('fecha', '-') }}"],
                                ["ACTIVIDAD", "{{ report.data.get('actividad', '-') }}", "", ""],
                            ],
                            "borderColor": "#cbd5e1",
                            "colWidths": [20, 30, 20, 30],
                            "rowHeights": [33, 33, 34],
                        },
                    },
                },
                # Photo grid
                {
                    "id": "el_photos",
                    "type": "photo-grid",
                    "content": "",
                    "metadata": {
                        "layout": {"x": 5, "y": 60, "width": 200, "height": 200},
                        "count": 4,
                        "showLabels": True,
                        "labels": ["ANTES", "DURANTE", "DESPUES", "DETALLE"],
                        "oddPosition": "center",
                    },
                },
                # Rotated text (testing rotation)
                {
                    "id": "el_rotated",
                    "type": "text",
                    "content": "TEXTO ROTADO 45 GRADOS",
                    "metadata": {
                        "layout": {"x": 160, "y": 265, "width": 40, "height": 10, "rotation": -45},
                        "style": {
                            "fontSize": 7,
                            "color": "#999",
                        },
                    },
                },
                # Signature
                {
                    "id": "el_sig",
                    "type": "signature",
                    "content": "",
                    "metadata": {
                        "layout": {"x": 60, "y": 270, "width": 90, "height": 20},
                        "title": "SUPERVISOR",
                        "name": "Ing. Juan Perez",
                    },
                },
                # Rectangle shape
                {
                    "id": "el_rect",
                    "type": "rectangle",
                    "content": "",
                    "metadata": {
                        "layout": {"x": 5, "y": 265, "width": 45, "height": 25},
                        "style": {
                            "backgroundColor": "#f0f0ff",
                            "borderWidth": 1,
                            "borderStyle": "solid",
                            "borderColor": "#6d4cff",
                            "borderRadius": 2,
                        },
                    },
                },
            ],
        }
    ],
}

# ─── Mock block-editor JSON (traditional) ────────────────────────────────────

MOCK_BLOCK_TEMPLATE = {
    "reportType": "default",
    "metadata": {"source": "block-editor"},
    "variableBindings": {},
    "sections": [
        {
            "id": "sec_1",
            "type": "header",
            "title": "Header",
            "blocks": [
                {
                    "id": "b_header",
                    "type": "header",
                    "content": "",
                    "metadata": {"title": "PANEL FOTOGRAFICO", "showLogos": True},
                },
            ],
        },
        {
            "id": "sec_2",
            "type": "body",
            "title": "Body",
            "blocks": [
                {
                    "id": "b_info",
                    "type": "info-bar",
                    "content": "",
                    "metadata": {
                        "fields": [
                            {"label": "CS", "variable": "cs"},
                            {"label": "Contratista", "variable": "contratista"},
                            {"label": "Fecha", "variable": "fecha_corte"},
                        ]
                    },
                },
                {
                    "id": "b_section",
                    "type": "section-title",
                    "content": "",
                    "metadata": {"number": "1", "text": "DATOS GENERALES", "color": "#0056b3"},
                },
                {
                    "id": "b_grid",
                    "type": "data-grid",
                    "content": "",
                    "metadata": {
                        "columns": 6,
                        "fields": [
                            {"label": "Centro", "variable": "centro"},
                            {"label": "Infraestructura", "variable": "codigo_infraestructura"},
                            {"label": "Suministro", "variable": "suministro"},
                            {"label": "Actividad", "variable": "actividad"},
                        ],
                        "spanFields": ["actividad"],
                    },
                },
                {
                    "id": "b_photos",
                    "type": "photo-grid",
                    "content": "",
                    "metadata": {
                        "count": 4,
                        "showLabels": True,
                        "labels": ["ANTES", "DURANTE", "DESPUES", "DETALLE"],
                        "panelTitle": "EVIDENCIA FOTOGRAFICA",
                    },
                },
            ],
        },
        {
            "id": "sec_3",
            "type": "signatures",
            "title": "Signatures",
            "blocks": [
                {
                    "id": "b_sigs",
                    "type": "signatures",
                    "content": "",
                    "metadata": {
                        "signatures": [
                            {"title": "SUPERVISOR", "name": "Ing. Juan Perez"},
                            {"title": "RESIDENTE", "name": "Arq. Maria Lopez"},
                        ],
                        "gap": 20,
                    },
                },
            ],
        },
    ],
}

# ─── Mock Jinja2 context data ────────────────────────────────────────────────

MOCK_CONTEXT = {
    "title": "PANEL FOTOGRAFICO",
    "logo_left": None,
    "logo_right": None,
    "reports": [
        {
            "data": {
                "cs": "CS-001-2026",
                "contratista": "CONSTRUCTORA ABC S.A.C.",
                "codigo_infraestructura": "INF-2026-0042",
                "suministro": "25847",
                "actividad": "Instalacion de medidor de agua potable",
                "centro": "CENTRO NORTE",
                "fecha_corte": "2026-02-19",
            },
            "images": [
                {"path": "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22200%22%20height%3D%22150%22%3E%3Crect%20fill%3D%22%23e5e7eb%22%20width%3D%22200%22%20height%3D%22150%22/%3E%3Ctext%20fill%3D%22%239ca3af%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%20text-anchor%3D%22middle%22%20x%3D%22100%22%20y%3D%2280%22%3EANTES%3C/text%3E%3C/svg%3E", "name": "foto_antes.jpg"},
                {"path": "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22200%22%20height%3D%22150%22%3E%3Crect%20fill%3D%22%23e5e7eb%22%20width%3D%22200%22%20height%3D%22150%22/%3E%3Ctext%20fill%3D%22%239ca3af%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%20text-anchor%3D%22middle%22%20x%3D%22100%22%20y%3D%2280%22%3EDURANTE%3C/text%3E%3C/svg%3E", "name": "foto_durante.jpg"},
                {"path": "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22200%22%20height%3D%22150%22%3E%3Crect%20fill%3D%22%23e5e7eb%22%20width%3D%22200%22%20height%3D%22150%22/%3E%3Ctext%20fill%3D%22%239ca3af%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%20text-anchor%3D%22middle%22%20x%3D%22100%22%20y%3D%2280%22%3EDESPUES%3C/text%3E%3C/svg%3E", "name": "foto_despues.jpg"},
                {"path": "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22200%22%20height%3D%22150%22%3E%3Crect%20fill%3D%22%23e5e7eb%22%20width%3D%22200%22%20height%3D%22150%22/%3E%3Ctext%20fill%3D%22%239ca3af%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%20text-anchor%3D%22middle%22%20x%3D%22100%22%20y%3D%2280%22%3EDETALLE%3C/text%3E%3C/svg%3E", "name": "foto_detalle.jpg"},
            ],
            "layout_mode": "grid",
            "img_count": 4,
        }
    ],
}


def test_compile_and_render(template_dict: dict, label: str, output_name: str):
    """Compile template JSON → Jinja2 HTML → render with mock data → PDF."""
    print(f"\n{'='*60}")
    print(f"  Testing: {label}")
    print(f"{'='*60}")

    # Step 1: Parse and compile
    template_json = TemplateJson(**template_dict)
    compiled_html = compileTemplateJsonToJinja(template_json)

    # Save compiled HTML for inspection
    html_path = output_name.replace(".pdf", ".html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(compiled_html)
    print(f"  [OK] Compiled HTML saved to: {html_path}")
    print(f"       HTML size: {len(compiled_html)} bytes")

    # Step 2: Render with Jinja2
    from jinja2 import Template
    template = Template(compiled_html)
    rendered_html = template.render(**MOCK_CONTEXT)

    rendered_path = output_name.replace(".pdf", "_rendered.html")
    with open(rendered_path, "w", encoding="utf-8") as f:
        f.write(rendered_html)
    print(f"  [OK] Rendered HTML saved to: {rendered_path}")

    # Step 3: Generate PDF with WeasyPrint (if available)
    try:
        from weasyprint import HTML as WeasyprintHTML
        WeasyprintHTML(string=rendered_html).write_pdf(output_name)
        file_size = os.path.getsize(output_name)
        print(f"  [OK] PDF generated: {output_name} ({file_size / 1024:.1f} KB)")
    except ImportError:
        print("  [SKIP] WeasyPrint not available — PDF not generated")
        print("         Install with: pip install weasyprint")
        print("         (Requires GTK3 runtime on Windows)")
    except Exception as e:
        print(f"  [ERROR] PDF generation failed: {e}")

    return compiled_html


def main():
    print("Template Render Test")
    print("=" * 60)

    # Test 1: Canvas-style template
    test_compile_and_render(
        MOCK_CANVAS_TEMPLATE,
        "Canvas Editor Template (position: absolute)",
        "test_canvas_output.pdf",
    )

    # Test 2: Block-style template
    test_compile_and_render(
        MOCK_BLOCK_TEMPLATE,
        "Block Editor Template (flex layout)",
        "test_block_output.pdf",
    )

    print(f"\n{'='*60}")
    print("  Tests complete!")
    print("  Open the _rendered.html files in a browser to verify layout.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
