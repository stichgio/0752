# Template Editor — Zoom/Pan tipo Figma

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reemplazar el sistema actual de zoom/pan (overflow-auto + scale con transformOrigin top center) por un sistema de viewport transform unificado (`translate + scale`, `transformOrigin: 0 0`) que soporta zoom hacia el cursor, pan con Space/middle-mouse/trackpad y controles en StatusBar.

**Architecture:** Un nuevo hook `useCanvasViewport` encapsula el estado `{zoom, panX, panY}` y todos los handlers de navegación. `CanvasEditor` instancia el hook y pasa `viewport` + callbacks a `CanvasArea` y `StatusBar`. El canvas inner pasa de `overflow-auto` a `overflow-hidden` con una sola transformación CSS. Las coordenadas de drop/snap usan `pageRef.getBoundingClientRect()` que ya devuelve el rect transformado, sin cambios en la lógica interna.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Tailwind CSS.

---

## Contexto del codebase

- `CanvasEditor.tsx:205` — `const [zoom, setZoom] = useState(75)` — estado a reemplazar.
- `CanvasEditor.tsx:1243-1276` — pasa `zoom` y `onZoomChange={setZoom}` a `CanvasArea`, `Ruler` y `StatusBar`.
- `CanvasArea.tsx:133-148` — props actuales incluyen `zoom` y `onZoomChange`.
- `CanvasArea.tsx:178` — `const scaleRef = useRef(zoom / 100)` — se mantiene igual.
- `CanvasArea.tsx:1332-1344` — handler wheel actual (solo zoom, sin focal point).
- `CanvasArea.tsx:1353` — contenedor con `className="relative w-full h-full overflow-auto flex items-start justify-center"`.
- `CanvasArea.tsx:1368-1370` — inner wrapper: `transform: scale(${scale})`, `transformOrigin: top center`.
- `CanvasArea.tsx:1196-1228` — `handleCanvasMouseDown` con coords via `pageRef.getBoundingClientRect()`.
- `CanvasArea.tsx:1229-1320` — `onDrop` con coords via `pageRef.getBoundingClientRect()`.
- `CanvasArea.tsx:298-308` — `getCanvasPointFromClient` — helper existente, usa `pageRef.getBoundingClientRect()` dividido por `sc`. No cambia.
- `Ruler.tsx:83-88` — props: `zoom`, `pageOffsetPx`, `lengthPx`.
- `CanvasEditor.tsx:1256,1264` — pasa `pageOffsetPx={0}` y `pageOffsetPx={32}` hardcodeados. Se reemplaza por valores dinámicos calculados de `panX/panY`.
- `StatusBar.tsx:7-22` — props: `zoom: number`, `onZoomChange: (z: number) => void`. Se extiende con campo editable y preset Fit.
- `frontend/src/features/template-editor/hooks/` — carpeta existente con `useSnapGrid.ts` y `useUndoableState.ts`.

---

## Task 1: Funciones puras del viewport (sin DOM)

**Files:**
- Create: `frontend/src/features/template-editor/hooks/useCanvasViewport.ts`
- Create: `frontend/src/features/template-editor/hooks/__tests__/useCanvasViewport.test.ts`

### Step 1: Crear el archivo del hook con las funciones puras exportadas

```ts
// frontend/src/features/template-editor/hooks/useCanvasViewport.ts
export const ZOOM_MIN = 10;
export const ZOOM_MAX = 400;
export const ZOOM_STEP = 10;
export const INITIAL_PAN_Y = 32; // px — equivalente al my-8 del inner wrapper

export interface ViewportState {
    zoom: number;
    panX: number;
    panY: number;
}

/** Clamp zoom between ZOOM_MIN and ZOOM_MAX */
export function clampZoom(z: number): number {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/**
 * Calculates new panX/panY so that the point at (cx, cy) in container space
 * stays visually fixed as zoom changes from oldZoom to newZoom.
 */
export function calcZoomToward(
    cx: number,
    cy: number,
    oldZoom: number,
    newZoom: number,
    panX: number,
    panY: number,
): ViewportState {
    const ratio = newZoom / oldZoom;
    return {
        zoom: newZoom,
        panX: cx - (cx - panX) * ratio,
        panY: cy - (cy - panY) * ratio,
    };
}

/**
 * Calculates viewport state so the page fits centered inside the container
 * with a small margin.
 */
export function calcFitPage(
    containerW: number,
    containerH: number,
    pageWidthPx: number,
    pageHeightPx: number,
): ViewportState {
    const MARGIN = 48; // px on each side
    const scaleX = (containerW - MARGIN * 2) / pageWidthPx;
    const scaleY = (containerH - MARGIN * 2) / pageHeightPx;
    const scale = Math.min(scaleX, scaleY);
    const zoom = clampZoom(Math.round(scale * 100));
    const finalScale = zoom / 100;
    const panX = (containerW - pageWidthPx * finalScale) / 2;
    const panY = (containerH - pageHeightPx * finalScale) / 2;
    return { zoom, panX, panY };
}
```

