-- Crédito de fin de año en sucursales.
-- Libro propio: no toca ventas de ruta, créditos por pagar, recolección ni inventario del camión.
-- Ejecutar en Supabase → SQL Editor. Se puede volver a correr.

create table if not exists public.credito_fin_anio_cuentas (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  nombre text not null,
  notas text,
  estado text not null default 'abierta',
  created_by text,
  created_at timestamptz default now(),
  archived_at timestamptz
);

create table if not exists public.credito_fin_anio_mov (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null,
  tipo text not null,
  codigo text,
  nombre text not null,
  cantidad numeric(12,3) not null,
  precio numeric(12,2) not null default 0,
  importe numeric(12,2) not null default 0,
  notas text,
  created_by text,
  created_at timestamptz default now(),
  archived_at timestamptz
);

create table if not exists public.credito_fin_anio_abonos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null,
  monto numeric(12,2) not null,
  notas text,
  created_by text,
  created_at timestamptz default now(),
  archived_at timestamptz
);

create index if not exists idx_credito_fin_anio_cuentas_sucursal
  on public.credito_fin_anio_cuentas (sucursal_id, created_at desc);

create index if not exists idx_credito_fin_anio_mov_cuenta
  on public.credito_fin_anio_mov (cuenta_id, created_at desc);

create index if not exists idx_credito_fin_anio_abonos_cuenta
  on public.credito_fin_anio_abonos (cuenta_id, created_at desc);

alter table public.credito_fin_anio_cuentas enable row level security;
alter table public.credito_fin_anio_mov enable row level security;
alter table public.credito_fin_anio_abonos enable row level security;

drop policy if exists "credito_fin_anio_cuentas_anon_rw" on public.credito_fin_anio_cuentas;
create policy "credito_fin_anio_cuentas_anon_rw" on public.credito_fin_anio_cuentas
  for all using (true) with check (true);

drop policy if exists "credito_fin_anio_mov_anon_rw" on public.credito_fin_anio_mov;
create policy "credito_fin_anio_mov_anon_rw" on public.credito_fin_anio_mov
  for all using (true) with check (true);

drop policy if exists "credito_fin_anio_abonos_anon_rw" on public.credito_fin_anio_abonos;
create policy "credito_fin_anio_abonos_anon_rw" on public.credito_fin_anio_abonos
  for all using (true) with check (true);
