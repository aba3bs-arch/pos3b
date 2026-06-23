-- =============================================================================
-- POS 3B — Reparar columnas faltantes en TODAS las tablas usadas por la app
-- Supabase → SQL Editor → pegar todo → Run → esperar ~30 s → F5 en la app
-- Seguro re-ejecutar (IF NOT EXISTS).
-- =============================================================================

-- --- PRODUCTOS (formulario completo + ventas) ---
create table if not exists public.productos (
  id text primary key,
  nombre text not null,
  descripcion text,
  foto_url text,
  cat text default 'GENERAL',
  clave_sat text,
  impuesto numeric(5,2) default 16,
  precio_compra_sin numeric(12,2) default 0,
  precio_compra_con numeric(12,2) default 0,
  ganancia_pct numeric(8,2) default 0,
  precio_venta_sin numeric(12,2) default 0,
  precio numeric(12,2) default 0,
  stock integer default 0,
  stock_minimo integer default 6,
  en_venta boolean default true,
  en_favoritos boolean default false,
  created_at timestamptz default now()
);

alter table public.productos add column if not exists cat text default 'GENERAL';
alter table public.productos add column if not exists descripcion text;
alter table public.productos add column if not exists foto_url text;
alter table public.productos add column if not exists clave_sat text;
alter table public.productos add column if not exists impuesto numeric(5,2) default 16;
alter table public.productos add column if not exists precio_compra_sin numeric(12,2) default 0;
alter table public.productos add column if not exists precio_compra_con numeric(12,2) default 0;
alter table public.productos add column if not exists ganancia_pct numeric(8,2) default 0;
alter table public.productos add column if not exists precio_venta_sin numeric(12,2) default 0;
alter table public.productos add column if not exists stock_minimo integer default 6;
alter table public.productos add column if not exists en_venta boolean default true;
alter table public.productos add column if not exists en_favoritos boolean default false;
alter table public.productos add column if not exists created_at timestamptz default now();

update public.productos set impuesto = 16 where impuesto is null;
update public.productos set en_venta = true where en_venta is null;
update public.productos set en_favoritos = false where en_favoritos is null;
update public.productos set stock_minimo = 6 where stock_minimo is null;
update public.productos set cat = 'GENERAL' where cat is null or trim(cat) = '';

-- Columna legacy "costo" (esquemas antiguos): rellenar y valor por defecto
alter table public.productos add column if not exists costo numeric(12,2) default 0;
update public.productos
set costo = coalesce(
  nullif(precio_compra_con, 0),
  nullif(precio_compra_sin, 0),
  nullif(precio, 0),
  0
)
where costo is null;
update public.productos set costo = 0 where costo is null;
alter table public.productos alter column costo set default 0;

alter table public.productos enable row level security;
drop policy if exists "productos_anon_rw" on public.productos;
create policy "productos_anon_rw" on public.productos for all using (true) with check (true);

-- --- USUARIOS (sucursal + turnos) ---
alter table public.usuarios add column if not exists sucursal_id text default 'MAIN';
update public.usuarios set sucursal_id = 'MAIN' where sucursal_id is null or trim(sucursal_id) = '';
alter table public.usuarios add column if not exists turno_id text;
alter table public.usuarios add column if not exists turno_horario jsonb;

comment on column public.usuarios.turno_id is 'Turno fijo diurno/nocturno; solo administrador lo cambia.';
comment on column public.usuarios.turno_horario is 'Horario por día (jsonb); solo administrador lo cambia.';

-- Roles permitidos (Cajero, Auditor, Repartidor, Supervisor, Gerente, Administrador)
update public.usuarios set rol = 'Cajero' where lower(trim(rol)) in ('cajero');
update public.usuarios set rol = 'Auditor' where lower(trim(rol)) in ('auditor');
update public.usuarios set rol = 'Repartidor' where lower(trim(rol)) in ('repartidor');
update public.usuarios set rol = 'Supervisor' where lower(trim(rol)) in ('supervisor');
update public.usuarios set rol = 'Gerente' where lower(trim(rol)) in ('gerente');
update public.usuarios set rol = 'Administrador' where lower(trim(rol)) in ('administrador', 'admin');
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol in ('Cajero', 'Auditor', 'Repartidor', 'Supervisor', 'Gerente', 'Administrador'));