### Step 2: Escribir los tests antes de seguir

```ts
// frontend/src/features/template-editor/hooks/__tests__/useCanvasViewport.test.ts
import { describe, it, expect } from 'vitest';
import {
    clampZoom,
    calcZoomToward,
    calcFitPage,
    ZOOM_MIN,
    ZOOM_MAX,
} from '../useCanvasViewport';

describe('clampZoom', () => {
    it('returns value unchanged when within range', () => {
        expect(clampZoom(100)).toBe(100);
    });
    it('clamps below minimum', () => {
        expect(clampZoom(5)).toBe(ZOOM_MIN);
    });
    it('clamps above maximum', () => {
        expect(clampZoom(9999)).toBe(ZOOM_MAX);
    });
});

describe('calcZoomToward', () => {
    it('keeps the focal point visually fixed', () => {
        // cursor at (300, 200), zoom 100->200, pan (0,0)
        const result = calcZoomToward(300, 200, 100, 200, 0, 0);
        expect(result.zoom).toBe(200);
        // focal point check: cx - (cx - panX) * ratio = 300 - 300*2 = -300
        expect(result.panX).toBeCloseTo(-300);
        expect(result.panY).toBeCloseTo(-200);
    });

    it('maintains pan when cursor is at origin', () => {
        const result = calcZoomToward(0, 0, 100, 150, 50, 80);
        expect(result.panX).toBeCloseTo(50 * 1.5);
        expect(result.panY).toBeCloseTo(80 * 1.5);
    });
});

describe('calcFitPage', () => {
    it('fits the page with margin', () => {
        // Container 1000x800, page 500x700
        const result = calcFitPage(1000, 800, 500, 700);
        expect(result.zoom).toBeGreaterThan(0);
        expect(result.zoom).toBeLessThanOrEqual(ZOOM_MAX);
        // Page should be centered: panX > 0
        expect(result.panX).toBeGreaterThan(0);
        expect(result.panY).toBeGreaterThan(0);
    });

    it('uses the more constrained dimension', () => {
        // Very wide container, tall page — height should be the constraint
        const wide = calcFitPage(2000, 600, 400, 800);
        const narrow = calcFitPage(600, 600, 400, 800);
        expect(narrow.zoom).toBeLessThan(wide.zoom);
    });
});
```

### Step 3: Correr los tests y verificar que pasan

```bash
cd frontend && npx vitest run src/features/template-editor/hooks/__tests__/useCanvasViewport.test.ts
```

Resultado esperado: **3 suites, todos PASS**.

### Step 4: Commit

```bash
git add frontend/src/features/template-editor/hooks/useCanvasViewport.ts \
        frontend/src/features/template-editor/hooks/__tests__/useCanvasViewport.test.ts
git commit -m "feat(template-editor): add pure viewport math functions with tests"
```

---

## Task 2: Hook `useCanvasViewport` — estado React + zoomTo + fitPage

**Files:**
- Modify: `frontend/src/features/template-editor/hooks/useCanvasViewport.ts`

### Step 1: Añadir el hook React al mismo archivo

Añadir al final de `useCanvasViewport.ts`:

