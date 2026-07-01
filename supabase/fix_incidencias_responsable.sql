-- =============================================================================
-- POS 3B — Responsable en incidencias + redirección
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.pos_incidencias add column if not exists responsable text;
alter table public.pos_incidencias add column if not exists redirigido_por text;
alter table public.pos_incidencias add column if not exists redirigido_at timestamptz;

create index if not exists idx_pos_incidencias_responsable on public.pos_incidencias (responsable, estado);
