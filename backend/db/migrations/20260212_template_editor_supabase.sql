-- Template Editor persistence schema (Supabase Postgres)
-- Safe to run multiple times in dev/staging.

create extension if not exists pgcrypto;

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  report_type text not null check (report_type in ('technical_report', 'ficha_tecnica', 'generic')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  current_version int not null default 0,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name, report_type)
);

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  version_number int not null,
  schema_version int not null default 1,
  editor_json_path text not null,
  compiled_html_path text not null,
  checksum text,
  change_note text,
  published_at timestamptz null,
  created_by text,
  created_at timestamptz not null default now(),
  unique(template_id, version_number)
);

create index if not exists idx_template_versions_template_id
  on public.template_versions(template_id);

create index if not exists idx_templates_report_type_status
  on public.templates(report_type, status);
