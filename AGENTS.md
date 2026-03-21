# AGENTS.md — Glitch/AutoReport

## 🧠 Descripción del proyecto

Sistema web de generación de informes técnicos en PDF para empresas de servicios. Permite importar datos desde Excel/CSV, mapear columnas, seleccionar plantillas HTML/Jinja2, y generar PDFs individuales o consolidados con logo personalizado.

**Flujo principal:**
1. El usuario sube archivos Excel/CSV con datos de campo
2. Mapea columnas a variables del informe (COLUMN_MAPPING)
3. Selecciona o edita una plantilla Jinja2
4. El backend renderiza con WeasyPrint y devuelve PDF(s)

**Usuarios objetivo:** Técnicos de campo y coordinadores que generan informes de inspección, fichas técnicas y reportes multi-hoja.

---

## 🏗️ Arquitectura

```
Browser (React 18 + Vite)
        │  port 5173 (dev) / Vercel (prod)
        │  VITE_API_URL → /api
        ▼
   FastAPI (Python 3.11)
        │  port 7860 (local / HF Spaces)
        │  prefix /api
        ├── /api/technical-reports   → WeasyPrint → PDF
        ├── /api/fichas-tecnicas     → WeasyPrint → PDF
        ├── /api/multi-sheet         → WeasyPrint → PDF
        ├── /api/template-editor     → Jinja2 preview/render
        ├── /api/compressor          → Ghostscript → PDF
        ├── /api/image-optimizer     → ZIP bundle
        └── /api/tools/*             → pypdf merge/split/organize/extract
        │
        ├── Jinja2 templates (backend/*/templates/)
        ├── JSON data store  (backend/data/*.json)
        └── Supabase Storage (template assets/brand-kits)
```

---

## 📁 Estructura de carpetas

```
/
├── backend/
│   ├── main.py                    # App FastAPI, routers, middlewares, api_router
│   ├── config.py                  # Pydantic Settings (env vars)
│   ├── requirements.txt           # Dependencias Python
│   ├── technical_reports/         # Módulo informes técnicos
│   │   ├── router.py              # Endpoints /api/technical-reports
│   │   ├── models.py              # Pydantic: TechnicalReport, ReportHeader…
│   │   └── templates/             # Plantillas Jinja2 HTML para PDF
│   ├── fichas_tecnicas/           # Módulo fichas de actividades
│   │   ├── router.py              # Endpoints /api/fichas-tecnicas
│   │   ├── models.py              # Pydantic: FichaTecnica, ProductoQuimico…
│   │   └── templates/
│   ├── msheets/                   # Módulo multi-hoja
│   │   ├── multi_sheet_report.py  # Router + lógica /api/multi-sheet
│   │   └── mtemplates/            # Plantillas multi-hoja
│   ├── compressor/
│   │   └── router.py              # Endpoints /api/compressor (Ghostscript)
│   ├── image_optimizer/
│   │   └── router.py              # Endpoints /api/image-optimizer (ZIP)
│   ├── template_editor/
│   │   ├── router.py              # Endpoints /api/template-editor
│   │   └── models.py              # Pydantic: TemplateEditorRecord, EditorBlock…
│   ├── pdf_tools/                 # Utilidades PDF (merge, split, organize, extract)
│   ├── core/
│   │   └── progress.py            # SSE progress helpers
│   ├── data/                      # Persistencia JSON local
│   └── templates/                 # Plantillas globales (api_router)
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Generador principal (wizard 4 pasos)
│   │   ├── AppRouter.jsx          # React Router: rutas SPA
│   │   ├── features/              # Módulos UI por funcionalidad
│   │   │   ├── technical-reports/ # /reportes-tecnicos
│   │   │   ├── fichas-tecnicas/   # /fichas-tecnicas
│   │   │   ├── compressor/        # /compressor
│   │   │   ├── image-optimizer/   # /image-optimizer
│   │   │   ├── multi-sheet-report/# /msheets
│   │   │   ├── template-editor/   # /template-editor (canvas, sidebar, inspector)
│   │   │   └── pdf-tools/         # /pdf-tools
│   │   ├── components/            # Componentes compartidos
│   │   │   ├── ui/                # Step, LoadingModal, MissingApiConfigBanner
│   │   │   ├── layout/            # DashboardLayout, PageDocument
│   │   │   ├── PreviewPanel.jsx   # Vista previa PDF
│   │   │   ├── DataPreviewTable.jsx
│   │   │   └── PomodoroTimer.jsx
│   │   ├── hooks/                 # Hooks personalizados
│   │   └── utils/
│   │       ├── apiClient.ts       # Axios instance (baseURL, timeout 60s)
│   │       └── apiBase.ts         # Resuelve VITE_API_URL
│   ├── package.json
│   └── vite.config.*
├── Dockerfile                     # Backend-only, HF Spaces
└── .env.example                   # Variables de entorno documentadas
```