-- --- LOGINS (auditoría de acceso) ---
alter table public.logins add column if not exists created_at timestamptz default now();
alter table public.logins add column if not exists turno_id text;
alter table public.logins add column if not exists evento text default 'ENTRADA';
update public.logins set created_at = now() where created_at is null;

-- --- VENTAS (cada cobro ligado al turno activo) ---
alter table public.ventas add column if not exists turno_id text;
alter table public.ventas add column if not exists turno_nombre text;
alter table public.ventas add column if not exists usuario_id uuid;

create index if not exists idx_ventas_turno_fecha on public.ventas (sucursal_id, turno_id, created_at desc);

-- --- VENTAS created_at ---
alter table public.ventas add column if not exists created_at timestamptz default now();
update public.ventas set created_at = now() where created_at is null;

-- --- COMPRAS (pedido + recepción) ---
create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  sucursal_id text,
  fecha date default (now() at time zone 'utc')::date,
  total numeric(12,2) default 0,
  notas text,
  items jsonb default '[]'::jsonb,
  items_pedido jsonb default '[]'::jsonb,
  estado text default 'recibida',
  created_at timestamptz default now()
);

alter table public.compras add column if not exists proveedor_id uuid;
alter table public.compras add column if not exists sucursal_id text;
alter table public.compras add column if not exists fecha date default (now() at time zone 'utc')::date;
alter table public.compras add column if not exists total numeric(12,2) default 0;
alter table public.compras add column if not exists notas text;
alter table public.compras add column if not exists items jsonb default '[]'::jsonb;
alter table public.compras add column if not exists items_pedido jsonb default '[]'::jsonb;
alter table public.compras add column if not exists estado text default 'recibida';
alter table public.compras add column if not exists created_at timestamptz default now();

update public.compras set items = '[]'::jsonb where items is null;
update public.compras set items_pedido = '[]'::jsonb where items_pedido is null;
update public.compras set total = 0 where total is null;
update public.compras set estado = 'recibida' where estado is null or trim(estado) = '';
update public.compras set created_at = now() where created_at is null;

alter table public.compras enable row level security;
drop policy if exists "compras_anon_rw" on public.compras;
create policy "compras_anon_rw" on public.compras for all using (true) with check (true);

-- --- PROVEEDORES ---
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto text,
  telefono text,
  email text,
  notas text,
  created_at timestamptz default now()
);

alter table public.proveedores enable row level security;
drop policy if exists "proveedores_anon_rw" on public.proveedores;
create policy "proveedores_anon_rw" on public.proveedores for all using (true) with check (true);

create table if not exists public.proveedor_producto (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  producto_id text not null,
  sku_proveedor text,
  created_at timestamptz default now(),
  unique (proveedor_id, producto_id)
);

create index if not exists idx_pp_proveedor on public.proveedor_producto(proveedor_id);
create index if not exists idx_pp_producto on public.proveedor_producto(producto_id);

alter table public.proveedor_producto enable row level security;
drop policy if exists "proveedor_producto_anon_rw" on public.proveedor_producto;
create policy "proveedor_producto_anon_rw" on public.proveedor_producto for all using (true) with check (true);

-- --- CORTES DE CAJA ---
alter table public.cortes_caja add column if not exists turno_id text;
alter table public.cortes_caja add column if not exists turno_nombre text;

create unique index if not exists idx_cortes_sucursal_fecha_turno
  on public.cortes_caja (sucursal_id, fecha, turno_id)
  where turno_id is not null and trim(turno_id) <> '';

-- --- CANCELACIONES ---
create table if not exists public.cancelaciones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references public.ventas(id) on delete set null,
  sucursal_id text not null,
  usuario text,
  metodo_pago text,
  articulos jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  motivo text,
  created_at timestamptz default now()
);

alter table public.cancelaciones enable row level security;
drop policy if exists "cancelaciones_anon_rw" on public.cancelaciones;
create policy "cancelaciones_anon_rw" on public.cancelaciones for all using (true) with check (true);

-- Verificación rápida (opcional):
-- select table_name, column_name from information_schema.columns
-- where table_schema = 'public' and table_name in ('productos','compras','ventas','usuarios')
-- order by table_name, ordinal_position;
