-- Tablas del cobro de créditos (FUSION y el resto de las tiendas).
-- Pega este archivo en Supabase → SQL Editor → Run.
-- La última consulta debe mostrar 3 filas. Si salen, en Table Editor
-- elige el schema public y recarga: transito_efectivo, ruta_cxc_movimientos
-- y ruta_cxc_pagos_solicitudes.
-- Seguro de repetir. No borra datos.

create table if not exists public.ruta_cxc_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_tipo text not null,
  cliente_id text not null,
  cliente_nombre text,
  tipo text not null,
  monto numeric(12,2) not null check (monto > 0),
  saldo_despues numeric(12,2) not null default 0,
  venta_id text,
  carga_id text,
  metodo_pago text,
  notas text,
  usuario_nombre text,
  created_at timestamptz default now()
);

alter table public.ruta_cxc_movimientos add column if not exists carga_id text;
alter table public.ruta_cxc_movimientos add column if not exists estatus text default 'pendiente';
alter table public.ruta_cxc_movimientos add column if not exists pagado_por text;
alter table public.ruta_cxc_movimientos add column if not exists pagado_at timestamptz;
alter table public.ruta_cxc_movimientos add column if not exists gasto_id uuid;
alter table public.ruta_cxc_movimientos add column if not exists folio_venta text;
alter table public.ruta_cxc_movimientos add column if not exists cargo_id uuid;

create table if not exists public.ruta_cxc_pagos_solicitudes (
  id uuid primary key,
  entrada jsonb not null,
  resultado jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.repartidores (
  id varchar(50) primary key,
  nombre varchar(100) not null,
  pin varchar(4),
  activo boolean default true
);

create table if not exists public.transito_efectivo (
  id uuid primary key default gen_random_uuid(),
  fecha_hora timestamptz default now(),
  sucursal_origen varchar(50) not null,
  repartidor_id varchar(50),
  cajero_nombre varchar(100) not null,
  monto numeric(10,2) not null check (monto > 0),
  num_traspaso varchar(50),
  foto_url text,
  estatus varchar(30) default 'En Tránsito',
  tipo_movimiento varchar(50),
  descripcion_gasto varchar(200),
  fecha_liquidacion timestamptz,
  usuario_liquida varchar(100)
);

alter table public.transito_efectivo add column if not exists fecha_hora timestamptz default now();
alter table public.transito_efectivo add column if not exists sucursal_origen varchar(50);
alter table public.transito_efectivo add column if not exists repartidor_id varchar(50);
alter table public.transito_efectivo add column if not exists cajero_nombre varchar(100);
alter table public.transito_efectivo add column if not exists monto numeric(10,2);
alter table public.transito_efectivo add column if not exists num_traspaso varchar(50);
alter table public.transito_efectivo add column if not exists tipo_movimiento varchar(50);
alter table public.transito_efectivo add column if not exists descripcion_gasto varchar(200);
alter table public.transito_efectivo add column if not exists fecha_liquidacion timestamptz;
alter table public.transito_efectivo add column if not exists usuario_liquida varchar(100);
alter table public.transito_efectivo add column if not exists foto_url text;
alter table public.transito_efectivo add column if not exists evidencia_url text;
alter table public.transito_efectivo add column if not exists estatus varchar(30) default 'En Tránsito';

-- Permisos aparte: si un rol no existe, la tabla igual se queda creada.
do $$
begin
  execute 'grant select, insert, update, delete on public.transito_efectivo to anon, authenticated';
  execute 'grant select, insert, update, delete on public.ruta_cxc_movimientos to anon, authenticated';
  execute 'grant select, insert, update, delete on public.ruta_cxc_pagos_solicitudes to anon, authenticated';
exception when others then
  raise notice 'permisos anon: %', sqlerrm;
end $$;

do $$
begin
  execute 'grant select, insert, update, delete on public.transito_efectivo to service_role';
  execute 'grant select, insert, update, delete on public.ruta_cxc_movimientos to service_role';
  execute 'grant select, insert, update, delete on public.ruta_cxc_pagos_solicitudes to service_role';
exception when others then
  raise notice 'permisos service_role: %', sqlerrm;
end $$;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  raise notice 'reload schema: %', sqlerrm;
end $$;

-- Resultado visible en el SQL Editor. Deben salir estas 3 tablas.
select n.nspname as schema, c.relname as tabla
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('transito_efectivo', 'ruta_cxc_movimientos', 'ruta_cxc_pagos_solicitudes')
order by c.relname;
