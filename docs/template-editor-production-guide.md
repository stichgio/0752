# Template Editor - Production Activation Guide

This guide is tailored to your current environment:

- Backend URL: `https://shengio-stich-0752.hf.space`
- Frontend domain: `https://gio.theconrad.store`
- Supabase URL: `https://pglctyebcggddduaupkp.supabase.co`

## 1) Supabase setup (one time)

1. Open Supabase SQL Editor for project `pglctyebcggddduaupkp`.
2. Run migration file:
   - `backend/db/migrations/20260212_template_editor_supabase.sql`
3. In Supabase Storage, create bucket:
   - Name: `template-assets`
   - Privacy: private
4. Verify tables exist:
   - `public.templates`
   - `public.template_versions`

## 2) Hugging Face backend secrets

In Space settings -> Secrets, set:

1. `FEATURE_TEMPLATE_EDITOR=true`
2. `SUPABASE_URL=https://pglctyebcggddduaupkp.supabase.co`
3. `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
4. `TEMPLATE_STORAGE_BUCKET=template-assets`
5. `CORS_ORIGINS=https://gio.theconrad.store,https://www.gio.theconrad.store`
6. `CORS_CREDENTIALS=false`

Important:

- Never share `SUPABASE_SERVICE_ROLE_KEY` in chat, commit, logs, or frontend env files.

## 3) Frontend (Vercel)

Set:

- `VITE_API_URL=https://shengio-stich-0752.hf.space/api`

Then redeploy frontend.

## 4) Smoke test (real environment)

Set shell vars:

```bash
BACKEND=https://shengio-stich-0752.hf.space
```

### 4.1 Create template

```bash
curl -sS -X POST "$BACKEND/api/template-editor/templates" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"smoke-template-01",
    "reportType":"technical-report",
    "author":"ops",
    "featureFlag":true,
    "templateJson":{
      "reportType":"technical-report",
      "sections":[{"id":"sec-1","type":"body","title":"Body","blocks":[{"id":"b1","type":"text","content":"<p>{{cs}}</p>","variables":["cs"],"placeholders":[],"metadata":{},"locked":false}],"metadata":{}}],
      "metadata":{},
      "variableBindings":{"cs":"header.cs"},
      "protectionRules":{"required_block_ids":[],"editable_placeholder_by_block":{}}
    }
  }'
```

Save returned `id` as `TEMPLATE_ID`.

### 4.2 Save draft

```bash
curl -sS -X PUT "$BACKEND/api/template-editor/templates/$TEMPLATE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "role":"admin",
    "author":"ops",
    "templateJson":{
      "reportType":"technical-report",
      "sections":[{"id":"sec-1","type":"body","title":"Body","blocks":[{"id":"b1","type":"text","content":"<p>{{cs|upper}}</p>","variables":["cs"],"placeholders":[],"metadata":{},"locked":false}],"metadata":{}}],
      "metadata":{},
      "variableBindings":{"cs":"header.cs"},
      "protectionRules":{"required_block_ids":[],"editable_placeholder_by_block":{}}
    }
  }'
```

### 4.3 Validate

```bash
curl -sS -X POST "$BACKEND/api/template-editor/templates/$TEMPLATE_ID/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "role":"admin",
    "templateJson":{
      "reportType":"technical-report",
      "sections":[{"id":"sec-1","type":"body","title":"Body","blocks":[{"id":"b1","type":"text","content":"<p>{{cs|upper}}</p>","variables":["cs"],"placeholders":[],"metadata":{},"locked":false}],"metadata":{}}],
      "metadata":{},
      "variableBindings":{"cs":"header.cs"},
      "protectionRules":{"required_block_ids":[],"editable_placeholder_by_block":{}}
    }
  }'
```

### 4.4 Preview

```bash
curl -sS -X POST "$BACKEND/api/template-editor/templates/$TEMPLATE_ID/preview" \
  -H "Content-Type: application/json" \
  -d '{"sampleData":{"cs":"ATE"}}'
```

Expected: response contains `"ATE"` in `previewHtml`.

### 4.5 Publish + idempotency

```bash
curl -sS -X POST "$BACKEND/api/template-editor/templates/$TEMPLATE_ID/publish" \
  -H "Content-Type: application/json" \
  -d '{"author":"ops"}'
```

Run publish again. Expected: no duplicate version for same draft content.

### 4.6 Rollback pointer

```bash
curl -sS -X POST "$BACKEND/api/template-editor/templates/$TEMPLATE_ID/rollback" \
  -H "Content-Type: application/json" \
  -d '{"author":"ops","targetVersion":1}'
```

Expected: `currentVersion` points to `1`.

### 4.7 Legacy compatibility

Check old endpoints:

```bash
curl -sS "$BACKEND/api/templates"
curl -sS "$BACKEND/api/templates/report.html"
```

Generate PDF with `templateName`:

1. If name exists in published Supabase templates -> uses compiled DB template.
2. If not found -> falls back to legacy local template behavior.

## 5) Go-live checklist

1. Migration applied and bucket created.
2. HF secrets configured.
3. Vercel `VITE_API_URL` set and redeployed.
4. Smoke test completed end-to-end.
5. Legacy `/api/templates` and `/api/generate-pdf` confirmed with no regressions.

## 6) Secret exposure response (mandatory)

If a `SUPABASE_SERVICE_ROLE_KEY` was shared in chat, logs, or screenshots:

1. Rotate the key immediately in Supabase:
   - Project Settings -> API -> Regenerate service role key.
2. Update Hugging Face Space Secret:
   - `SUPABASE_SERVICE_ROLE_KEY=<new-key>`.
3. Restart/redeploy backend service.
4. Re-run smoke test section 4.
5. Invalidate old CI/CD variables that referenced the previous key.

Never commit service role keys into git, `.env.production`, frontend vars, or issue trackers.
