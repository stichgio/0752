---
title: Glitch/AutoReport
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# Glitch/AutoReport

Sistema de gestión de informes técnicos y fichas técnicas para limpieza y desinfección de reservorios. Genera documentos PDF profesionales a partir de datos Excel/CSV con normalización automática de columnas.

## Características

- **Informes Técnicos**: Generación de PDFs con datos de inspección de reservorios
- **Fichas Técnicas**: Documentación de actividades de limpieza y desinfección
- **Editor de Plantillas**: Sistema visual de bloques para crear templates
- **Herramientas PDF**: Merge, split y compresión de PDFs
- **Optimizador de Imágenes**: Compresión y redimensión de imágenes
- **Importación Flexible**: Soporte para Excel (.xlsx) y CSV con normalización automática

## Tecnologías

| Capa | Tecnología |
|------|------------|
| Backend | FastAPI + Python 3.11 |
| Frontend | React 18 + Vite + TailwindCSS |
| PDF | WeasyPrint + Jinja2 |
| Base de Datos | JSON local / Supabase (opcional) |
| Despliegue | Vercel (Frontend) + HuggingFace Spaces (Backend) |

---

## Arquitectura

### Flujo de Datos: React → FastAPI → PDF

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Frontend      │      │   Backend       │      │   Generación    │
│   (React/Vite)  │ ──▶  │   (FastAPI)     │ ──▶  │   (WeasyPrint)  │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │                        │
   - FormPanel.tsx        - router.py            - Jinja2 templates
   - PreviewPanel.tsx     - COLUMN_MAPPING       - HTML → PDF
   - API calls (fetch)    - Service layer
```

1. **Frontend (React/Vite)**: El usuario completa un formulario o sube un archivo Excel/CSV desde [`FormPanel.tsx`](frontend/src/components/tools/TechnicalReports/FormPanel.tsx)
2. **Transmisión de datos**: Los datos se envían al backend via API REST en [`technical_reports/router.py`](backend/technical_reports/router.py)
3. **Normalización**: El backend normaliza las columnas usando [`COLUMN_MAPPING`](backend/technical_reports/router.py:90)
4. **Generación PDF**: Se renderiza una plantilla Jinja2 ([`informe_tecnico.html`](backend/technical_reports/templates/informe_tecnico.html)) y se convierte a PDF usando WeasyPrint

### Configuración del Proxy

El frontend está configurado para redirigir automáticamente las peticiones `/api` al backend:

```javascript
// frontend/vite.config.js
server: {
    proxy: {
        '/api': {
            target: 'http://localhost:7860',
            changeOrigin: true
        }
    }
}
```

---

## Estructura de Datos: Normalización de Columnas

### El Diccionario `COLUMN_MAPPING`

El sistema normaliza las columnas de Excel/CSV usando el diccionario [`COLUMN_MAPPING`](backend/technical_reports/router.py:90) que actúa como **fuente única de verdad**. Esto permite que el sistema acepte variaciones en los nombres de columnas de los archivos fuente.

```python
# backend/technical_reports/router.py (línea 90)
COLUMN_MAPPING = {
    # Identificadores
    'nroinforme': 'informe_id',
    'numeroinforme': 'informe_id',
    'informe': 'informe_id',
    
    # Centro de Servicio
    'centrodeservicio': 'cs',
    'centroservicio': 'cs',
    'sede': 'cs',
    
    # Datos Generales
    'contratista': 'contratista',
    'codigoinfraestructura': 'codigo_infraestructura',
    'volumenm3': 'volumen',
    
    # Inspección (Estados)
    'cajaregistro': 'caja_registro',
    'marcotapa': 'marco_tapa',
    'escalerainterior': 'escalera_interior',
    # ... más campos
}
```

### Cómo Funciona la Normalización

1. **Normalización del header**: Se eliminan acentos, espacios y caracteres especiales
   ```python
   def normalize_header_value(value: str) -> str:
       text = str(value).strip().lower()
       text = unicodedata.normalize("NFKD", text)
       text = "".join(ch for ch in text if not unicodedata.combining(ch))
       return re.sub(r"[\s_\.:\-°]+", "", text)
   ```

2. **Búsqueda en el mapping**: El valor normalizado se busca en `COLUMN_MAPPING`
   ```python
   normalized_key = normalize_header_value(k)
   if normalized_key in COLUMN_MAPPING:
       clean_key = COLUMN_MAPPING[normalized_key]
   ```

3. **Campos soportados**:
   - **Identificadores**: informe_id, cs, contratista
   - **Infraestructura**: codigo_infraestructura, ubicacion, suministro, volumen
   - **Estados de inspección**: caja_registro, marco_tapa, escalera_interior, cuba_interior, etc.
   - **Medidas**: diametro, altura_util, altura_total
   - **Observaciones y sugerencias**: obs_*, sug_*

---

## Guía de Despliegue

### Requisitos Previos

- Python 3.11+
- Node.js 18+
- npm o yarn

### Desarrollo Local

#### 1. Backend (FastAPI)

```bash
# Navegar al directorio backend
cd backend

# Crear entorno virtual (opcional pero recomendado)
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar el servidor
# Puerto por defecto: 7860
uvicorn main:app --host 0.0.0.0 --port 7860 --reload
```

El backend estará disponible en: `http://localhost:7860`

#### 2. Frontend (Vite + React)

```bash
# Navegar al directorio frontend
cd frontend

# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev
```

El frontend estará disponible en: `http://localhost:5173`

#### 3. Configuración de Variables de Entorno

**Backend** ([`backend/.env.example`](backend/.env.example)):
```bash
# Copiar y configurar
cp backend/.env.example backend/.env

# Editar con tus valores
BACKEND_PUBLIC_URL=http://localhost:7860
FEATURE_TEMPLATE_EDITOR=true
# Supabase (opcional)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-key
```

**Frontend** ([`frontend/.env.example`](frontend/.env.example)):
```bash
# Desarrollo local
VITE_API_URL=http://localhost:7860/api
```

### Producción

#### Docker (Backend)

```bash
# Construir la imagen
docker build -t glitch-autoreport-backend .

# Ejecuter el contenedor
docker run -p 7860:7860 glitch-autoreport-backend
```

#### Vercel (Frontend)

```bash
cd frontend
npm install -g vercel
vercel deploy
```

### Puertos y Endpoints

| Servicio | Puerto | Endpoint |
|----------|--------|----------|
| Backend FastAPI | 7860 | `http://localhost:7860` |
| Frontend Vite | 5173 | `http://localhost:5173` |
| API Base | - | `/api` |

---

## Estructura del Proyecto

```
├── backend/
│   ├── main.py                 # App FastAPI principal
│   ├── requirements.txt        # Dependencias Python
│   ├── technical_reports/      # Módulo de informes técnicos
│   │   ├── router.py           # Endpoints API + COLUMN_MAPPING
│   │   ├── templates/          # Plantillas Jinja2
│   │   └── database.py        # Persistencia JSON
│   ├── fichas_tecnicas/        # Módulo de fichas técnicas
│   ├── template_editor/        # Editor visual de bloques
│   ├── pdf_tools/              # Herramientas PDF (merge/split)
│   └── ...
├── frontend/
│   ├── src/
│   │   ├── components/         # Componentes React
│   │   │   └── tools/          # Herramientas (TechnicalReports, etc.)
│   │   └── utils/              # Utilidades API
│   ├── vite.config.js          # Configuración Vite
│   └── package.json
└── Dockerfile                   # Imagen Docker del backend
```

---

## Licencia

MIT License - Proyecto desenvolvido para uso interno.
