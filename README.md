# AutoReport - Sistema de Gestión de Informes

Sistema de gestión de informes técnicos y fichas técnicas para limpieza y desinfección de reservorios. Genera documentos PDF profesionales a partir de datos Excel/CSV con normalización automática de columnas.

## Características

- **Informes Técnicos**: Generación de PDFs con datos de inspección de reservorios
- **Fichas Técnicas**: Documentación de actividades de limpieza y desinfección
- **Editor de Plantillas**: Sistema visual de bloques para crear templates con arrastre y soltar
- **Herramientas PDF**: Merge, split, rotación y extracción de páginas
- **Optimizador de Imágenes**: Compresión y redimensión de imágenes
- **Compresor**: Compresión de imágenes con configuración de calidad
- **Calculadora**: Herramienta de cálculo de volúmenes y capacidades
- **Temporizador Pomodoro**: Temporizador para gestión del tiempo
- **Importación Flexible**: Soporte para Excel (.xlsx) y CSV con normalización automática

## Tecnologías

| Capa | Tecnología |
|------|------------|
| Backend | FastAPI + Python 3.11 |
| Frontend | React 18 + Vite + TailwindCSS + TypeScript |
| PDF | WeasyPrint + Jinja2 |
| Base de Datos | JSON local / Supabase (opcional) |
| Despliegue | Vercel (Frontend) + Render/Docker (Backend) |

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
   - PreviewPanel.tsx     - Service layer        - HTML → PDF
   - API calls (fetch)    - Column mapping
```

1. **Frontend (React/Vite)**: El usuario completa un formulario o sube un archivo Excel/CSV desde los componentes en [`frontend/src/components/tools/`](frontend/src/components/tools/)
2. **Transmisión de datos**: Los datos se envían al backend via API REST
3. **Normalización**: El backend normaliza las columnas usando diccionarios de mapeo
4. **Generación PDF**: Se renderiza una plantilla Jinja2 y se convierte a PDF usando WeasyPrint

### Configuración del Proxy

El frontend está configurado para redirigir automáticamente las peticiones `/api` al backend:

```javascript
// frontend/vite.config.js
server: {
    proxy: {
        '/api': {
            target: 'http://localhost:8000',
            changeOrigin: true
        }
    }
}
```

---

## Estructura de Datos: Normalización de Columnas

### El Diccionario `COLUMN_MAPPING`

El sistema normaliza las columnas de Excel/CSV usando diccionarios de mapeo que actúan como **fuente única de verdad**. Esto permite que el sistema acepte variaciones en los nombres de columnas de los archivos fuente.

```python
# backend/technical_reports/router.py
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

2. **Búsqueda en el mapping**: El valor normalizado se busca en el diccionario de mapeo

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
# Puerto por defecto: 8000
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

El backend estará disponible en: `http://localhost:8000`

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
BACKEND_PUBLIC_URL=http://localhost:8000
FEATURE_TEMPLATE_EDITOR=true
# Supabase (opcional)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-key
```

**Frontend** ([`frontend/.env.example`](frontend/.env.example)):
```bash
# Desarrollo local
VITE_API_URL=http://localhost:8000/api
```

### Producción

#### Docker (Backend)

```bash
# Construir la imagen
docker build -t glitch-autoreport-backend .

# Ejecuter el contenedor
docker run -p 8000:8000 glitch-autoreport-backend
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
| Backend FastAPI | 8000 | `http://localhost:8000` |
| Frontend Vite | 5173 | `http://localhost:5173` |
| API Base | - | `/api` |

---

## Estructura del Proyecto

