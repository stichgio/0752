# Multi-Sheet Local Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an independent templates folder for multi_sheet_report.py, add a Volanteo Local template, expose it via API, render it in PDF generation, and show a full A4 iframe preview in the frontend.

**Architecture:** New folder `backend/routers/multi_sheet_templates/` holds HTML Jinja2 templates (single-page, no outer loop). The backend scans this folder to expose a "local" section in /templates, serves raw HTML via a new endpoint, and renders with Jinja2 during PDF generation. The frontend fetches the HTML, substitutes variables client-side, and renders in a scaled `<iframe>` inside `SheetPreviewCard`.

**Tech Stack:** FastAPI + Jinja2 + WeasyPrint (backend), React + Tailwind (frontend, only MultiSheetReportApp.jsx)

---

## Task 1: Create the local templates folder and volanteo template

**Files:**
- Create: `backend/routers/multi_sheet_templates/Volanteo Local.html`

**Context variables used by this template:**
- `{{ logo_left }}` / `{{ logo_right }}` — data URI strings or empty
- `{% if logo_left %}...{% else %}...{% endif %}` — logo conditionals
- `{{ data.get('CAMPO', '-') }}` — row data fields
- `{% if images and images|length > 0 %}...{% else %}...{% endif %}` — image presence
- `{% for img in images[:4] %}{{ img.path }}{% endfor %}` — image loop (up to 4)
- `{% for i in range(images|length, 4) %}...{% endfor %}` — placeholder fill

**Step 1: Create the folder**

```bash
mkdir "backend/routers/multi_sheet_templates"
```

**Step 2: Create `Volanteo Local.html`**