```ts
import { useCallback, useRef, useState, useEffect, RefObject } from 'react';

export interface UseCanvasViewportOptions {
    initialZoom?: number;
    pageWidthPx: number;
    pageHeightPx: number;
}

export interface UseCanvasViewportReturn {
    viewport: ViewportState;
    isPanning: boolean;
    containerRef: RefObject<HTMLDivElement>;
    zoomTo: (newZoom: number) => void;
    zoomToward: (clientX: number, clientY: number, deltaZoom: number) => void;
    fitPage: () => void;
    startPan: (e: React.PointerEvent | PointerEvent) => void;
}

export function useCanvasViewport({
    initialZoom = 75,
    pageWidthPx,
    pageHeightPx,
}: UseCanvasViewportOptions): UseCanvasViewportReturn {
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState<ViewportState>(() => ({
        zoom: initialZoom,
        panX: 0,
        panY: INITIAL_PAN_Y,
    }));
    const [isPanning, setIsPanning] = useState(false);
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;

    // Center page on first mount when container dimensions are known
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        setViewport(calcFitPage(width, height, pageWidthPx, pageHeightPx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally only on mount

    const zoomTo = useCallback((newZoom: number) => {
        const clamped = clampZoom(newZoom);
        setViewport((prev) => {
            const el = containerRef.current;
            if (!el) return { ...prev, zoom: clamped };
            const { width, height } = el.getBoundingClientRect();
            const cx = width / 2;
            const cy = height / 2;
            return calcZoomToward(cx, cy, prev.zoom, clamped, prev.panX, prev.panY);
        });
    }, []);

    const zoomToward = useCallback((clientX: number, clientY: number, deltaZoom: number) => {
        setViewport((prev) => {
            const el = containerRef.current;
            if (!el) return prev;
            const rect = el.getBoundingClientRect();
            const cx = clientX - rect.left;
            const cy = clientY - rect.top;
            const newZoom = clampZoom(prev.zoom + deltaZoom);
            return calcZoomToward(cx, cy, prev.zoom, newZoom, prev.panX, prev.panY);
        });
    }, []);

    const fitPage = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        setViewport(calcFitPage(width, height, pageWidthPx, pageHeightPx));
    }, [pageWidthPx, pageHeightPx]);

    const startPan = useCallback((e: React.PointerEvent | PointerEvent) => {
        const target = e.target as HTMLElement;
        target.setPointerCapture((e as PointerEvent).pointerId);
        setIsPanning(true);

        const onMove = (ev: PointerEvent) => {
            setViewport((prev) => ({
                ...prev,
                panX: prev.panX + ev.movementX,
                panY: prev.panY + ev.movementY,
            }));
        };
        const onUp = () => {
            target.releasePointerCapture((e as PointerEvent).pointerId);
            setIsPanning(false);
            target.removeEventListener('pointermove', onMove);
            target.removeEventListener('pointerup', onUp);
        };
        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerup', onUp);
    }, []);

    return { viewport, isPanning, containerRef, zoomTo, zoomToward, fitPage, startPan };
}
```

### Step 2: Correr todos los tests del hook

```bash
cd frontend && npx vitest run src/features/template-editor/hooks/__tests__/useCanvasViewport.test.ts
```

Resultado esperado: **PASS** (las funciones puras no cambian).

### Step 3: Commit

```bash
git add frontend/src/features/template-editor/hooks/useCanvasViewport.ts
git commit -m "feat(template-editor): add useCanvasViewport hook with zoomTo, fitPage, startPan"
```

---

## Task 3: Keyboard shortcuts y wheel handler en el hook

**Files:**
- Modify: `frontend/src/features/template-editor/hooks/useCanvasViewport.ts`

### Step 1: Añadir shortcuts y wheel al hook

Dentro de `useCanvasViewport`, añadir estos dos `useEffect` después de `startPan`:

