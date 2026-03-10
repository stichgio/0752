# Template Editor — Zoom/Pan tipo Figma (Sprint 2)

**Fecha:** 2026-03-10
**Alcance:** Navegación profesional en el canvas del Template Editor: zoom hacia cursor, pan con Space/middle mouse/trackpad, controles en StatusBar y atajos de teclado.
**Enfoque aprobado:** Opción B — Sistema de viewport transform (`translate + scale` con `transformOrigin: 0 0`).

---

## Contexto

El editor actual implementa zoom via `Ctrl/Cmd+wheel` pero sin focal point (el zoom no apunta al cursor). El pan depende del scroll nativo del navegador (`overflow-auto`) sin soporte para Space+drag ni middle mouse. La arquitectura usa `transformOrigin: top center` sobre el canvas inner, lo que impide la matemática estándar de zoom-toward-cursor.

---

## Decisiones de diseño

### 1. Estado y hook `useCanvasViewport`

Nuevo hook en `frontend/src/features/template-editor/hooks/useCanvasViewport.ts`:

```ts
interface ViewportState {
  zoom: number;   // 10–400, valor en %
  panX: number;   // px, desplazamiento horizontal
  panY: number;   // px, desplazamiento vertical
}

interface UseCanvasViewportReturn {
  viewport: ViewportState;
  zoomToward(clientX: number, clientY: number, delta: number): void;
  zoomTo(value: number): void;
  fitPage(containerRect: DOMRect, pageWidthPx: number, pageHeightPx: number): void;
  startPan(e: PointerEvent): void;
  isPanning: boolean;
  containerRef: RefObject<HTMLDivElement>;
}
```

`CanvasEditor.tsx` instancia el hook y pasa `viewport` + handlers a `CanvasArea` y `StatusBar`. Elimina el estado `zoom` / `setZoom` local que existía previamente.

### 2. Arquitectura del contenedor

```
<div ref={containerRef}  overflow-hidden, cursor según isPanning>
  <div style={{ transform: `translate(${panX}px,${panY}px) scale(${zoom/100})`,
                transformOrigin: "0 0" }}>
    {/* página, reglas, elementos — sin cambios internos */}
  </div>
</div>
```

Cambio clave: `overflow-auto` → `overflow-hidden` y `transformOrigin: top center` → `0 0`.

**Viewport inicial:** centra la página:
```ts
panX = (containerW - pageWidthPx * initialScale) / 2
panY = MARGIN_TOP  // e.g. 32px
```

### 3. Matemática zoom-toward-cursor

```ts
// clientX/clientY son coords de pantalla
const containerRect = containerRef.current.getBoundingClientRect();
const cx = clientX - containerRect.left;
const cy = clientY - containerRect.top;
const ratio = newZoom / oldZoom;
const nextPanX = cx - (cx - panX) * ratio;
const nextPanY = cy - (cy - panY) * ratio;
```

### 4. Conversión de coordenadas de drop/snap

Con `transformOrigin: 0 0`, `getBoundingClientRect()` ya devuelve el rect transformado. Para convertir coordenadas de pantalla a espacio del canvas:

```ts
const rect = canvasRef.current.getBoundingClientRect();
const xPx = (e.clientX - rect.left) / (zoom / 100);
const yPx = (e.clientY - rect.top)  / (zoom / 100);
// luego pxToMm(xPx) como antes
```

Tres puntos afectados en `CanvasArea.tsx`:
1. `onDrop` — drop de elementos desde palette
2. `handleCanvasMouseDown` — inicio de marquee selection
3. Smart snap threshold — ya usa `scaleRef.current`, sin cambio

### 5. Modos de pan

**Space + arrastre:**
- `keydown Space` → `isPanning = true`, cursor "grab"
- `pointerdown` → pointer capture, cursor "grabbing"
- `pointermove` → `panX += e.movementX`, `panY += e.movementY`
- `pointerup` → libera capture
- `keyup Space` → `isPanning = false`

**Middle mouse (button 1):**
- Mismo handler que Space+drag, discriminado por `e.button === 1`
- `e.preventDefault()` evita scroll automático del navegador

**Two-finger scroll / trackpad:**
- `wheel` sin `ctrlKey` → `panX -= e.deltaX`, `panY -= e.deltaY`
- `wheel` con `ctrlKey` → zoom toward cursor (ya existía, se refactoriza)

**Límites:** Sin límite estricto de pan — igual que Figma. `fitPage()` re-centra.

### 6. Ruler

`Ruler.tsx` recibe `panX`/`panY` como props en lugar de leer `scrollLeft`/`scrollTop` del contenedor (que ya no tiene scroll nativo).

### 7. StatusBar

| Control | Cambio |
|---|---|
| Botón `–` / `+` | conecta a `zoomTo(zoom ± 10)` centrado |
| Campo numérico | pasa a ser editable; Enter aplica, Escape cancela |
| Presets (50/75/100/150) | se añade preset **Fit** que llama `fitPage()` |

### 8. Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl/Cmd + =` | `zoomTo(zoom + 10)` centrado |
| `Ctrl/Cmd + –` | `zoomTo(zoom - 10)` centrado |
| `Ctrl/Cmd + 0` | `fitPage()` |
| `Ctrl/Cmd + 1` | `zoomTo(100)` centrado |
| `Space` (hold) | activa modo pan |

---

## Archivos a modificar

| Archivo | Tipo de cambio |
|---|---|
| `hooks/useCanvasViewport.ts` | **Nuevo** — toda la lógica de viewport |
| `canvas/CanvasArea.tsx` | Reemplaza `overflow-auto` + `transformOrigin`; refactoriza wheel handler; actualiza 3 puntos de conversión de coordenadas; recibe `viewport` como prop |
| `canvas/Ruler.tsx` | Recibe `panX`/`panY` en lugar de leer scroll del contenedor |
| `toolbar/StatusBar.tsx` | Campo editable, preset Fit, conecta a `zoomTo`/`fitPage` |
| `CanvasEditor.tsx` | Instancia `useCanvasViewport`; elimina `zoom`/`setZoom` locales; pasa `viewport` + handlers |

**No se tocan:** `CanvasElement.tsx`, `documentModel.ts`, backend, ni otras utilidades.

---

## Criterios de aceptación

- `Ctrl+wheel` zooma hacia la posición del cursor, no hacia el centro del canvas.
- `Space` + arrastre y middle mouse pan el canvas libremente.
- Two-finger scroll en trackpad panea (sin zoom).
- Pinch-to-zoom en trackpad zooma hacia el punto medio del gesto.
- El campo de zoom en StatusBar es editable; Enter aplica, Escape cancela.
- El preset "Fit" centra y ajusta la página al viewport actual.
- Drop de elementos desde la palette aterriza en la posición visual correcta a cualquier zoom.
- El marquee de selección traza el rectángulo correcto a cualquier zoom/pan.
- El ruler muestra el offset correcto al panear.
- No hay regresiones en drag/resize/rotate de elementos.
