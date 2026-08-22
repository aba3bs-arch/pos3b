-- =============================================================================
-- POS 3B — Préstamos a usuarios MAIN: sin corte, solo nómina ($500/sem)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.prestamos
  add column if not exists omitir_corte boolean default false;

comment on column public.prestamos.omitir_corte is
  'Si true: préstamo de admin a usuario MAIN/indirecto; no carga a corte, sí descuenta en nómina ($500/sem).';