```ts
// Keyboard shortcuts: Ctrl+=, Ctrl+-, Ctrl+0, Ctrl+1
useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        if (e.key === '=' || e.key === '+') {
            e.preventDefault();
            zoomTo(viewportRef.current.zoom + ZOOM_STEP);
        } else if (e.key === '-') {
            e.preventDefault();
            zoomTo(viewportRef.current.zoom - ZOOM_STEP);
        } else if (e.key === '0') {
            e.preventDefault();
            fitPage();
        } else if (e.key === '1') {
            e.preventDefault();
            zoomTo(100);
        }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
}, [zoomTo, fitPage]);

// Wheel: Ctrl+wheel → zoom toward cursor; plain wheel → pan
useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            // pinch-to-zoom or Ctrl+wheel → zoom toward cursor
            const delta = e.deltaY > 0 ? -ZOOM_STEP / 2 : ZOOM_STEP / 2;
            setViewport((prev) => {
                const rect = el.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                const newZoom = clampZoom(prev.zoom + delta);
                return calcZoomToward(cx, cy, prev.zoom, newZoom, prev.panX, prev.panY);
            });
        } else {
            // two-finger scroll → pan
            setViewport((prev) => ({
                ...prev,
                panX: prev.panX - e.deltaX,
                panY: prev.panY - e.deltaY,
            }));
        }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
}, []); // runs once; accesses fresh state via functional setViewport
```

### Step 2: Añadir Space pan detection — añadir al return del hook

Exponer `isPanningByKey` y los handlers del contenedor en el return:

```ts
// Space key tracking
const isSpaceDownRef = useRef(false);

useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space' && !e.repeat && !isSpaceDownRef.current) {
            // only activate if not typing in an input
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
            isSpaceDownRef.current = true;
            setIsPanning(true);
        }
    };
    const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
            isSpaceDownRef.current = false;
            setIsPanning(false);
        }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
    };
}, []);

// Handler para el contenedor: activa pan si Space está presionado o middle mouse
const handleContainerPointerDown = useCallback((e: React.PointerEvent) => {
    if (isSpaceDownRef.current || e.button === 1) {
        e.preventDefault();
        startPan(e);
    }
}, [startPan]);
```

Actualizar el return del hook para incluir `handleContainerPointerDown`:

```ts
return {
    viewport,
    isPanning,
    containerRef,
    zoomTo,
    zoomToward,
    fitPage,
    startPan,
    handleContainerPointerDown,
};
```

Y actualizar la interfaz `UseCanvasViewportReturn` con:
```ts
handleContainerPointerDown: (e: React.PointerEvent) => void;
```

### Step 3: Correr tests

```bash
cd frontend && npx vitest run src/features/template-editor/hooks/__tests__/useCanvasViewport.test.ts
```

### Step 4: Commit

```bash
git add frontend/src/features/template-editor/hooks/useCanvasViewport.ts
git commit -m "feat(template-editor): add wheel, keyboard shortcuts, and Space/middle-mouse pan"
```

---

## Task 4: Actualizar `CanvasArea.tsx` — contenedor y transform

**Files:**
- Modify: `frontend/src/features/template-editor/canvas/CanvasArea.tsx`

### Step 1: Actualizar las props de CanvasArea

Buscar la interfaz `CanvasAreaProps` (~línea 40) y reemplazar:

```ts
// ANTES
zoom: number;
onZoomChange: (z: number) => void;
```

```ts
// DESPUÉS
viewport: { zoom: number; panX: number; panY: number };
onZoomChange: (z: number) => void; // se mantiene para compatibilidad con StatusBar
```

En la desestructuración de props (`~línea 143`), reemplazar:
```ts
// ANTES
zoom,
onZoomChange,

// DESPUÉS
viewport,
onZoomChange,
```

Añadir al inicio del cuerpo del componente:
```ts
const { zoom, panX, panY } = viewport;
```

### Step 2: Reemplazar el contenedor con `overflow-hidden`

Localizar la `div` con `ref={containerRef}` (~línea 1353). Cambiar `overflow-auto flex items-start justify-center` por `overflow-hidden`. Eliminar el `flex` y `justify-center` (el centrado lo hace `panX`).

```tsx
// ANTES
className="relative w-full h-full overflow-auto flex items-start justify-center"

// DESPUÉS
className="relative w-full h-full overflow-hidden"
```

### Step 3: Cambiar el transform del inner wrapper

Localizar el div `className="relative my-8 shrink-0"` (~línea 1365). Reemplazar:

```tsx
// ANTES
<div
    className="relative my-8 shrink-0"
    style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
    }}
>

// DESPUÉS
<div
    className="relative shrink-0"
    style={{
        transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
        transformOrigin: '0 0',
        position: 'absolute',
        top: 0,
        left: 0,
    }}
>
```

