-- =============================================================================
-- POS 3B — Archivo operativo (soft-archive ≥ 15 días)
-- Marca registros con archived_at; IE (cont_virtual_*) NO se toca.
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).
-- =============================================================================

-- Cortes / gastos (Virtual, Abarrotes, Garage)
alter table public.cortes_contabilidad_cierres
  add column if not exists archived_at timestamptz;
alter table public.cortes_contabilidad_cierres
  add column if not exists archived_by text;

alter table public.cortes_contabilidad_gastos
  add column if not exists archived_at timestamptz;
alter table public.cortes_contabilidad_gastos
  add column if not exists archived_by text;

-- Vales y préstamos
alter table public.vales
  add column if not exists archived_at timestamptz;
alter table public.vales
  add column if not exists archived_by text;

alter table public.prestamos
  add column if not exists archived_at timestamptz;
alter table public.prestamos
  add column if not exists archived_by text;

-- Pagarés
alter table public.pagares
  add column if not exists archived_at timestamptz;
alter table public.pagares
  add column if not exists archived_by text;

-- Nómina
alter table public.nomina_periodos
  add column if not exists archived_at timestamptz;
alter table public.nomina_periodos
  add column if not exists archived_by text;

-- Índices: activos en módulos operativos
create index if not exists idx_cierres_no_archivados
  on public.cortes_contabilidad_cierres (sucursal_id, modulo, created_at desc)
  where archived_at is null and deleted_at is null;

create index if not exists idx_gastos_no_archivados
  on public.cortes_contabilidad_gastos (sucursal_id, modulo, created_at desc)
  where archived_at is null;

create index if not exists idx_vales_no_archivados
  on public.vales (sucursal_id, fecha desc)
  where archived_at is null;

create index if not exists idx_prestamos_no_archivados
  on public.prestamos (sucursal_id, created_at desc)
  where archived_at is null;

create index if not exists idx_pagares_no_archivados
  on public.pagares (sucursal_id, created_at desc)
  where archived_at is null;

create index if not exists idx_nomina_periodos_no_archivados
  on public.nomina_periodos (sucursal_id, periodo_fin desc)
  where archived_at is null;

-- Índices de consulta en módulo Archivo
create index if not exists idx_cierres_archivados
  on public.cortes_contabilidad_cierres (sucursal_id, modulo, archived_at desc)
  where archived_at is not null;

create index if not exists idx_gastos_archivados
  on public.cortes_contabilidad_gastos (sucursal_id, modulo, archived_at desc)
  where archived_at is not null;

create index if not exists idx_vales_archivados
  on public.vales (sucursal_id, archived_at desc)
  where archived_at is not null;

create index if not exists idx_prestamos_archivados
  on public.prestamos (sucursal_id, archived_at desc)
  where archived_at is not null;

create index if not exists idx_pagares_archivados
  on public.pagares (sucursal_id, archived_at desc)
  where archived_at is not null;

create index if not exists idx_nomina_periodos_archivados
  on public.nomina_periodos (sucursal_id, archived_at desc)
  where archived_at is not null;
