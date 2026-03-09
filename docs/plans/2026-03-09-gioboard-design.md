# GioBoard — Design Doc
_2026-03-09_

## Objetivo
Reemplazar el whiteboard embebido (iframe estático de Excalidraw) por un componente React
nativo usando `@excalidraw/excalidraw`, con rebranding completo a "GioBoard": sin logos,
sin textos ni botones de la marca Excalidraw, tema oscuro forzado, e interfaz en español.

---

## Alcance

### Incluido
- Instalar `@excalidraw/excalidraw` como dependencia npm
- Reemplazar `frontend/src/features/whiteboard/page.jsx` con componente Excalidraw nativo
- Tema oscuro forzado sin opción de cambio
- Interfaz en español (`langCode="es-ES"`)
- Ocultar/eliminar toda la marca Excalidraw visible
- Menú hamburger con solo acciones útiles: exportar PNG y limpiar pizarra
- Welcome screen desactivado
- Renombrar sidebar de "Pizarra" → "GioBoard"
- Renombrar título de pestaña de "Pizarra" → "GioBoard"
- Ajustar `vite.config.js` para compatibilidad con el paquete
- Eliminar `public/whiteboard-app/` (ya no necesario)

### Excluido
- Guardado en backend/Supabase (fuera del alcance, se usa localStorage)
- Colaboración en tiempo real
- Exportación PDF integrada con el flujo de GIO

---

## Arquitectura

```
frontend/src/features/whiteboard/
  page.jsx          ← componente principal GioBoard
  gioboard.css      ← CSS para ocultar residuos de marca Excalidraw
```

### Componente `page.jsx`

```jsx
import { Excalidraw, MainMenu, WelcomeScreen } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './gioboard.css';

export default function GioBoardPage() {
  return (
    <div className="h-full w-full">
      <Excalidraw
        theme="dark"
        langCode="es-ES"
        UIOptions={{
          welcomeScreen: false,
          canvasActions: {
            theme: false,
            export: false,
            loadScene: false,
            saveAsImage: true,
            clearCanvas: true,
          },
        }}
        renderTopRightUI={() => null}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
```

### CSS de rebranding (`gioboard.css`)
Oculta textos y logos residuales del bundle que no son controlables via props:
- El texto "Excalidraw" en el footer del menú hamburger
- Links a excalidraw.com

---

## Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| `frontend/package.json` | Agregar `@excalidraw/excalidraw` |
| `frontend/vite.config.js` | Excluir de `optimizeDeps`, posible alias |
| `frontend/src/features/whiteboard/page.jsx` | Reemplazar completamente |
| `frontend/src/features/whiteboard/gioboard.css` | Nuevo — CSS rebranding |
| `frontend/src/components/layout/DashboardLayout.jsx` | Label "Pizarra" → "GioBoard" |
| `frontend/src/AppRouter.jsx` | `title="Pizarra"` → `title="GioBoard"` |
| `frontend/public/whiteboard-app/` | Eliminar |

---

## Vite config

`@excalidraw/excalidraw` puede requerir:
```js
optimizeDeps: {
  exclude: ['@excalidraw/excalidraw'],
  include: ['lucide-react']
}
```
Si hay errores de peer dependencies con React 18, agregar `ssr: { noExternal: ['@excalidraw/excalidraw'] }`.

---

## Estado del canvas
Se persiste automáticamente en `localStorage` igual que el app oficial. Sin cambios requeridos.
