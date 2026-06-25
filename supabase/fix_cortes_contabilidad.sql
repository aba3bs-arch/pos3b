-- =============================================================================
-- POS 3B — Cortes de contabilidad (Virtual, Abarrotes, Garage)
-- Independientes del Corte de caja del POS. Seguro re-ejecutar.
-- =============================================================================

create table if not exists public.cortes_contabilidad_estado (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  estado jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique (sucursal_id, modulo)
);

create table if not exists public.cortes_contabilidad_gastos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  categoria text not null default 'GENERAL',
  subcategoria text default '',
  comentario text,
  monto numeric(12,2) not null default 0,
  usuario_id text,
  usuario_nombre text,
  cerrado boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_cortes_gastos_mod on public.cortes_contabilidad_gastos (sucursal_id, modulo, cerrado);

create table if not exists public.cortes_contabilidad_cierres (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  folio text,
  turno text,
  usuario_id text,
  usuario_nombre text,
  caja_actual numeric(14,2) default 0,
  ventas numeric(14,2) default 0,
  detalle jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_cortes_cierres_mod on public.cortes_contabilidad_cierres (sucursal_id, modulo, created_at desc);

create table if not exists public.cortes_contabilidad_folios (
  sucursal_id text not null default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  ultimo int not null default 0,
  prefijo text not null default 'X',
  primary key (sucursal_id, modulo)
);

alter table public.cortes_contabilidad_estado enable row level security;
alter table public.cortes_contabilidad_gastos enable row level security;
alter table public.cortes_contabilidad_cierres enable row level security;
alter table public.cortes_contabilidad_folios enable row level security;

drop policy if exists "cortes_estado_anon_rw" on public.cortes_contabilidad_estado;
create policy "cortes_estado_anon_rw" on public.cortes_contabilidad_estado for all using (true) with check (true);

drop policy if exists "cortes_gastos_anon_rw" on public.cortes_contabilidad_gastos;
create policy "cortes_gastos_anon_rw" on public.cortes_contabilidad_gastos for all using (true) with check (true);

drop policy if exists "cortes_cierres_anon_rw" on public.cortes_contabilidad_cierres;
create policy "cortes_cierres_anon_rw" on public.cortes_contabilidad_cierres for all using (true) with check (true);

drop policy if exists "cortes_folios_anon_rw" on public.cortes_contabilidad_folios;
create policy "cortes_folios_anon_rw" on public.cortes_contabilidad_folios for all using (true) with check (true);
