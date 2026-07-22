-- =============================================================================
-- POS 3B — Préstamos entre sucursales
-- No se cargan al corte; quedan pendientes de cobro hasta liquidarse en la tienda origen.
-- =============================================================================

create table if not exists public.prestamos_sucursales (
  id uuid primary key default gen_random_uuid(),
  sucursal_origen text not null,
  sucursal_destino text not null,
  monto numeric(12,2) not null default 0,
  saldo numeric(12,2) not null default 0,
  abono numeric(12,2) default 0,
  fecha date default current_date,
  notas text,
  estado text not null default 'pendiente_cobro'
    check (estado in ('pendiente_cobro', 'liquidado', 'cancelado')),
  created_at timestamptz default now(),
  created_by text,
  constraint prestamos_sucursales_origen_destino_diff check (sucursal_origen <> sucursal_destino)
);

create index if not exists idx_prestamos_sucursales_origen
  on public.prestamos_sucursales (sucursal_origen, estado);

create index if not exists idx_prestamos_sucursales_destino
  on public.prestamos_sucursales (sucursal_destino, estado);

alter table public.prestamos_sucursales enable row level security;

drop policy if exists "prestamos_sucursales_anon_rw" on public.prestamos_sucursales;
create policy "prestamos_sucursales_anon_rw" on public.prestamos_sucursales
  for all using (true) with check (true);
