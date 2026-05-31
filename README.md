---
title: Glitch/AutoReport
emoji: 📋
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# 🧠 Glitch/AutoReport — Sistema de Generación de Informes PDF

Sistema web completo para generar informes técnicos en PDF. Importa datos desde Excel/CSV, mapea columnas, personaliza plantillas HTML/Jinja2 y genera PDFs individuales o consolidados con logos.

**Versión:** 1.0.0 | **Estado:** En desarrollo | **Stack:** FastAPI + React 18 + Vite

---

## 🎯 Características principales

- ✅ **Importación de datos** — Excel/CSV con mapeo automático de columnas
- ✅ **Editor de plantillas visual** — Canvas + inspector + vista previa en tiempo real
- ✅ **Múltiples tipos de reportes**:
  - Informes técnicos completos
  - Fichas técnicas de actividades
  - Reportes multi-hoja consolidados
- ✅ **Herramientas PDF** — Fusionar, dividir, extraer, organizar
- ✅ **Optimización** — Compresión con Ghostscript, optimización de imágenes
- ✅ **Personalización** — Logo corporativo, fondos, marca personalizada
- ✅ **Almacenamiento en la nube** — Supabase Storage para assets

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────┐
│    Frontend (React 18 + Vite)   │
│ http://localhost:5173 (dev)     │
│ Vercel (prod)                   │
└────────────────┬────────────────┘
                 │ VITE_API_URL=/api
                 ▼
