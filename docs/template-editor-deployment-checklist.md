# Template Visual Editor - Deployment Checklist

## Scope
- New visual editor UI in `frontend/src/components/tools/TemplateEditor/index.tsx`.
- Editor state engine and interactions in `frontend/src/components/tools/TemplateEditor/reducer.ts`.
- API client coverage for `create`, `update`, `validate`, `preview`, `publish`, `rollback`, and variable catalog.
- Legacy PDF generation endpoints and payload contracts remain unchanged.

## Pre-deploy Validation
- Frontend unit tests: `npm test` (inside `frontend`).
- Frontend build: `npm run build` (inside `frontend`).
- Backend template editor regression: `pytest backend/tests/test_template_editor_endpoints.py -q`.
- Manual smoke:
  - Open `template-editor.html`.
  - Drag and drop text and variables blocks.
  - Validate and ensure unknown variables show errors.
  - Publish valid template and preview sample render.
  - Generate PDF from `/api/generate-pdf` with `templateName` and verify compatibility.

## Feature Flag and Fallback
- Keep `FEATURE_TEMPLATE_EDITOR=false` in production until QA sign-off.
- Enable `FEATURE_TEMPLATE_EDITOR=true` only after validation runbook completion.
- If any editor runtime issue appears, fallback is transparent:
  - Disable flag to stop visual-template publish usage in PDF flow.
  - Existing legacy `/api/templates` + `/api/generate-pdf` flow continues unaffected.

## Rollback Plan
- Functional rollback:
  - Use `POST /api/template-editor/templates/{id}/rollback` for template version rollback.
- Operational rollback:
  - Disable `FEATURE_TEMPLATE_EDITOR` and redeploy backend config.

## Accessibility and UX QA
- Validate keyboard shortcuts:
  - `Ctrl/Cmd+Z`, `Shift+Ctrl/Cmd+Z`, `Ctrl/Cmd+D`, `Delete`, arrows, `Shift+arrows`.
- Validate focus states and tab order in topbar, sidebars, and inspector.
- Confirm protected blocks show visual badge and are immutable for `editor` role.

## E2E Suggested Evidence
- Capture one short clip/GIF with this flow:
  1) Create section and add text block.
  2) Drag variable block and insert `{{cs}}` via picker.
  3) Try invalid variable to show inline error.
  4) Save, validate, publish.
  5) Preview and generate PDF using current backend flow.
