# Formato D Generator — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** New isolated tool that generates "Formato D" PDFs (C.P. 052-2024-SEDAPAL) individually or as consolidated multi-page PDFs, where only the 7-digit zero-padded number changes per page.

**Architecture:** Backend stores the original PDF as a binary template; pypdf replaces the single `(0000001)` string in the content stream for each requested number; pages are merged into one output PDF. Frontend adds a new route under the existing DashboardLayout with a simple range-selector UI.

**Tech Stack:** Python/FastAPI (pypdf 4.x), React/TypeScript/Tailwind (existing stack)

---

## Prerequisites

Copy the original PDF template to the backend data directory before starting:

```bash
mkdir -p backend/data/formato_d
cp "C:/Users/INTEL/Downloads/Item 01 - Formato D - 1.pdf" backend/data/formato_d/template.pdf
```

Verify the template has the number `0000001` in its content stream:

```bash
cd backend && python -c "
from pypdf import PdfReader
r = PdfReader('data/formato_d/template.pdf')
data = r.pages[0]['/Contents'].get_data()
assert b'(0000001)' in data, 'Template missing expected number string'
print('Template OK')
"
```

---

## Task 1: Backend — Create `formato_d` package

**Files:**
- Create: `backend/formato_d/__init__.py`
- Create: `backend/formato_d/router.py`

**Step 1: Create the package init**

```python
# backend/formato_d/__init__.py
```
(empty file)

**Step 2: Create the router**

```python
# backend/formato_d/router.py
"""
Generación de PDFs del Formato D (C.P. 052-2024-SEDAPAL).
Solo el número de 7 dígitos (ej. 0000001) cambia entre páginas.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pypdf import PdfReader, PdfWriter
import io
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/formato-d", tags=["formato-d"])

_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "formato_d", "template.pdf")
_TEMPLATE_NUMBER = b"(0000001)"
_MAX_PAGES = 500  # hard cap to avoid memory abuse


class GenerateRequest(BaseModel):
    desde: int = Field(..., ge=1, le=9999999, description="Número inicial")
    hasta: int = Field(..., ge=1, le=9999999, description="Número final")


def _generate_pdf(desde: int, hasta: int) -> bytes:
    """
    Genera un PDF con páginas desde `desde` hasta `hasta` (inclusive).
    Carga el template PDF una vez por número para aislar los content streams.
    """
    template_path = os.path.normpath(_TEMPLATE_PATH)

    # Read template data once for efficiency
    with open(template_path, "rb") as f:
        template_bytes = f.read()

    writer = PdfWriter()

    for n in range(desde, hasta + 1):
        # Fresh reader per iteration — avoids shared object references between pages
        reader = PdfReader(io.BytesIO(template_bytes))
        page = reader.pages[0]
        contents = page["/Contents"]

        original_data = contents.get_data()
        padded = str(n).zfill(7)
        new_data = original_data.replace(_TEMPLATE_NUMBER, f"({padded})".encode("latin-1"))
        contents.set_data(new_data)

        writer.add_page(page)

    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@router.post("/generate")
def generate_formato_d(req: GenerateRequest):
    if req.desde > req.hasta:
        raise HTTPException(status_code=400, detail="'desde' debe ser menor o igual a 'hasta'")
    total = req.hasta - req.desde + 1
    if total > _MAX_PAGES:
        raise HTTPException(status_code=400, detail=f"Máximo {_MAX_PAGES} páginas por solicitud")

    try:
        pdf_bytes = _generate_pdf(req.desde, req.hasta)
    except FileNotFoundError:
        logger.error("Template PDF not found at %s", _TEMPLATE_PATH)
        raise HTTPException(status_code=500, detail="Template no encontrado en el servidor")
    except Exception as exc:
        logger.exception("Error generando Formato D")
        raise HTTPException(status_code=500, detail=str(exc))

    filename = (
        f"formato_d_{str(req.desde).zfill(7)}.pdf"
        if req.desde == req.hasta
        else f"formato_d_{str(req.desde).zfill(7)}-{str(req.hasta).zfill(7)}.pdf"
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

**Step 3: Verify the router syntax**

```bash
cd backend && python -c "from formato_d.router import router; print('Router OK:', router.prefix)"
```

Expected: `Router OK: /api/formato-d`

---

## Task 2: Backend — Register router in `main.py`

**Files:**
- Modify: `backend/main.py`

**Step 1: Add import** (after line 39, after `msheets_router` import)

```python
from formato_d.router import router as formato_d_router  # noqa
```

**Step 2: Add include_router** (after line 533, after `msheets_router` include)

```python
app.include_router(formato_d_router)
```

**Step 3: Verify the app loads without error**

```bash
cd backend && python -c "import main; print('main.py OK')"
```

Expected: `main.py OK` (no import errors)

---

## Task 3: Backend — Manual smoke test

**Step 1: Start the backend server** (in a separate terminal or background)

```bash
cd backend && uvicorn main:app --port 7860 --reload
```

**Step 2: Test single page generation**

```bash
curl -X POST http://localhost:7860/api/formato-d/generate \
  -H "Content-Type: application/json" \
  -d '{"desde": 1, "hasta": 1}' \
  --output /tmp/test_1.pdf && echo "OK"
