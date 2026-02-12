# TemplateDocument Canonical Model

El editor visual ahora usa un documento canónico en frontend (`TemplateDocument`) con elementos posicionados en canvas A4.

## Modelo
- `TemplateDocument`: `id`, `name`, `reportType`, `page`, `elements`, `version`, `status`, `createdAt`, `updatedAt`, `publishedAt`.
- `elements[]`: unión tipada de `text`, `image`, `table`, `variable`, `protected`.
- Cada elemento incluye layout absoluto: `x`, `y`, `width`, `height`, `zIndex`, `rotation`, `locked`, `visible`.

## Compatibilidad backend (sin regresión)
- El backend actual conserva contrato `/api/template-editor/*` basado en `templateJson` legacy.
- El frontend convierte automáticamente:
  - `TemplateDocument -> templateJson` antes de `create/update/validate`.
  - `templateJson -> TemplateDocument` al leer un template existente.
- El flujo legacy `/api/templates` + `/api/generate-pdf` no cambia.

## Archivo de mapeo
- `frontend/src/components/tools/TemplateEditor/mapper.ts`
