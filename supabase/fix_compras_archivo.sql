-- =============================================================================
-- POS 3B — Archivo de historial de Compras / recepciones (≥ 8 días)
-- Soft-archive con archived_at; el módulo Compras solo muestra no archivados.
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).
-- =============================================================================

alter table public.compras
  add column if not exists archived_at timestamptz;
alter table public.compras
  add column if not exists archived_by text;

create index if not exists idx_compras_no_archivadas
  on public.compras (sucursal_id, created_at desc)
  where archived_at is null;

create index if not exists idx_compras_archivadas
  on public.compras (sucursal_id, archived_at desc)
  where archived_at is not null;
