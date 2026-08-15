-- =============================================================================
-- POS 3B — Soft-delete de cierres de cortes contabilidad (papelera / restaurar)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).
-- =============================================================================

alter table public.cortes_contabilidad_cierres
  add column if not exists deleted_at timestamptz;

alter table public.cortes_contabilidad_cierres
  add column if not exists deleted_by text;

create index if not exists idx_cortes_cierres_activos
  on public.cortes_contabilidad_cierres (sucursal_id, modulo, created_at desc)
  where deleted_at is null;

create index if not exists idx_cortes_cierres_eliminados
  on public.cortes_contabilidad_cierres (sucursal_id, modulo, deleted_at desc)
  where deleted_at is not null;
