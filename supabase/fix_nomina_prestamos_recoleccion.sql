-- =============================================================================
-- POS 3B — Nómina: deducción préstamos + match consumos por nombre
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.nomina_lineas add column if not exists deduccion_prestamos numeric(12,2) default 0;

alter table public.cortes_contabilidad_gastos add column if not exists descontado_nomina boolean default false;
alter table public.cortes_contabilidad_gastos add column if not exists periodo_nomina_id uuid;
