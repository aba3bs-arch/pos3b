-- =============================================================================
-- POS 3B — Consumos en cortes requieren aprobación del administrador
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.cortes_contabilidad_gastos add column if not exists estado_aprobacion text default 'aprobado';
alter table public.cortes_contabilidad_gastos add column if not exists aprobado_por text;
alter table public.cortes_contabilidad_gastos add column if not exists aprobado_at timestamptz;
alter table public.cortes_contabilidad_gastos add column if not exists solicitado_por text;

-- Gastos históricos sin estado se consideran aprobados.
update public.cortes_contabilidad_gastos
set estado_aprobacion = 'aprobado'
where estado_aprobacion is null;

create index if not exists idx_cortes_gastos_aprobacion on public.cortes_contabilidad_gastos (estado_aprobacion, cerrado);
