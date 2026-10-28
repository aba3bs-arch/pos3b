-- =============================================================================
-- POS 3B — Venta en Ruta · Créditos por pagar con aprobación del vendedor
-- Cuando el cajero cobra un crédito, el vendedor de ruta (quien lo recolectará)
-- recibe una solicitud y debe aprobarla con su PIN. Hasta entonces no se registra
-- ni gasto, ni tránsito, ni abono.
-- Ejecutar en Supabase → SQL Editor (seguro volver a ejecutar).
-- Requiere antes: fix_tabla_creditos.sql y fix_ruta_cxc_pagos_atomicos.sql.
-- =============================================================================

create table if not exists public.ruta_cxc_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null unique default gen_random_uuid(),
  sucursal_id text not null,
  tienda text,
  movimiento_ids jsonb not null default '[]'::jsonb,
  folios jsonb not null default '[]'::jsonb,
  monto numeric(12,2) not null check (monto > 0),
  total_folios numeric(12,2) not null default 0,
  parcial boolean not null default false,
  cajero_id text,
  cajero_nombre text not null,
  vendedor_ref text,
  vendedor_nombre text,
  vendedor_aliases text[] not null default '{}',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  motivo text,
  resuelta_por text,
  resuelta_at timestamptz,
  aplicada_at timestamptz,
  resultado jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ruta_cxc_aprob_estado
  on public.ruta_cxc_aprobaciones (estado, created_at desc);
create index if not exists idx_ruta_cxc_aprob_sucursal
  on public.ruta_cxc_aprobaciones (sucursal_id, created_at desc);
create index if not exists idx_ruta_cxc_aprob_aliases
  on public.ruta_cxc_aprobaciones using gin (vendedor_aliases);

alter table public.ruta_cxc_aprobaciones enable row level security;
drop policy if exists ruta_cxc_aprob_acceso on public.ruta_cxc_aprobaciones;
create policy ruta_cxc_aprob_acceso on public.ruta_cxc_aprobaciones
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update on public.ruta_cxc_aprobaciones to anon, authenticated;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  raise notice 'reload schema: %', sqlerrm;
end $$;

select n.nspname as schema, c.relname as tabla
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname = 'ruta_cxc_aprobaciones';