---

## ⚙️ Stack tecnológico

| Capa | Tecnología | Versión | Notas |
|------|-----------|---------|-------|
| Frontend framework | React | 18.2.0 | SPA |
| Frontend build | Vite | 4.4.5 | Dev server port 5173 |
| Lenguaje frontend | TypeScript | (vite plugin) | Strict en features nuevas |
| Estilos | TailwindCSS | 3.3.3 | Utility-first, sin CSS módulos |
| Animaciones | Framer Motion | 10.16.4 | Transiciones e interacciones |
| Iconos | lucide-react | 0.284.0 | Único set de iconos |
| HTTP client | axios | 1.5.1 | Vía apiClient.ts |
| Routing | react-router-dom | 6.30.1 | SPA routes |
| Excel parsing | xlsx | 0.18.5 | Cliente |
| ZIP client | jszip | 3.10.1 | Empaquetado ZIP |
| Notificaciones | sonner | 2.0.7 | Toast |
| Canvas | Konva / HTML5 | — | Template Editor |
| Tests frontend | vitest | 2.1.8 | |
| Backend framework | FastAPI | latest | Python 3.11 |
| Servidor ASGI | uvicorn | latest | Port 7860 |
| PDF engine | WeasyPrint | latest | Requiere Cairo/Pango |
| PDF tools | pypdf | ≥4.0.0 | Merge, split, organize |
| Compresión PDF | Ghostscript | sistema | Opcional, detectable |
| Imágenes | Pillow/PIL | ≥10.0.0 | |
| Templates | Jinja2 | latest | Sandboxed para preview |
| Validación | Pydantic / pydantic-settings | ≥2.0.0 | |
| Storage | Supabase | ≥2.8.1 | Assets/brand-kits |
| Persistencia local | JSON files | — | backend/data/*.json |
| HTTP async | httpx | ≥0.25.0 | Con HTTP/2 |

---

## 🚀 Comandos esenciales

### Backend

```bash
# Instalar dependencias
pip install -r backend/requirements.txt

# Iniciar servidor (desarrollo)
cd backend && uvicorn main:app --host 0.0.0.0 --port 7860 --reload

# Iniciar servidor (producción — como en Dockerfile)
cd backend && uvicorn main:app --host 0.0.0.0 --port 7860

# Tests
cd backend && pytest

# Type check (pyright)
pyright backend/

# Lint (si está configurado)
# [COMPLETAR: verificar si hay ruff/flake8/black en el proyecto]
```

> **Nota**: Siempre ejecutar con `PYTHONPATH=./backend` o desde el directorio `backend/`.
> En desarrollo local: copiar `.env.example` a `.env` en la raíz.

### Frontend

```bash
# Instalar dependencias
cd frontend && npm install

# Iniciar dev server (port 5173)
cd frontend && npm run dev

# Build de producción
cd frontend && npm run build

# Preview del build
cd frontend && npm run preview

# Tests
cd frontend && npm run test

# Type check (no hay script dedicado — usar tsc directamente)
cd frontend && npx tsc --noEmit
```

---

## 📦 Módulos existentes

| Módulo | Prefijo backend | Ruta frontend | Descripción |
|--------|----------------|---------------|-------------|
| Core/API | `/api` | `/` (App.jsx) | Generador principal, PDF tools integrados |
| Technical Reports | `/api/technical-reports` | `/reportes-tecnicos` | Informes técnicos desde CSV/XLSX |
| Fichas Técnicas | `/api/fichas-tecnicas` | `/fichas-tecnicas` | Fichas de actividades con productos químicos |
| Multi-Sheet Report | `/api/multi-sheet` | `/msheets` | Reportes multi-hoja con plantillas independientes |
| Template Editor | `/api/template-editor` | `/template-editor` | Editor visual de plantillas con canvas Konva |
| Compressor | `/api/compressor` | `/compressor` | Compresión PDF via Ghostscript (batch o individual) |
| Image Optimizer | `/api/image-optimizer` | `/image-optimizer` | Optimización cliente + ZIP en backend |
| PDF Tools | `/api/tools/*` | `/pdf-tools` | Merge (interleaved/normal), split, organize, extract |

---

## 🗂️ Patrones y convenciones

### Backend

- **Estructura de módulo**: `router.py` + `models.py` + `templates/` (opcionalmente `service.py`)
- **Prefijo de rutas**: `/api/[modulo]/[recurso]`
- **Validación**: Pydantic v2 en `models.py`; `pydantic-settings` para config
- **Errores**: `HTTPException` con códigos HTTP estándar; error codes en string (BAD_REQUEST, FORBIDDEN…)
- **COLUMN_MAPPING**: Normalización de columnas Excel/CSV en `technical_reports` — respetar al añadir columnas nuevas
- **Templates PDF**: Jinja2 en `backend/[modulo]/templates/` — no usar CSS incompatible con WeasyPrint
- **Compresión**: Ghostscript via subprocess (detección automática); fallback pypdf si no está instalado
- **Progreso SSE**: `core/progress.py` + endpoint `*-progress` con `EventSourceResponse`
- **Multipart limit**: 50 MB por campo (parchado en `main.py` al iniciar)
- **Supabase**: Solo en `template_editor` para assets; usar `settings.effective_supabase_key`

### Frontend

- **Módulos UI**: `frontend/src/features/[Modulo]/` — cada feature es autocontenida
- **Componentes compartidos**: `frontend/src/components/` — solo si se reutiliza en ≥2 módulos
- **Hooks disponibles**:
  - `useSSEProgress` — streaming SSE con fases (preparing→rendering→merging→compressing)
  - `useAsyncAction` — wraps async con `isLoading` + extracción de error desde axios
  - `useFocusMode` — toggle focus mode con Ctrl+. y navegación con flechas
  - `useLocalDraft` — persistencia de borrador en localStorage
- **Estilos**: TailwindCSS utility-first; sin CSS modules salvo excepciones justificadas
- **Animaciones**: Framer Motion para transiciones e interacciones (no CSS keyframes manuales)
- **Fetch**: Siempre usar `apiClient` de `frontend/src/utils/apiClient.ts` (no `fetch` directo ni axios new instance)
  - `apiClient.post(url, formData, { responseType: 'blob' })` para PDFs/ZIPs
  - Helper `postBlob(url, formData, timeout?)` disponible en el mismo módulo
- **Tipado**: TypeScript estricto en props, estados y respuestas de API; archivos nuevos en `.tsx`/`.ts`
- **Iconos**: Solo `lucide-react` — no añadir otras librerías de iconos

---

## 🔒 Reglas para el agente (OBLIGATORIAS)

### ✅ Siempre hacer

- Seguir la estructura de módulo existente (`router.py` + `models.py` + `templates/`) al crear código nuevo
- Usar el `COLUMN_MAPPING` existente en `technical_reports` para normalización de datos
- Tipar con TypeScript en frontend (props, estados, respuestas API)
- Documentar endpoints nuevos con `summary=` y `response_model=` en FastAPI
- Ejecutar `npm run test` y `npx tsc --noEmit` antes de declarar una tarea completada
- Usar `apiClient.ts` para todas las llamadas HTTP desde el frontend
- Usar `useSSEProgress` para endpoints con progreso largo (generación de PDF masivo)

### ❌ Nunca hacer

- Modificar archivos fuera del módulo indicado en la tarea
- Agregar dependencias `npm` o `pip` sin confirmación explícita del usuario
- Usar propiedades CSS no compatibles con WeasyPrint en templates PDF (ej: `flexbox`, `grid`, `position: fixed`)
- Hacer `git push --force` o comandos destructivos sin confirmación
- Exponer `SUPABASE_SERVICE_ROLE_KEY` u otros secrets en código frontend
- Usar librerías externas no listadas en `package.json` o `requirements.txt`
- Crear instancias axios adicionales fuera de `apiClient.ts`
- Usar `fetch()` directo en el frontend
- Codificar archivos en UTF-8 a menos que sea estrictamente necesario y el proyecto lo requiera explícitamente

---

## 🧩 Variables de entorno necesarias

| Variable | Lado | Descripción |
|----------|------|-------------|
| `PYTHONPATH` | Backend (dev) | `./backend` — para imports locales |
| `ENVIRONMENT` | Backend | `dev`/`development`/`local`/`production` |
| `CORS_ORIGINS` | Backend | Lista separada por comas de orígenes permitidos |
| `SUPABASE_URL` | Backend | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | Service role key (nunca al frontend) |
| `TEMPLATE_STORAGE_BUCKET` | Backend | Bucket de assets en Supabase (default: `template-assets`) |
| `FEATURE_TEMPLATE_EDITOR` | Backend | Feature flag del editor (`true`/`false`) |
| `GHOSTSCRIPT_ENABLED` | Backend | Activar compresión Ghostscript (`true`/`false`) |
| `GHOSTSCRIPT_QUALITY` | Backend | Calidad Ghostscript: `screen`/`ebook`/`printer`/`prepress` |
| `GTK_RUNTIME_BIN` | Backend (Windows) | Ruta bin de GTK para WeasyPrint en Windows |
| `VITE_API_URL` | Frontend | URL base de la API, ej: `http://localhost:7860/api` |

---

## 📌 Decisiones técnicas importantes

1. **JSON local en lugar de DB relacional**: Los datos de informes y fichas se persisten en `backend/data/*.json` para simplicidad de despliegue en Glitch/HF Spaces sin necesidad de infraestructura de base de datos.

2. **Frontend separado del backend**: El frontend se despliega en Vercel y el backend en Hugging Face Spaces (Dockerfile). Se comunican via `VITE_API_URL`. No hay SSR.

3. **WeasyPrint sobre Puppeteer/wkhtmltopdf**: WeasyPrint es Python nativo, compatible con el entorno HF Spaces sin Chrome headless. Limitación: soporte CSS limitado (no flexbox/grid en versiones antiguas).

4. **Ghostscript como postprocesado opcional**: Se detecta en tiempo de ejecución. Si no está disponible, se usa fallback pypdf. No es un requisito duro.

5. **SSE para progreso de PDF masivo**: Los endpoints `*-progress` usan Server-Sent Events en lugar de WebSockets para compatibilidad con proxies y simplicidad de implementación. El hook `useSSEProgress` gestiona el ciclo de vida.

6. **Supabase solo para template assets**: La integración Supabase es exclusiva del módulo `template_editor` para almacenar imágenes y brand-kits. El resto del sistema usa archivos locales.

7. **Multipart limit ampliado a 50 MB**: Se parchea `MultiPartParser` de Starlette en el arranque de `main.py` para soportar imágenes grandes en formularios.

8. **Canvas Konva en Template Editor**: El editor visual de plantillas usa Konva.js para manipulación de elementos en canvas HTML5, permitiendo diseño drag-and-drop sin dependencias de terceros pesadas.

---

## 🔗 URLs importantes en desarrollo

| Servicio | URL |
|----------|-----|
| Frontend dev | http://localhost:5173 |
| Backend API | http://localhost:7860 |
| Docs OpenAPI (Swagger) | http://localhost:7860/docs |
| Docs ReDoc | http://localhost:7860/redoc |

---

## 📝 Historial de módulos (no duplicar)

Los siguientes módulos **ya existen** — no crear nuevos con funcionalidad equivalente:

| Módulo | Estado | Notas |
|--------|--------|-------|
| `technical_reports` | ✅ Activo | Informes técnicos CSV/XLSX → PDF |
| `fichas_tecnicas` | ✅ Activo | Fichas de actividades con productos químicos |
| `msheets` | ✅ Activo | Multi-hoja con plantillas independientes |
| `template_editor` | ✅ Activo | Editor visual con Konva, versionado, Supabase assets |
| `compressor` | ✅ Activo | Ghostscript + fallback pypdf |
| `image_optimizer` | ✅ Activo | Optimización cliente + ZIP backend |
| `pdf_tools` | ✅ Activo | Merge (interleaved/normal), split, organize, extract |
| `api_router` (core) | ✅ Activo | Templates globales + PDF tools en `/api/tools/*` |


Está extrictament la codificacion en UTF-8..
