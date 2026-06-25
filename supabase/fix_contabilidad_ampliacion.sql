-- =============================================================================
-- POS 3B — Ampliación contabilidad (ejecutar después de fix_contabilidad.sql)
-- =============================================================================

alter table public.usuarios add column if not exists nomina_pagador text
  check (nomina_pagador is null or nomina_pagador in ('virtual', 'abarrotes', 'garage'));

alter table public.nomina_periodos add column if not exists pagador_filtro text;
alter table public.nomina_lineas add column if not exists pagador_nomina text;
alter table public.nomina_lineas add column if not exists deduccion_gastos numeric(12,2) default 0;

alter table public.vales add column if not exists tipo text default 'indirecto';
alter table public.vales add column if not exists area text;
alter table public.vales add column if not exists folio text;
alter table public.vales add column if not exists requiere_autorizacion boolean default false;
alter table public.vales add column if not exists autorizado_por text;

alter table public.cortes_contabilidad_gastos add column if not exists descontado_nomina boolean default false;
alter table public.cortes_contabilidad_gastos add column if not exists periodo_nomina_id uuid;

create table if not exists public.prestamos_interarea (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  origen text not null check (origen in ('virtual', 'abarrotes', 'garage')),
  destino text not null check (destino in ('virtual', 'abarrotes', 'garage')),
  monto numeric(12,2) not null default 0,
  fecha date default current_date,
  notas text,
  estado text default 'activo',
  created_at timestamptz default now(),
  created_by text
);

create table if not exists public.cortes_gasto_catalogo (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  categoria text not null,
  subcategorias jsonb default '[]'::jsonb,
  unique (sucursal_id, modulo, categoria)
);

alter table public.prestamos_interarea enable row level security;
alter table public.cortes_gasto_catalogo enable row level security;

drop policy if exists "prestamos_interarea_anon_rw" on public.prestamos_interarea;
create policy "prestamos_interarea_anon_rw" on public.prestamos_interarea for all using (true) with check (true);

drop policy if exists "cortes_catalogo_anon_rw" on public.cortes_gasto_catalogo;
create policy "cortes_catalogo_anon_rw" on public.cortes_gasto_catalogo for all using (true) with check (true);