```

Verify the output PDF has number 0000001:

```bash
python -c "
from pypdf import PdfReader
import re
r = PdfReader('/tmp/test_1.pdf')
print('Pages:', len(r.pages))
text = r.pages[0].extract_text()
print('Numbers found:', re.findall(r'\d{7}', text))
"
```

Expected:
```
Pages: 1
Numbers found: ['0000001']
```

**Step 3: Test range generation**

```bash
curl -X POST http://localhost:7860/api/formato-d/generate \
  -H "Content-Type: application/json" \
  -d '{"desde": 5, "hasta": 7}' \
  --output /tmp/test_range.pdf && echo "OK"

python -c "
from pypdf import PdfReader; import re
r = PdfReader('/tmp/test_range.pdf')
print('Pages:', len(r.pages))
for i, p in enumerate(r.pages):
    print(f'  Page {i+1}:', re.findall(r'\d{7}', p.extract_text()))
"
```

Expected:
```
Pages: 3
  Page 1: ['0000005']
  Page 2: ['0000006']
  Page 3: ['0000007']
```

**Step 4: Test validation errors**

```bash
# desde > hasta → 400
curl -s -X POST http://localhost:7860/api/formato-d/generate \
  -H "Content-Type: application/json" \
  -d '{"desde": 5, "hasta": 3}' | python -m json.tool

# Too many pages → 400
curl -s -X POST http://localhost:7860/api/formato-d/generate \
  -H "Content-Type: application/json" \
  -d '{"desde": 1, "hasta": 501}' | python -m json.tool
```

---

## Task 4: Frontend — Create `FormatoDApp` component

**Files:**
- Create: `frontend/src/features/formato-d/FormatoDApp.tsx`

```tsx
// frontend/src/features/formato-d/FormatoDApp.tsx
import React, { useState } from 'react';
import { FileDown, Loader2, Hash } from 'lucide-react';

const API_URL = '/api/formato-d/generate';
const MAX_PAGES = 500;

