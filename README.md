---
title: Stich 0752
emoji: 🚀
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# Stich 0752
Backend API deployed on Hugging Face Spaces using Docker.

## HF Space Secrets

Configure these as **Repository Secrets** in your Hugging Face Space settings
(`Settings → Repository secrets`). Never commit real values to the repository.

| Secret | Required | Description |
|---|---|---|
| `ENVIRONMENT` | No | `production` (default). Set to `dev` only for local testing. |
| `CORS_ORIGINS` | Yes | Comma-separated list of allowed frontend origins (e.g. `https://your-app.vercel.app`). |
| `SUPABASE_URL` | If using Template Editor | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | If using Template Editor | Supabase service role key (server-side only). |
| `TEMPLATE_STORAGE_BUCKET` | No | Supabase storage bucket name. Default: `template-assets`. |
| `FEATURE_TEMPLATE_EDITOR` | No | `true` to enable the Template Editor. Default: `false`. |
| `GHOSTSCRIPT_ENABLED` | No | `false` to disable Ghostscript PDF compression. Default: `true`. |
| `GHOSTSCRIPT_QUALITY` | No | Ghostscript quality: `screen`, `ebook`, `printer`, `prepress`. Default: `printer`. |
| `MISTRAL_API_KEY` | For OCR tool | API key for professional OCR extraction (PDF/image to TXT/DOCX). |
| `MISTRAL_API_BASE` | No | Mistral API base URL. Default: `https://api.mistral.ai`. |
| `MISTRAL_OCR_MODEL` | No | OCR model name. Default: `mistral-ocr-latest`. |
| `OCR_REQUEST_TIMEOUT_SECONDS` | No | OCR request timeout in seconds. Default: `180`. |
| `OCR_MAX_UPLOAD_MB` | No | Max upload size for OCR tool. Default: `25`. |

> For local development, copy `backend/.env.example` to `.env` in the project root.
