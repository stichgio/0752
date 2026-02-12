# Template Editor Architecture

## Objetivo
Introducir plantillas visuales avanzadas sin romper el flujo legacy (`/api/templates`, `/api/templates/{filename}`, `/api/generate-pdf`).

## Modelo dual
- **Canónico**: `templateJson` (sections, blocks, metadata, variableBindings, protectionRules).
- **Runtime**: compilado determinístico con `compileTemplateJsonToJinja(templateJson) -> string`.
- **Compatibilidad**: `generate-pdf` mantiene contrato, y resuelve `templateName` contra plantillas visuales publicadas solo cuando están habilitadas.

## Endpoints nuevos
- `POST /api/template-editor/templates`
- `GET /api/template-editor/templates/:id`
- `PUT /api/template-editor/templates/:id`
- `POST /api/template-editor/templates/:id/validate`
- `POST /api/template-editor/templates/:id/preview`
- `POST /api/template-editor/templates/:id/publish`
- `POST /api/template-editor/templates/:id/rollback`
- `GET /api/template-editor/variables/catalog?report_type=...`

## Seguridad
- Sanitizacion HTML con lista blanca (`bleach`) y bloqueo de `script`, `iframe`, `on*` handlers.
- Validacion estricta de variables `{{variable_name}}` con filtros whitelist.
- Bloques protegidos por rol (`admin`/`editor`) con placeholders permitidos.
- Rate-limit basico para `preview`.

## Versionado
- Estados: `draft`, `published`, `archived`.
- Historial en `versions[]` con autor, fecha, version y `diffSummary`.
- Publicacion atomica por actualizacion de metadata y version activa.
- Rollback en una accion creando una nueva version publicada basada en la anterior.

## Feature flags
- `FEATURE_TEMPLATE_EDITOR=true` habilita publicacion por API.
- `featureFlag` a nivel de template controla si una plantilla publicada puede ser usada por `generate-pdf`.

## Operacion y rollback
- Rollback funcional: endpoint `rollback` restaura contenido compilado de version previa.
- Rollback operativo: deshabilitar `FEATURE_TEMPLATE_EDITOR` y seguir solo con flujo legacy.