export default function FormatoDApp() {
    const [desde, setDesde] = useState<number>(1);
    const [hasta, setHasta] = useState<number>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const total = Math.max(0, hasta - desde + 1);
    const isValid = desde >= 1 && hasta >= desde && total <= MAX_PAGES;

    const handleGenerate = async () => {
        if (!isValid) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ desde, hasta }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail ?? `Error ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const filename =
                desde === hasta
                    ? `formato_d_${String(desde).padStart(7, '0')}.pdf`
                    : `formato_d_${String(desde).padStart(7, '0')}-${String(hasta).padStart(7, '0')}.pdf`;
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error desconocido');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#eee] flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="mb-8 text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-800 border border-neutral-700 mb-4">
                        <Hash size={28} className="text-blue-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Formato D</h1>
                    <p className="text-sm text-neutral-400 mt-1">C.P. 052-2024-SEDAPAL · Generador de PDFs</p>
                </div>

                {/* Card */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
                    {/* Number inputs */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                                Desde N°
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={9999999}
                                value={desde}
                                onChange={(e) => setDesde(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                                Hasta N°
                            </label>
                            <input
                                type="number"
                                min={desde}
                                max={9999999}
                                value={hasta}
                                onChange={(e) => setHasta(Math.max(desde, parseInt(e.target.value) || desde))}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Preview summary */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50">
                        <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Vista previa</p>
                        {total === 1 ? (
                            <p className="text-sm text-neutral-200">
                                PDF individual · N° <span className="font-mono text-blue-400">{String(desde).padStart(7, '0')}</span>
                            </p>
                        ) : total > MAX_PAGES ? (
                            <p className="text-sm text-red-400">
                                Máximo {MAX_PAGES} páginas por solicitud ({total} seleccionadas)
                            </p>
                        ) : (
                            <p className="text-sm text-neutral-200">
                                PDF consolidado ·{' '}
                                <span className="font-mono text-blue-400">{String(desde).padStart(7, '0')}</span>
                                {' → '}
                                <span className="font-mono text-blue-400">{String(hasta).padStart(7, '0')}</span>
                                {' · '}
                                <span className="text-neutral-400">{total} páginas</span>
                            </p>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-900/30 border border-red-800/50 rounded-lg px-4 py-3">
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Generate button */}
                    <button
                        onClick={handleGenerate}
                        disabled={loading || !isValid}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-medium rounded-xl py-3 px-4 transition-colors text-sm"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Generando PDF…
                            </>
                        ) : (
                            <>
                                <FileDown size={16} />
                                {total <= 1 ? 'Generar PDF' : `Generar PDF (${total} páginas)`}
                            </>
                        )}
                    </button>
                </div>

                <p className="text-center text-xs text-neutral-600 mt-4">
                    Máximo {MAX_PAGES} páginas por descarga
                </p>
            </div>
        </div>
    );
}
```

---

## Task 5: Frontend — Wire up route and nav item

**Files:**
- Modify: `frontend/src/AppRouter.jsx`
- Modify: `frontend/src/components/layout/DashboardLayout.jsx`

**Step 1: Add route in `AppRouter.jsx`**

Add import at the top (after the last import, ~line 12):

```jsx
import FormatoDApp from './features/formato-d/FormatoDApp';
```

Add to `legacyRoutes` array (after line with `'whiteboard.html'`):

```jsx
{ path: 'formato-d.html', to: '/formato-d' },
```

Add route inside `<Route element={<DashboardLayout />}>` block (after the whiteboard route):

```jsx
<Route
    path="formato-d"
    element={
        <PageDocument title="Formato D - SEDAPAL" bodyClassName="bg-[#0d0d0d] text-[#eee]">
            <FormatoDApp />
        </PageDocument>
    }
/>
```

**Step 2: Add nav item in `DashboardLayout.jsx`**

Add import for the icon (add `FileSpreadsheet` to the existing lucide-react import line):

```jsx
import {
    FileText,
    LayoutDashboard,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Archive,
    Shrink,
    FileCode,
    BookOpen,
    Scissors,
    PenTool,
    FileSpreadsheet,  // ← add this
} from 'lucide-react';
```

Add nav item to `navItems` array (after the `Scissors / PDF Tools` entry):

```jsx
{
    icon: <FileSpreadsheet size={20} />,
    label: 'Formato D',
    to: '/formato-d',
    match: (pathname) => pathname.startsWith('/formato-d'),
},
```

**Step 3: Verify frontend builds without errors**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: no TypeScript or build errors.

---

## Task 6: Integration test — End-to-end

**Step 1: Start backend + frontend dev server**

```bash
# Terminal 1
cd backend && uvicorn main:app --port 7860 --reload

# Terminal 2
cd frontend && npm run dev
```

**Step 2: Open browser at** `http://localhost:5173/formato-d`

**Step 3: Verify:**
- Page renders with "Formato D" header
- Nav sidebar shows "Formato D" item
- Enter `desde=1, hasta=1` → click Generate → downloads `formato_d_0000001.pdf`
- Open PDF: should look 100% identical to original, with number 0000001
- Enter `desde=1, hasta=5` → click Generate → downloads `formato_d_0000001-0000005.pdf`
- Open PDF: 5 pages, each with correct sequential number
- Enter `desde=5, hasta=3` → preview shows validation error (handled by input constraints)
- Enter `desde=1, hasta=501` → preview shows "Máximo 500 páginas" warning, button disabled

---

## Task 7: Final — Add template to git and commit all

**Step 1: Stage all new/modified files**

```bash
git add backend/data/formato_d/template.pdf
git add backend/formato_d/__init__.py
git add backend/formato_d/router.py
git add backend/main.py
git add frontend/src/features/formato-d/FormatoDApp.tsx
git add frontend/src/AppRouter.jsx
git add frontend/src/components/layout/DashboardLayout.jsx
git add docs/plans/2026-03-11-formato-d-generator.md
```

**Step 2: Commit**

```bash
git commit -m "feat: add Formato D PDF generator tool (SEDAPAL C.P. 052-2024)"
```

---

## Notes

- Template PDF: `backend/data/formato_d/template.pdf` — the original "Item 01 - Formato D - 1.pdf" with number `0000001`
- The only byte that changes per page: `(0000001)` in the compressed content stream → replaced with e.g. `(0000042)`
- Fresh `PdfReader` per page is required (avoids shared pypdf object references that cause all pages to show the same number)
- No new Python dependencies needed (pypdf is already in requirements.txt)
- No other tools/routers are touched — fully isolated