> Nota: eliminamos `my-8` porque el margen superior ahora lo gestiona `panY` (inicializado a `INITIAL_PAN_Y = 32`).

### Step 4: Eliminar el `useEffect` del wheel handler existente

Buscar y eliminar el bloque `useEffect` que llama a `container.addEventListener('wheel', handleWheel, ...)` (~líneas 1332-1344). El wheel ahora lo gestiona `useCanvasViewport`.

### Step 5: Añadir `onPointerDown` al contenedor para pan

En el JSX del contenedor, añadir `onPointerDown` (se pasa como prop desde CanvasEditor):

```tsx
// Añadir a CanvasAreaProps:
onContainerPointerDown?: (e: React.PointerEvent) => void;

// En la desestructuración de props:
onContainerPointerDown,

// En el div del contenedor:
onPointerDown={onContainerPointerDown}
```

### Step 6: Actualizar el cursor según isPanning

```tsx
// Añadir a CanvasAreaProps:
isPanning?: boolean;

// En la desestructuración:
isPanning,

// En el style del contenedor (ya tiene cursor para dragSession):
cursor: isPanning ? 'grab' : dragSession.active ? 'grabbing' : undefined,
```

### Step 7: Build check

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Esperar errores de tipos en `CanvasEditor.tsx` porque no se ha actualizado aún. Los errores de `CanvasArea.tsx` deben estar limpios.

### Step 8: Commit

```bash
git add frontend/src/features/template-editor/canvas/CanvasArea.tsx
git commit -m "feat(template-editor): update CanvasArea container to overflow-hidden + viewport transform"
```

---

## Task 5: Actualizar `CanvasEditor.tsx` — conectar el hook

**Files:**
- Modify: `frontend/src/features/template-editor/CanvasEditor.tsx`

### Step 1: Importar el hook y calcular dimensiones de página

En los imports, añadir:
```ts
import { useCanvasViewport, INITIAL_PAN_Y } from './hooks/useCanvasViewport';
import { mmToCanvasPx } from './canvas/canvasUtils'; // ya importado o disponible
```

Calcular las dimensiones de página antes de instanciar el hook (usar `pageSettings` del estado del documento):
```ts
// Cerca de donde se usan pageSettings (busca la línea con pageSettings.width)
const pageWidthPx = mmToCanvasPx(pageSettings.width);
const pageHeightPx = mmToCanvasPx(pageSettings.height);
```

### Step 2: Reemplazar el estado de zoom por el hook

Localizar `const [zoom, setZoom] = useState(75)` (~línea 205). Reemplazarlo:

```ts
// ELIMINAR:
const [zoom, setZoom] = useState(75);

// AÑADIR:
const {
    viewport,
    isPanning,
    containerRef: canvasViewportRef,
    zoomTo,
    fitPage,
    handleContainerPointerDown,
} = useCanvasViewport({ pageWidthPx, pageHeightPx });
const { zoom } = viewport; // para atajos que ya usan zoom directamente
```

> Nota: Si `containerRef` ya existe en `CanvasEditor`, renombrar el del hook a `canvasViewportRef` y pasarlo a `CanvasArea` como prop.

### Step 3: Actualizar las llamadas al Ruler

Localizar las dos instancias de `<Ruler>` (~líneas 1253-1268):

```tsx
// ANTES — pageOffsetPx hardcodeado
<Ruler orientation="horizontal" zoom={zoom} pageOffsetPx={0} lengthPx={...} />
<Ruler orientation="vertical"   zoom={zoom} pageOffsetPx={32} lengthPx={...} />

// DESPUÉS — calculado de panX/panY
const scale = zoom / 100;
// El inner wrapper empieza en (panX, panY) con transformOrigin 0 0.
// El borde izquierdo de la página = panX (el wrapper no tiene margen horizontal extra).
// El borde superior de la página = panY (eliminamos my-8, reemplazado por panY).
<Ruler orientation="horizontal" zoom={zoom} pageOffsetPx={viewport.panX} lengthPx={...} />
<Ruler orientation="vertical"   zoom={zoom} pageOffsetPx={viewport.panY} lengthPx={...} />
```