Adapts `backend/templates/report_volanteo.html` — same CSS, same visual layout — but:
- No `{% for report in reports %}` wrapper
- `{{ data.get(...) }}` instead of `{{ report.data.get(...) }}`
- `{% for img in images[:4] %}` instead of `{% for img in report.images[:4] %}`

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Panel Fotográfico Volanteo Local</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4; margin: 0; }
        html, body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10px; line-height: 1.3;
            color: #222; background: #fff;
            margin: 0; padding: 0;
        }
        .page {
            width: 210mm; height: 297mm; max-height: 297mm;
            margin: 0; padding: 8mm; background: #fff;
            display: flex; flex-direction: column; overflow: hidden;
        }
        .header {
            display: flex; justify-content: space-between; align-items: center;
            height: 20mm; padding-bottom: 4mm; border-bottom: 2px solid #333;
            margin-bottom: 3mm; flex-shrink: 0;
        }
        .header-logo {
            width: 55mm; height: 18mm;
            display: flex; align-items: center; justify-content: center;
        }
        .header-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .header-logo-placeholder { font-size: 14px; font-weight: bold; color: #666; }
        .header-title { flex: 1; text-align: center; }
        .header-title h1 {
            font-size: 20px; font-weight: bold;
            text-transform: uppercase; letter-spacing: 1px; color: #000;
        }
        .info-bar {
            display: flex; justify-content: space-between;
            border: 1px solid #ccc; margin-bottom: 2mm; flex-shrink: 0;
        }
        .info-item {
            flex: 1; display: flex; flex-direction: column;
            padding: 1.5mm 2mm; border-right: 1px solid #ccc; line-height: 1.2;
        }
        .info-item:last-child { border-right: none; }
        .info-label { font-size: 9pt; font-weight: bold; text-transform: uppercase; color: #666; }
        .info-value { font-size: 9pt; font-weight: 600; color: #000; }
        .section-title {
            font-size: 10pt; font-weight: bold; color: #0066cc;
            text-transform: uppercase; margin-bottom: 3mm;
            padding-bottom: 3px; border-bottom: 1px solid #0066cc; flex-shrink: 0;
        }
        .localizacion { margin-bottom: 3mm; flex-shrink: 0; }
        .loc-row { display: flex; margin-bottom: 4px; }
        .loc-row.full { display: block; }
        .loc-field { display: flex; align-items: baseline; margin-right: 30px; }
        .loc-field.full { width: 100%; margin-right: 0; }
        .loc-label {
            font-size: 9pt; font-weight: bold; text-transform: uppercase;
            color: #333; margin-right: 8px; white-space: nowrap;
        }
        .loc-value { font-size: 9pt; color: #000; }
        .panel-fotografico {
            flex: 1; display: flex; flex-direction: column;
            min-height: 0; overflow: hidden;
        }
        .photo-grid {
            display: grid; grid-template-columns: repeat(2, 1fr);
            grid-template-rows: repeat(2, 1fr); gap: 2mm;
            flex: 1; min-height: 0;
            border: 1px solid #0066cc; padding: 2mm; overflow: hidden;
        }
        .photo-cell {
            position: relative; background: #f5f5f5;
            border: 1px solid #ddd; overflow: hidden;
            min-height: 0; min-width: 0;
            display: flex; align-items: center; justify-content: center;
        }
        .photo-cell img {
            max-width: 100%; max-height: 100%;
            object-fit: contain; object-position: center; display: block;
        }
        .photo-placeholder {
            width: 100%; height: 100%; display: flex;
            align-items: center; justify-content: center;
            color: #999; font-size: 11px; font-style: italic;
        }
        .no-photos {
            flex: 1; display: flex; align-items: center; justify-content: center;
            min-height: 0; color: #999; font-style: italic;
            border: 1px solid #0066cc;
        }
    </style>
</head>
<body>
<div class="page">
    <header class="header">
        <div class="header-logo">
            {% if logo_left %}
            <img src="{{ logo_left }}" alt="Logo Izquierdo">
            {% else %}
            <span class="header-logo-placeholder"></span>
            {% endif %}
        </div>
        <div class="header-title"><h1>Panel Fotográfico Volanteo</h1></div>
        <div class="header-logo">
            {% if logo_right %}
            <img src="{{ logo_right }}" alt="Logo Derecho">
            {% else %}
            <span class="header-logo-placeholder"></span>
            {% endif %}
        </div>
    </header>
    <div class="info-bar">
        <div class="info-item">
            <div class="info-label">Centro de Servicios:</div>
            <div class="info-value">{{ data.get('CENTRO', '-') }}</div>
        </div>
        <div class="info-item">
            <div class="info-label">NIS:</div>
            <div class="info-value">{{ data.get('NIS', '-') }}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Sector:</div>
            <div class="info-value">{{ data.get('SECTOR', '-') }}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Fecha de Corte:</div>
            <div class="info-value">{{ data.get('FECHA CORTE', '-') }}</div>
        </div>
    </div>
    <section class="localizacion">
        <div class="section-title">1.0 Localización</div>
        <div class="loc-row full">
            <div class="loc-field full">
                <span class="loc-label">Direcciones Afectadas:</span>
                <span class="loc-value">{{ data.get('DIRECCIONES AFECTADAS', '-') }}</span>
            </div>
        </div>
        <div class="loc-row">
            <div class="loc-field">
                <span class="loc-label">Distrito:</span>
                <span class="loc-value">{{ data.get('DISTRITO', '-') }}</span>
            </div>
            <div class="loc-field">
                <span class="loc-label">Codigo de Componente:</span>
                <span class="loc-value">{{ data.get('CODIGO COMPONENTE', '-') }}</span>
            </div>
            <div class="loc-field">
                <span class="loc-label">Estado:</span>
                <span class="loc-value">{{ data.get('ESTADO', '-') }}</span>
            </div>
        </div>
    </section>
    <section class="panel-fotografico">
        <div class="section-title">2.0 Panel Fotográfico</div>
        {% if images and images|length > 0 %}
        <div class="photo-grid">
            {% for img in images[:4] %}
            <div class="photo-cell">
                <img src="{{ img.path }}" alt="Foto {{ loop.index }}">
            </div>
            {% endfor %}
            {% for i in range(images|length, 4) %}
            <div class="photo-cell">
                <div class="photo-placeholder">Sin imagen</div>
            </div>
            {% endfor %}
        </div>
        {% else %}
        <div class="no-photos">
            No se encontraron imágenes asociadas a este registro.
        </div>
        {% endif %}
    </section>
</div>
</body>
</html>
```

**Step 3: Verify file exists**

```bash
ls "backend/routers/multi_sheet_templates/"
# Expected: Volanteo Local.html
```

---

## Task 2: Backend — local template discovery + HTML endpoint

**Files:**
- Modify: `backend/routers/multi_sheet_report.py`

**Step 1: Write failing test for local template discovery**

In `backend/tests/test_multi_sheet_report.py`, add:

```python
def test_list_templates_includes_local_section(client):
    """Local templates folder adds a 'local' section to /templates."""
    response = client.get("/api/multi-sheet/templates")
    assert response.status_code == 200
    payload = response.json()
    sections = {s["id"]: s for s in payload["sections"]}
    assert "local" in sections
    # "Volanteo Local" must appear (file exists in multi_sheet_templates/)
    assert "Volanteo Local" in sections["local"]["templates"]


def test_get_local_template_html_returns_content(client):
    """GET /templates/{name}/html returns the HTML file content."""
    response = client.get("/api/multi-sheet/templates/Volanteo%20Local/html")
    assert response.status_code == 200
    content = response.text
    assert "Panel Fotográfico Volanteo" in content
    assert "{{ data.get(" in content  # raw Jinja2 in file


def test_get_local_template_html_404_for_unknown(client):
    """GET /templates/{name}/html returns 404 for non-existent template."""
    response = client.get("/api/multi-sheet/templates/DoesNotExist/html")
    assert response.status_code == 404
```

Run: `cd backend && python -m pytest tests/test_multi_sheet_report.py::test_list_templates_includes_local_section -v`
Expected: FAIL — "local" section not found.

**Step 2: Add constants and local discovery to `multi_sheet_report.py`**

After the existing `_BUILTIN_LAYOUTS` lines (around line 514), add:

```python
# ── Local templates (backend/routers/multi_sheet_templates/) ──────────────────
_LOCAL_TEMPLATES_DIR: str = os.path.join(os.path.dirname(__file__), "multi_sheet_templates")


def _list_local_template_names() -> list[str]:
    """Return display names (filename without .html) of local HTML templates."""
    try:
        if not os.path.isdir(_LOCAL_TEMPLATES_DIR):
            return []
        return [
            os.path.splitext(f)[0]
            for f in sorted(os.listdir(_LOCAL_TEMPLATES_DIR))
            if f.lower().endswith(".html")
        ]
    except Exception as exc:
        print(f"[MultiSheet] Error listing local templates: {exc}")
        return []
```

**Step 3: Update `_build_template_sections` to include local section**

Replace the existing `_build_template_sections` function (around line 550):

```python
def _build_template_sections() -> list[dict[str, Any]]:
    independent = _list_independent_template_names()
    local = _list_local_template_names()
    return [
        {
            "id": "builtin",
            "label": "Plantillas base",
            "templates": list(_BUILTIN_LAYOUTS),
        },
        {
            "id": "local",
            "label": "Plantillas locales",
            "templates": local,
        },
        {
            "id": "independent",
            "label": "Plantillas independientes",
            "templates": independent,
        },
    ]
```

**Step 4: Update `list_templates` to include local names in flat list**

The existing `/templates` endpoint builds `flattened` from all sections — since local templates are now in sections, the flat list builds automatically. No change needed to the endpoint itself.

**Step 5: Add the HTML content endpoint**

After the `/templates/independent` endpoint (around line 570), add:

```python
@router.get("/templates/{template_name}/html")
async def get_local_template_html(template_name: str) -> str:
    """Return the raw HTML of a local template file (for client-side preview)."""
    file_path = os.path.join(_LOCAL_TEMPLATES_DIR, f"{template_name}.html")
    # Security: resolve symlinks and ensure path stays within the dir
    try:
        resolved = os.path.realpath(file_path)
        expected_prefix = os.path.realpath(_LOCAL_TEMPLATES_DIR)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template name")

    if not resolved.startswith(expected_prefix + os.sep) and resolved != expected_prefix:
        raise HTTPException(status_code=400, detail="Invalid template name")

    if not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")

    with open(resolved, "r", encoding="utf-8") as fh:
        return fh.read()
```

**Step 6: Run the three new tests**

```bash
cd backend && python -m pytest tests/test_multi_sheet_report.py::test_list_templates_includes_local_section tests/test_multi_sheet_report.py::test_get_local_template_html_returns_content tests/test_multi_sheet_report.py::test_get_local_template_html_404_for_unknown -v
```
Expected: All 3 PASS.

**Step 7: Run full test suite to confirm no regressions**

```bash
cd backend && python -m pytest tests/test_multi_sheet_report.py -v
```
Expected: All existing tests still pass.

**Step 8: Commit**

```bash
git add backend/routers/multi_sheet_templates/ backend/routers/multi_sheet_report.py backend/tests/test_multi_sheet_report.py
git commit -m "feat(multi-sheet): add local templates folder, discovery, and HTML endpoint"
```

---

## Task 3: Backend — PDF generation with local templates (Jinja2 render)

**Files:**
- Modify: `backend/routers/multi_sheet_report.py`

**Step 1: Write failing test**

In `backend/tests/test_multi_sheet_report.py`, add:

```python
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
    # Template was rendered (Jinja2 vars replaced)
    assert "CS Sur" in html
    assert "99999" in html
    assert "CC-200" in html
    # Template markup appears
    assert "Panel Fotográfico Volanteo" in html
```

Run: `cd backend && python -m pytest tests/test_multi_sheet_report.py::test_generate_pdf_with_local_volanteo_template -v`
Expected: FAIL — "Volanteo Local" not handled in generate-pdf.

**Step 2: Add Jinja2 rendering branch in `generate_multi_sheet_pdf`**

In `multi_sheet_report.py`, inside `generate_multi_sheet_pdf`, locate the block that dispatches on `template_name` (around line 675):

```python
# Existing:
if template_name == _VOLANTEO_TEMPLATE_NAME:
    page_html = _build_volanteo_page_html(...)
else:
    # grid branch
    ...
```

Add the local template branch **before** the existing `if`:

```python
local_names = _list_local_template_names()
if template_name in local_names:
    page_html = _render_local_template(
        template_name=template_name,
        header=header,
        row_data=row_data,
        images_b64=images_b64,
        image_filenames=image_filenames,
    )
elif template_name == _VOLANTEO_TEMPLATE_NAME:
    ...
else:
    ...
```

**Step 3: Add `_render_local_template` helper function**

Add this function before the `generate_multi_sheet_pdf` endpoint (after the PDF engine section, around line 468):

```python
def _render_local_template(
    template_name: str,
    header: dict[str, Any],
    row_data: dict[str, Any],
    images_b64: list[str],
    image_filenames: list[str],
) -> str:
    """Render a local HTML template (Jinja2) with row data and images."""
    try:
        from jinja2 import Environment, FileSystemLoader, select_autoescape  # type: ignore
    except ImportError as exc:
        raise RuntimeError("Jinja2 no está instalado.") from exc

    env = Environment(
        loader=FileSystemLoader(_LOCAL_TEMPLATES_DIR),
        autoescape=select_autoescape(["html"]),
    )
    tmpl = env.get_template(f"{template_name}.html")

    images_list = [
        {"path": uri, "name": fname}
        for uri, fname in zip(images_b64, image_filenames)
    ]

    return tmpl.render(
        logo_left=header.get("logoLeft") or "",
        logo_right=header.get("logoRight") or "",
        data=row_data,
        images=images_list,
    )
```

**Step 4: Run the new test**

```bash
cd backend && python -m pytest tests/test_multi_sheet_report.py::test_generate_pdf_with_local_volanteo_template -v
```
Expected: PASS.

**Step 5: Run full test suite**

```bash
cd backend && python -m pytest tests/test_multi_sheet_report.py -v
```
Expected: All pass.

**Step 6: Commit**

```bash
git add backend/routers/multi_sheet_report.py backend/tests/test_multi_sheet_report.py
git commit -m "feat(multi-sheet): render local templates via Jinja2 in PDF generation"
```

---

## Task 4: Frontend — local template detection + HTML fetch in MultiSheetReportApp.jsx

**Files:**
- Modify: `frontend/src/components/tools/MultiSheetReport/MultiSheetReportApp.jsx`

**Background:** The frontend needs to:
1. Know which templates are "local" (from the `sections` API response)
2. Fetch the HTML content of a local template when selected
3. Cache fetched HTML to avoid repeated requests
4. Pass local template info down to `SheetPreviewCard`

**Step 1: Add state for local template names and HTML cache**

In `MultiSheetReportApp`, after the `availableTemplates` / `templateSections` state (around line 466):

```javascript
// Set of template names that come from the local folder
const [localTemplateNames, setLocalTemplateNames] = useState(new Set());
// Cache: template name → raw HTML string
const localTemplateHtmlCache = useRef({});
```

**Step 2: Populate `localTemplateNames` when sections load**

In the `useEffect` that fetches templates (around line 481), after `setTemplateSections(sections)`:

```javascript
const localSection = sections.find(s => s.id === 'local');
if (localSection) {
    setLocalTemplateNames(new Set(localSection.templates));
}
```

**Step 3: Add `fetchLocalTemplateHtml` function**

After the `getImagesForRow` callback (around line 649), add:

```javascript
const fetchLocalTemplateHtml = useCallback(async (templateName) => {
    if (localTemplateHtmlCache.current[templateName]) {
        return localTemplateHtmlCache.current[templateName];
    }
    const encoded = encodeURIComponent(templateName);
    const res = await fetch(`${API_BASE}/templates/${encoded}/html`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    localTemplateHtmlCache.current[templateName] = html;
    return html;
}, []);
```

**Step 4: Update `SheetPreviewCard` call to pass new props**

Find all calls to `<SheetPreviewCard` in the JSX (render section, around line 980+) and add the new props:

```jsx
<SheetPreviewCard
    ...existing props...
    localTemplateNames={localTemplateNames}
    fetchLocalTemplateHtml={fetchLocalTemplateHtml}
/>
```

**Step 5: No test for this step** — covered in Task 5 when the full preview works.

**Step 6: Commit (as part of Task 5 combined commit)**

---

## Task 5: Frontend — client-side template rendering + A4 iframe preview in SheetPreviewCard

**Files:**
- Modify: `frontend/src/components/tools/MultiSheetReport/MultiSheetReportApp.jsx`

**Background:** `SheetPreviewCard` must detect local templates, fetch their HTML, substitute Jinja2 variables client-side, and display an A4-scaled iframe.

**Step 1: Add `renderLocalTemplate` pure function**

Add this function near the top of the file, after the other utility functions (after `getRowTextValue`, around line 74):

```javascript
/**
 * Client-side Jinja2 substitution for local multi-sheet templates.
 * Handles the subset of Jinja2 used in multi_sheet_templates/*.html:
 *   - {{ logo_left }} / {{ logo_right }}
 *   - {% if logo_left %}...{% else %}...{% endif %}
 *   - {{ data.get('KEY', '-') }}
 *   - {% if images and images|length > 0 %}...{% else %}...{% endif %}
 *   - {% for img in images[:4] %}...{% endfor %}
 *   - {% for i in range(images|length, 4) %}...{% endfor %}
 */
function renderLocalTemplate(html, rowData, logoLeft, logoRight, images) {
    const emptyPixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";

    // Logo if/else conditionals
    html = html.replace(
        /\{%\s*if\s+logo_left\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, ifPart, elsePart) => (logoLeft ? ifPart : elsePart)
    );
    html = html.replace(
        /\{%\s*if\s+logo_right\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, ifPart, elsePart) => (logoRight ? ifPart : elsePart)
    );
    // Logo if-only (no else)
    html = html.replace(
        /\{%\s*if\s+logo_left\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, content) => (logoLeft ? content : '')
    );
    html = html.replace(
        /\{%\s*if\s+logo_right\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, content) => (logoRight ? content : '')
    );

    // Logo variable substitution
    html = html.replaceAll('{{ logo_left }}', logoLeft || emptyPixel);
    html = html.replaceAll('{{ logo_right }}', logoRight || emptyPixel);

    // Image presence conditional
    const imgCount = images.length;
    html = html.replace(
        /\{%\s*if\s+images\s+and\s+images\|length\s*>\s*0\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
        (_, ifPart, elsePart) => (imgCount > 0 ? ifPart : elsePart)
    );

    // Row data: {{ data.get('KEY', 'default') }}
    html = html.replace(
        /\{\{\s*data\.get\('([^']+)',\s*'([^']*)'\)\s*\}\}/g,
        (_, key, def) => (rowData?.[key] != null ? String(rowData[key]) : def || '-')
    );

    // Image loop: {% for img in images[:N] %}...{% endfor %}
    html = html.replace(
        /\{%\s*for\s+img\s+in\s+images\[:\d+\]\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
        (_, loopContent) =>
            images.slice(0, 4).map((img, i) => {
                let item = loopContent;
                item = item.replaceAll('{{ img.path }}', img.url || '');
                item = item.replaceAll('{{ img.name }}', img.name || '');
                item = item.replaceAll('{{ loop.index }}', String(i + 1));
                return item;
            }).join('')
    );

    // Placeholder fill: {% for i in range(images|length, N) %}...{% endfor %}
    html = html.replace(
        /\{%\s*for\s+i\s+in\s+range\(images\|length,\s*(\d+)\)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
        (_, maxStr, content) => {
            const remaining = parseInt(maxStr, 10) - imgCount;
            return remaining > 0 ? content.repeat(remaining) : '';
        }
    );

    // Strip any remaining Jinja2 tags
    html = html.replace(/\{%[\s\S]*?%\}/g, '');
    html = html.replace(/\{\{[\s\S]*?\}\}/g, '-');

    return html;
}
```

**Step 2: Update `SheetPreviewCard` to accept new props and show local preview**

In the `SheetPreviewCard` function signature, add:

```javascript
function SheetPreviewCard({
    sheet, index, total, headerTitle, headerSubtitle,
    logoLeft, logoRight, altHeaderConfig, rowData, allImages, idColumn,
    localTemplateNames,      // ← new
    fetchLocalTemplateHtml,  // ← new
}) {
```

After the existing variable declarations at the top of `SheetPreviewCard` (after `rowImages`, around line 328), add:

```javascript
const isLocalTemplate = sheet.templateName != null && localTemplateNames.has(sheet.templateName);

// Local template HTML state
const [localRenderedHtml, setLocalRenderedHtml] = useState(null);

useEffect(() => {
    if (!isLocalTemplate || !sheet.templateName) {
        setLocalRenderedHtml(null);
        return;
    }
    let cancelled = false;
    fetchLocalTemplateHtml(sheet.templateName)
        .then(rawHtml => {
            if (!cancelled) {
                const rendered = renderLocalTemplate(
                    rawHtml, rowData, logoLeft, logoRight, rowImages
                );
                setLocalRenderedHtml(rendered);
            }
        })
        .catch(err => console.error('[MultiSheet] Preview fetch error:', err));
    return () => { cancelled = true; };
}, [isLocalTemplate, sheet.templateName, rowData, logoLeft, logoRight, rowImages, fetchLocalTemplateHtml]);
```

**Step 3: Add `LocalTemplatePreview` display in SheetPreviewCard JSX**

Inside the `hasTemplate` branch in the JSX (after the `isVolanteoTemplate` preview block, around line 398-405), add:

```jsx
{isLocalTemplate && localRenderedHtml && (
    <LocalTemplateIframePreview renderedHtml={localRenderedHtml} />
)}
```

**Step 4: Add `LocalTemplateIframePreview` component**

Add this component near the other preview subcomponents (before `SheetPreviewCard`, around line 217):

```javascript
const A4_WIDTH_PX = 794;   // 210mm @ 96 dpi
const A4_HEIGHT_PX = 1123; // 297mm @ 96 dpi

/** Scales a full A4 iframe to fit a thumbnail container. */
function LocalTemplateIframePreview({ renderedHtml }) {
    const containerRef = useRef(null);
    const [scale, setScale] = useState(0.38); // default ~300px wide

    useEffect(() => {
        if (!containerRef.current) return;
        const updateScale = () => {
            const w = containerRef.current?.offsetWidth || 300;
            setScale(w / A4_WIDTH_PX);
        };
        updateScale();
        const ro = new ResizeObserver(updateScale);
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    const scaledHeight = A4_HEIGHT_PX * scale;

    return (
        <div
            ref={containerRef}
            className="mt-2 rounded overflow-hidden border border-neutral-200"
            style={{ width: '100%', height: scaledHeight }}
        >
            <iframe
                srcDoc={renderedHtml}
                sandbox="allow-same-origin"
                title="Local Template Preview"
                style={{
                    width: A4_WIDTH_PX,
                    height: A4_HEIGHT_PX,
                    border: 'none',
                    display: 'block',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                }}
            />
        </div>
    );
}
```

**Step 5: Handle the badge for local templates in `SheetPreviewCard`**

In the existing badge section (around line 380-391 where `isGridTemplate` and `isVolanteoTemplate` show their "X fotos" badge), add a similar badge for local templates:

```jsx
{isLocalTemplate && (
    <div className="bg-white/50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
        <FileText size={10} className="text-emerald-600" />
        <span className="text-[9px] font-bold text-emerald-700">Plantilla local</span>
    </div>
)}
```

**Step 6: Dev-test manually**

1. Start backend: `cd backend && uvicorn main:app --reload --port 7860`
2. Start frontend: `cd frontend && npm run dev`
3. Open Multi-Sheet Report tool
4. Verify "Volanteo Local" appears in the template dropdown under "Plantillas locales"
5. Assign "Volanteo Local" to a sheet → verify the iframe preview shows up scaled in the SheetPreviewCard
6. Load Excel data + images → verify the preview updates with real data
7. Export PDF → verify the PDF has the correct layout rendered from the file

**Step 7: Commit**

```bash
git add frontend/src/components/tools/MultiSheetReport/MultiSheetReportApp.jsx
git commit -m "feat(multi-sheet): A4 iframe preview for local templates in SheetPreviewCard"
```

---

## Task 6: Final validation

**Step 1: Run all backend tests**

```bash
cd backend && python -m pytest tests/test_multi_sheet_report.py -v
```
Expected: All tests pass (including 4 new ones).

**Step 2: Verify no other tools were touched**

```bash
git diff --name-only HEAD~4
```
Expected: Only files in `backend/routers/multi_sheet_templates/`, `backend/routers/multi_sheet_report.py`, `backend/tests/test_multi_sheet_report.py`, and `frontend/src/components/tools/MultiSheetReport/MultiSheetReportApp.jsx`.

**Step 3: Final commit if any cleanup**

```bash
git add -p  # review any uncommitted changes
git commit -m "chore(multi-sheet): final cleanup"
```

---

## Technical Specification (Implemented)

- **Template storage model**
  - Local templates are HTML files stored under `backend/msheets/multi_sheet_templates/`.
  - Backward compatibility is preserved with `backend/msheets/mtemplates/` as a fallback source.
  - Templates are identified by filename without `.html` and exposed as display names.

- **Discovery and persistence layer**
  - Discovery scans candidate directories in deterministic order and de-duplicates by template name.
  - The first discovered template name wins, allowing controlled override precedence.
  - Rendering and preview retrieval use resolved template records (`name`, `file_path`, `directory`).

- **Backend API contract**
  - `GET /api/multi-sheet/templates`: returns grouped sections (`builtin`, `local`, `independent`).
  - `GET /api/multi-sheet/templates/{template_name}/html`: returns raw local HTML for client preview.
  - `POST /api/multi-sheet/generate-pdf`: supports built-in templates, local templates, and independent templates.

- **Template engine integration**
  - Local templates are rendered via Jinja2 from file content and context:
    - `logo_left`, `logo_right`
    - `data` (row data object)
    - `images` (`[{path, name}]`)
  - Multi-page generation splits each sheet images array by `imagesPerPage`.
  - Sequential image names (`*_001`, `*_010`, etc.) are sorted before grouping for deterministic output.

- **Validation and error handling**
  - Invalid template names return `404` for unknown resources.
  - JSON parse failures return `400`.
  - PDF render failures return `500` with explicit page-level context.
  - Temporary file cleanup is always scheduled and also enforced on exceptions.

- **Performance and compatibility**
  - Local template preview HTML is cached on the frontend.
  - A4 iframe preview scales with `ResizeObserver` to avoid layout thrashing.
  - Uses filesystem-safe APIs (`os.path`, realpath-based directory resolution) for Windows/Linux compatibility.

## User Guide

1. Open **Multi-Sheet Report**.
2. In template selector, choose any item under **Plantillas locales** (e.g., `Volanteo Local`).
3. Load Excel/CSV data and upload related images.
4. Assign template(s) to sheet(s) and review the A4 iframe preview.
5. Export PDF; the system will:
   - keep row data per sheet,
   - split images into multiple pages by `imagesPerPage`,
   - and render the selected local template with dynamic values.

## QA Checklist

- Local section appears in `/api/multi-sheet/templates`.
- `/api/multi-sheet/templates/Volanteo%20Local/html` returns template HTML.
- Local template PDF generation renders row fields and images correctly.
- Image sorting and page splitting are deterministic.
- Backend tests pass, frontend tests pass, and frontend build succeeds.