```
├── backend/
│   ├── main.py                    # App FastAPI principal
│   ├── requirements.txt           # Dependencias Python
│   ├── config.py                  # Configuración centralizada
│   ├── report_service.py          # Servicio de generación de reportes
│   ├── technical_reports/         # Módulo de informes técnicos
│   │   ├── router.py              # Endpoints API + COLUMN_MAPPING
│   │   ├── templates/             # Plantillas Jinja2
│   │   ├── database.py            # Persistencia JSON
│   │   └── models.py              # Modelos de datos
│   ├── fichas_tecnicas/           # Módulo de fichas técnicas
│   │   ├── router.py              # Endpoints API
│   │   ├── templates/             # Plantillas HTML
│   │   ├── database.py            # Persistencia JSON
│   │   ├── models.py              # Modelos de datos
│   │   └── word_service.py        # Generación Word
│   ├── template_editor/           # Editor visual de bloques
│   │   ├── router.py              # Endpoints API
│   │   ├── service.py             # Lógica de negocio
│   │   ├── compiler.py            # Compilador de templates
│   │   ├── supabase_client.py     # Cliente Supabase
│   │   └── validators.py          # Validadores
│   ├── pdf_tools/                 # Herramientas PDF (merge/split)
│   │   ├── pdf_merger.py          # Fusionar PDFs
│   │   ├── pdf_splitter.py        # Dividir PDFs
│   │   └── utils.py               # Utilidades PDF
│   ├── compressor/                # Compresión de imágenes
│   ├── image_optimizer/           # Optimizador de imágenes
│   ├── db/                        # Base de datos JSON
│   ├── utils/                     # Utilidades
│   └── tests/                     # Pruebas unitarias
├── frontend/
│   ├── src/
│   │   ├── main.jsx               # Punto de entrada
│   │   ├── App.jsx                # Componente principal
│   │   ├── index.css              # Estilos globales
│   │   ├── components/
│   │   │   ├── DashboardLayout.jsx # Layout principal
│   │   │   ├── PomodoroTimer.jsx  # Temporizador Pomodoro
│   │   │   ├── PreviewPanel.jsx   # Panel de previsualización
│   │   │   └── tools/             # Herramientas
│   │   │       ├── TechnicalReports/
│   │   │       ├── FichasTecnicas/
│   │   │       ├── TemplateEditor/
│   │   │       ├── PDFTools/
│   │   │       ├── Compressor/
│   │   │       ├── ImageOptimizer/
│   │   │       └── Calculator/
│   │   ├── constants/             # Constantes y campos
│   │   ├── hooks/                 # Custom hooks
│   │   └── utils/                 # Utilidades API
│   ├── public/
│   │   ├── calculator.html        # Calculadora standalone
│   │   └── pdf-tools.html         # Herramientas PDF standalone
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── tsconfig.json
├── data/                          # Datos de ejemplo
├── scripts/                       # Scripts auxiliares
├── Dockerfile                     # Imagen Docker del backend
├── docker-compose.yml             # Orquestación Docker
├── package.json                   # Workspace npm
└── README.md
```

---

## Módulos del Sistema

### Informes Técnicos ([`backend/technical_reports/`](backend/technical_reports/))

Generación de informes técnicos para inspección de reservorios:
- Carga de datos desde Excel/CSV
- Normalización automática de columnas
- Generación de PDF profesional
- Previsualización en tiempo real

### Fichas Técnicas ([`backend/fichas_tecnicas/`](backend/fichas_tecnicas/))

Documentación de actividades de limpieza y desinfección:
- Gestión de base de datos de fichas
- Generación de documentos Word y PDF
- Plantillas personalizables

### Editor de Plantillas ([`backend/template_editor/`](backend/template_editor/))

Sistema visual de edición de templates:
- Editor de canvas con arrastre y soltar
- Componentes: texto, imágenes, tablas, líneas
- Configuración de páginas y estilos
- Persistencia en Supabase (opcional)
- Exportación a JSON

### Herramientas PDF ([`backend/pdf_tools/`](backend/pdf_tools/))

Suite de herramientas para manipulate PDFs:
- **Merge**: Unir múltiples PDFs
- **Split**: Dividir PDF en páginas individuales
- **Rotate**: Rotar páginas
- **Extract**: Extraer rango de páginas

### Compresor ([`backend/compressor/`](backend/compressor/))

Compresión de imágenes:
- Configuración de calidad
- Presets de compresión
- Preview antes de descargar

### Optimizador de Imágenes ([`backend/image_optimizer/`](backend/image_optimizer/))

Optimización avanzada de imágenes:
- Redimensión automática
- Compresión con pérdida
- Formatos de salida múltiples

---

## Licencia

MIT License - Proyecto desenvolvido para uso interno.