### Step 4: Actualizar las props que se pasan a `CanvasArea`

Localizar `<CanvasArea ... zoom={zoom} onZoomChange={setZoom} ...>` (~líneas 1275-1290). Actualizar:

```tsx
<CanvasArea
    // ...resto de props sin cambio...
    viewport={viewport}
    onZoomChange={zoomTo}
    isPanning={isPanning}
    onContainerPointerDown={handleContainerPointerDown}
/>
```

### Step 5: Actualizar las props que se pasan a `StatusBar`

```tsx
<StatusBar
    zoom={zoom}
    onZoomChange={zoomTo}
    onFitPage={fitPage}    // nueva prop
    // ...resto sin cambio
/>
```

### Step 6: Build check limpio

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Esperar errores solo en `StatusBar.tsx` (nueva prop `onFitPage` aún no declarada). Los demás deben estar limpios.

### Step 7: Commit

```bash
git add frontend/src/features/template-editor/CanvasEditor.tsx
git commit -m "feat(template-editor): wire useCanvasViewport into CanvasEditor"
```

---

## Task 6: Actualizar `StatusBar.tsx` — campo editable y preset Fit

**Files:**
- Modify: `frontend/src/features/template-editor/toolbar/StatusBar.tsx`

### Step 1: Añadir `onFitPage` a la interfaz de props

```ts
// En StatusBarProps, añadir:
onFitPage?: () => void;
```

Y en la desestructuración:
```ts
onFitPage,
```

### Step 2: Hacer editable el campo de zoom

Localizar el elemento de porcentaje de zoom. Actualmente es solo texto (`{Math.round(zoom)}%`). Reemplazar por un `<input>`:

```tsx
// Añadir estado local en el componente StatusBar:
const [editingZoom, setEditingZoom] = useState<string | null>(null);

// Reemplazar el span/texto del zoom por:
<input
    type="text"
    className="w-12 text-center text-[11px] bg-transparent border-none outline-none
               focus:bg-white focus:border focus:border-blue-400 focus:rounded px-1 cursor-text"
    value={editingZoom !== null ? editingZoom : `${Math.round(zoom)}%`}
    onFocus={() => setEditingZoom(String(Math.round(zoom)))}
    onChange={(e) => setEditingZoom(e.target.value)}
    onBlur={() => {
        if (editingZoom !== null) {
            const parsed = parseInt(editingZoom, 10);
            if (!isNaN(parsed)) onZoomChange(parsed);
            setEditingZoom(null);
        }
    }}
    onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setEditingZoom(null); (e.target as HTMLInputElement).blur(); }
    }}
/>
```

### Step 3: Añadir preset "Fit"

Localizar `const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200]`. Añadir el botón Fit junto a los presets:

```tsx
// Después de los botones de presets numéricos, añadir:
{onFitPage && (
    <button
        onClick={onFitPage}
        title="Ajustar página (Ctrl+0)"
        className="px-1 py-0.5 rounded text-[10px] transition-colors text-gray-500 hover:bg-gray-200 hover:text-gray-700"
    >
        Fit
    </button>
)}
```

### Step 4: Build check limpio

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Resultado esperado: **0 errores**.

### Step 5: Correr todos los tests

```bash
cd frontend && npx vitest run
```

Resultado esperado: **todos los tests pasan** (incluyendo los del hook).

### Step 6: Commit

```bash
git add frontend/src/features/template-editor/toolbar/StatusBar.tsx
git commit -m "feat(template-editor): editable zoom field and Fit preset in StatusBar"
```

---

## Task 7: Smoke test manual en el browser

**Files:** ninguno — solo verificación.

### Step 1: Arrancar el frontend

```bash
cd frontend && npm run dev
```

Navegar a `http://localhost:5173/template-editor.html`.

### Step 2: Checklist de comportamiento esperado

Verificar cada punto:

