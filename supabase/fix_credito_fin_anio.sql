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

-- Recibo del inventario enviado a Compras. El mismo folio se ve en Compras → Por recibir.
create table if not exists public.credito_fin_anio_recibos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null,
  sucursal_id text not null,
  compra_id uuid,
  folio text not null,
  total numeric(12,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz default now(),
  archived_at timestamptz
);

create index if not exists idx_credito_fin_anio_recibos_cuenta
  on public.credito_fin_anio_recibos (cuenta_id, created_at desc);

alter table public.credito_fin_anio_recibos enable row level security;

drop policy if exists "credito_fin_anio_recibos_anon_rw" on public.credito_fin_anio_recibos;
create policy "credito_fin_anio_recibos_anon_rw" on public.credito_fin_anio_recibos
  for all using (true) with check (true);

-- Cada vez que se liquida: cuánto se cobró, qué quedó pendiente y en qué tiendas.
create table if not exists public.credito_fin_anio_liquidaciones (
  id uuid primary key default gen_random_uuid(),
  monto numeric(12,2) not null,
  pendiente numeric(12,2) not null default 0,
  total_antes numeric(12,2) not null default 0,
  detalle jsonb not null default '[]'::jsonb,
  estado text not null default 'abierta',
  created_by text,
  created_at timestamptz default now(),
  archived_at timestamptz
);

alter table public.credito_fin_anio_liquidaciones
  add column if not exists estado text;

update public.credito_fin_anio_liquidaciones
  set estado = 'cerrada'
  where estado is null;

alter table public.credito_fin_anio_liquidaciones
  alter column estado set default 'abierta';

alter table public.credito_fin_anio_abonos
  add column if not exists sucursal_id text;

alter table public.credito_fin_anio_abonos
  add column if not exists liquidacion_id uuid;

create index if not exists idx_credito_fin_anio_liquidaciones_fecha
  on public.credito_fin_anio_liquidaciones (created_at desc);

alter table public.credito_fin_anio_liquidaciones enable row level security;

drop policy if exists "credito_fin_anio_liquidaciones_anon_rw" on public.credito_fin_anio_liquidaciones;
create policy "credito_fin_anio_liquidaciones_anon_rw" on public.credito_fin_anio_liquidaciones
  for all using (true) with check (true);

-- El cajero pide el abono. No se registra ni el abono ni el gasto hasta que
-- el repartidor lo aprueba con su PIN.
create table if not exists public.credito_fin_anio_abono_solicitudes (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null,
  sucursal_id text not null,
  monto numeric(12,2) not null check (monto > 0),
  notas text,
  cajero_id text,
  cajero_nombre text,
  repartidor_id text not null,
  repartidor_nombre text,
  repartidor_aliases text[] not null default '{}',
  estado text not null default 'pendiente',
  motivo text,
  resuelta_por text,
  resuelta_at timestamptz,
  aplicada_at timestamptz,
  abono_id uuid,
  created_at timestamptz default now(),
  archived_at timestamptz
);

create index if not exists idx_credito_fin_anio_abono_sol_estado
  on public.credito_fin_anio_abono_solicitudes (estado, created_at desc);

create index if not exists idx_credito_fin_anio_abono_sol_aliases
  on public.credito_fin_anio_abono_solicitudes using gin (repartidor_aliases);

alter table public.credito_fin_anio_abono_solicitudes enable row level security;

drop policy if exists "credito_fin_anio_abono_sol_anon_rw" on public.credito_fin_anio_abono_solicitudes;
create policy "credito_fin_anio_abono_sol_anon_rw" on public.credito_fin_anio_abono_solicitudes
  for all using (true) with check (true);