┌─────────────────────────────────┐
│    Backend (FastAPI Python)     │
│ http://localhost:7860 (local)   │
│ Hugging Face Spaces (prod)      │
└──┬──────────────────────────────┘
   │
   ├── /api/technical-reports    → PDF técnicos
   ├── /api/fichas-tecnicas      → Fichas de actividades
   ├── /api/multi-sheet          → Reportes consolidados
   ├── /api/template-editor      → Preview & render
   ├── /api/compressor           → Compresión Ghostscript
   ├── /api/image-optimizer      → Optimización & ZIP
   ├── /api/tools/*              → Merge/Split/Extract PDF
   └── /docs                     → OpenAPI interactive docs
```

---

## 📦 Stack tecnológico

### Backend
- **FastAPI** (Python 3.11) — API REST asincrónica
- **Pydantic** — Validación de datos
- **Jinja2** — Renderización de plantillas
- **WeasyPrint** — Conversión HTML → PDF
- **Ghostscript** — Compresión de PDFs
- **pypdf** — Manipulación de PDFs (merge, split)
- **Supabase** — Almacenamiento en la nube
- **python-multipart** — Upload de archivos

### Frontend
- **React 18** — UI componentes
- **Vite** — Build tool rápido
- **TypeScript** — Type safety
- **Axios** — Cliente HTTP
- **React Router** — Navegación SPA
- **Tailwind CSS** — Estilos utilities

### Infraestructura
- **Docker** — Containerización (Hugging Face Spaces)
- **Vercel** — Deploy frontend
- **Hugging Face Spaces** — Deploy backend

---

## 📁 Estructura del proyecto

```
/
├── backend/
│   ├── main.py                    # App principal, routers, middlewares
│   ├── config.py                  # Configuración (env vars)
│   ├── requirements.txt           # Dependencias Python
│   ├── Dockerfile                 # Containerización HF Spaces
│   │
│   ├── technical_reports/         # Módulo: Informes técnicos
│   │   ├── router.py              # POST /api/technical-reports
│   │   ├── models.py              # Pydantic models
│   │   └── templates/             # Jinja2 plantillas
│   │
│   ├── fichas_tecnicas/           # Módulo: Fichas técnicas
│   │   ├── router.py              # POST /api/fichas-tecnicas
│   │   ├── models.py              # Pydantic models
│   │   └── templates/             # Jinja2 plantillas
│   │
│   ├── msheets/                   # Módulo: Multi-hoja
│   │   ├── multi_sheet_report.py  # Lógica + router
│   │   └── mtemplates/            # Plantillas
│   │
│   ├── template_editor/           # Módulo: Editor visual
│   │   ├── router.py              # GET/POST /api/template-editor
│   │   └── models.py              # EditorBlock, Template, etc.
│   │
│   ├── compressor/                # Módulo: Compresión PDF
│   │   └── router.py              # POST /api/compressor
│   │
│   ├── image_optimizer/           # Módulo: Optimización de imágenes
│   │   └── router.py              # POST /api/image-optimizer
│   │
│   ├── pdf_tools/                 # Utilidades PDF
│   │   ├── merge.py               # Fusionar PDFs
│   │   ├── split.py               # Dividir PDFs
│   │   ├── extract.py             # Extraer páginas
│   │   └── organize.py            # Reorganizar PDFs
│   │
│   ├── core/
│   │   └── progress.py            # SSE progress tracking
│   │
│   ├── data/                      # Persistencia JSON
│   └── templates/                 # Plantillas compartidas
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Componente raíz
│   │   ├── AppRouter.jsx          # Rutas React Router
│   │   │
│   │   ├── features/              # Módulos por funcionalidad
│   │   │   ├── technical-reports/ # /reportes-tecnicos
│   │   │   ├── fichas-tecnicas/   # /fichas-tecnicas
│   │   │   ├── multi-sheet-report/# /multi-hoja
│   │   │   ├── template-editor/   # /template-editor (visual)
│   │   │   ├── compressor/        # /compressor
│   │   │   ├── image-optimizer/   # /image-optimizer
│   │   │   └── pdf-tools/         # /pdf-tools
│   │   │
│   │   ├── components/            # Componentes compartidos
│   │   │   ├── ui/                # Step, Button, Modal, etc.
│   │   │   ├── layout/            # DashboardLayout, Page
│   │   │   ├── PreviewPanel.jsx   # Vista previa PDF
│   │   │   └── DataPreviewTable.jsx
│   │   │
│   │   ├── hooks/                 # Custom hooks
│   │   ├── utils/                 # Utilidades
│   │   │   ├── apiClient.ts       # Axios instance
│   │   │   └── apiBase.ts         # Resolución de base URL
│   │   │
│   │   └── styles/                # CSS global
│   │
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── .env.example                   # Variables de entorno
├── .gitignore
└── README.md                      # Este archivo
```

---

## 🚀 Inicio rápido

### Prerequisitos
- Node.js 18+ (frontend)
- Python 3.11+ (backend)
- Git

### Instalación local

#### 1. Backend (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Variables de entorno
cp ../.env.example .env
# Editar .env con tus credenciales Supabase

# Ejecutar servidor
python main.py
# http://localhost:7860 (default) o ver en consola
```

#### 2. Frontend (React + Vite)
```bash
cd frontend
npm install

# Variables de entorno
echo "VITE_API_URL=http://localhost:7860/api" > .env.local

# Dev server
npm run dev
# http://localhost:5173
```

---

## 📖 Guía de uso

### Flujo principal: Generar un informe técnico

1. **Subir datos**
   - Ve a `/reportes-tecnicos`
   - Carga un archivo Excel/CSV con datos de campo

2. **Mapear columnas**
   - Asocia columnas del archivo a variables del informe
   - Vista previa en tiempo real

3. **Seleccionar plantilla**
   - Elige una plantilla predefinida o personaliza una
   - Editor visual en `/template-editor`

4. **Generar PDF**
   - El backend renderiza con WeasyPrint
   - Descarga individual o consolidada

### Uso del Editor de Plantillas

- **Canvas**: Arrastrar bloques (texto, tabla, imagen)
- **Inspector**: Editar propiedades (color, fuente, tamaño)
- **Vista previa**: Renderización en tiempo real con datos de muestra
- **Guardar**: Persistencia en BD local (JSON)

### Herramientas PDF

En `/pdf-tools` puedes:
- Fusionar múltiples PDFs
- Dividir un PDF en páginas individuales
- Extraer páginas específicas
- Reorganizar el orden de las páginas

---

## 🔌 API endpoints principales

### Informes técnicos
```
POST /api/technical-reports
  Cuerpo: { data, template_id, column_mapping, ... }
  Respuesta: PDF binario
```

### Fichas técnicas
```
POST /api/fichas-tecnicas
  Cuerpo: { data, template_id, ... }
  Respuesta: PDF binario
```

### Template Editor
```
GET  /api/template-editor                  # Listar plantillas
POST /api/template-editor                  # Crear/actualizar
POST /api/template-editor/preview          # Preview con datos
```

### Herramientas PDF
```
POST /api/tools/merge                      # Fusionar PDFs
POST /api/tools/split                      # Dividir PDF
POST /api/tools/extract                    # Extraer páginas
POST /api/tools/organize                   # Reorganizar
```

### Utilidades
```
POST /api/compressor                       # Comprimir PDF
POST /api/image-optimizer                  # Optimizar imágenes
```

📚 **Documentación interactiva:** `/api/docs` (Swagger UI)

---

## ⚙️ Configuración

### Variables de entorno (.env)

```env
# Backend
PYTHON_ENV=development
API_PORT=7860
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com

# Supabase (para almacenamiento de assets)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_BUCKET=templates-assets

# PDF Quality
PDF_DPI=300
MAX_FILE_SIZE=50MB

# Frontend
VITE_API_URL=/api
VITE_ENVIRONMENT=development
```

### Personalización

- **Plantillas**: Edita archivos en `backend/*/templates/`
- **Estilos**: Modifica CSS en `frontend/src/styles/`
- **Colores/Fonts**: Tailwind config en `frontend/tailwind.config.js`

---

## 🧪 Testing

```bash
# Backend - pytest
cd backend
pytest

# Frontend - Vitest
cd frontend
npm run test
```

---

## 🐳 Deploy en Hugging Face Spaces

1. Conecta tu repo a HF Spaces
2. Selecciona **Docker** como SDK
3. El `Dockerfile` se ejecutará automáticamente
4. Backend estará disponible en `https://yourusername-0752.hf.space/api`

Frontend se despliega en **Vercel** con:
```
VITE_API_URL=https://yourusername-0752.hf.space/api
```

---

## 🤝 Contribuir

1. Fork el repo
2. Crea una rama: `git checkout -b feature/mi-feature`
3. Commit: `git commit -m "Add: mi feature"`
4. Push: `git push origin feature/mi-feature`
5. Abre un Pull Request

---

## 📝 Licencia

MIT — Libre para uso comercial y personal

---

## 📞 Soporte

- 💬 Issues: [GitHub Issues](https://github.com/stichgio/0752/issues)
- 🐛 Bugs: Reportar con reproducible example

---

## 🗺️ Roadmap

- [ ] Soporte para firmas digitales
- [ ] Exportación a Excel directo
- [ ] Templates en la nube compartidas
- [ ] Batcher: generar 1000+ PDFs automáticamente
- [ ] API webhook para integraciones externas
- [ ] Mobile app (React Native)
- [ ] Autenticación con OAuth2

---

**Hecho con ❤️ por [stichgio](https://github.com/stichgio)**