- [ ] **Zoom hacia cursor:** `Ctrl+wheel` zooma hacia la posición del puntero, no hacia el centro.
- [ ] **Pan con Space:** mantener `Space`, hacer click y arrastrar panea el canvas.
- [ ] **Pan con middle mouse:** click de rueda + arrastre panea el canvas.
- [ ] **Two-finger scroll:** en trackpad, dos dedos sin pellizco panea; pellizco zooma.
- [ ] **Campo editable:** click en el porcentaje de zoom → editable; Enter aplica; Escape cancela.
- [ ] **Preset Fit:** botón "Fit" centra y ajusta la página al viewport.
- [ ] **`Ctrl+0`:** mismo efecto que Fit.
- [ ] **`Ctrl+1`:** zoom a 100%, centrado en el viewport.
- [ ] **Drop de elementos:** arrastrar un elemento desde la palette y soltarlo en el canvas aterriza en la posición visual correcta a distintos niveles de zoom.
- [ ] **Marquee:** drag desde fondo del canvas dibuja el rectángulo de selección correctamente.
- [ ] **Ruler:** las marcas de la regla se desplazan al panear; escalan al hacer zoom.
- [ ] **No regresiones:** drag/resize/rotate de elementos existentes funciona como antes.

### Step 3: Commit de fix si hay regresiones

Si hay ajustes menores necesarios, corregirlos con commits atómicos antes de continuar.

---

## Task 8: Tests de integración Vitest (opcional pero recomendado)

**Files:**
- Modify: `frontend/src/features/template-editor/hooks/__tests__/useCanvasViewport.test.ts`

### Step 1: Añadir test del hook con renderHook

```ts
import { renderHook, act } from '@testing-library/react';
import { useCanvasViewport } from '../useCanvasViewport';

describe('useCanvasViewport hook', () => {
    it('initializes with provided zoom', () => {
        const { result } = renderHook(() =>
            useCanvasViewport({ initialZoom: 75, pageWidthPx: 794, pageHeightPx: 1123 })
        );
        expect(result.current.viewport.zoom).toBe(75);
    });

    it('zoomTo updates viewport zoom', () => {
        const { result } = renderHook(() =>
            useCanvasViewport({ pageWidthPx: 794, pageHeightPx: 1123 })
        );
        act(() => result.current.zoomTo(150));
        expect(result.current.viewport.zoom).toBe(150);
    });

    it('zoomTo clamps at ZOOM_MAX', () => {
        const { result } = renderHook(() =>
            useCanvasViewport({ pageWidthPx: 794, pageHeightPx: 1123 })
        );
        act(() => result.current.zoomTo(9999));
        expect(result.current.viewport.zoom).toBe(400);
    });
});
```

### Step 2: Correr y confirmar

```bash
cd frontend && npx vitest run src/features/template-editor/hooks/__tests__/useCanvasViewport.test.ts
```

### Step 3: Commit final

```bash
git add frontend/src/features/template-editor/hooks/__tests__/useCanvasViewport.test.ts
git commit -m "test(template-editor): add renderHook integration tests for useCanvasViewport"
```

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `hooks/useCanvasViewport.ts` | **Nuevo** |
| `hooks/__tests__/useCanvasViewport.test.ts` | **Nuevo** |
| `canvas/CanvasArea.tsx` | Modificar props, contenedor, transform, eliminar wheel handler |
| `toolbar/StatusBar.tsx` | Añadir `onFitPage`, campo editable, botón Fit |
| `CanvasEditor.tsx` | Instanciar hook, pasar viewport y handlers |

**No se tocan:** `CanvasElement.tsx`, `Ruler.tsx` (recibe props actualizadas sin cambio de interfaz), backend, `documentModel.ts`.

---

## Criterios de aceptación

1. `npx tsc --noEmit` sin errores en frontend.
2. `npx vitest run` — todos los tests pasan.
3. Zoom hacia cursor funciona: la posición bajo el puntero no se desplaza al hacer `Ctrl+wheel`.
4. Space+drag y middle mouse panean el canvas.
5. Two-finger scroll en trackpad panea; pinch zooma.
6. Campo de zoom editable: Enter aplica, Escape cancela.
7. Botón Fit y `Ctrl+0` centran la página.
8. Drop de elementos aterriza en la posición visual correcta a cualquier zoom.
9. Marquee funciona a cualquier zoom/pan.
10. No hay regresiones en drag/resize/rotate.
