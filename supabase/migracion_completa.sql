-- =============================================================================
-- POS 3B — Migración completa para Supabase (SQL Editor → Run)
-- Ejecutar en orden. Seguro re-ejecutar (IF NOT EXISTS / IF NOT EXISTS column).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USUARIOS (login PIN) — obligatoria, NO está en schema.sql original
-- -----------------------------------------------------------------------------
create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  pin text not null,
  rol text not null default 'Cajero',
  sucursal_id text not null default 'MAIN',
  created_at timestamptz default now()
);

create unique index if not exists idx_usuarios_sucursal_pin on public.usuarios (sucursal_id, pin);
create index if not exists idx_usuarios_sucursal on public.usuarios (sucursal_id);

alter table public.usuarios add column if not exists sucursal_id text default 'MAIN';
update public.usuarios set sucursal_id = 'MAIN' where sucursal_id is null or trim(sucursal_id) = '';

alter table public.usuarios enable row level security;
drop policy if exists "usuarios_anon_rw" on public.usuarios;
create policy "usuarios_anon_rw" on public.usuarios for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 2. PRODUCTOS — catálogo e inventario
-- -----------------------------------------------------------------------------
create table if not exists public.productos (
  id text primary key,
  nombre text not null,
  precio numeric(12,2) default 0,
  stock integer default 0,
  cat text default 'GENERAL',
  created_at timestamptz default now()
);

alter table public.productos add column if not exists stock_minimo integer default 6;
alter table public.productos add column if not exists descripcion text;
alter table public.productos add column if not exists foto_url text;
alter table public.productos add column if not exists clave_sat text;
alter table public.productos add column if not exists impuesto numeric(5,2) default 16;
alter table public.productos add column if not exists precio_compra_sin numeric(12,2) default 0;
alter table public.productos add column if not exists precio_compra_con numeric(12,2) default 0;
alter table public.productos add column if not exists ganancia_pct numeric(8,2) default 0;
alter table public.productos add column if not exists precio_venta_sin numeric(12,2) default 0;
alter table public.productos add column if not exists en_venta boolean default true;
alter table public.productos add column if not exists en_favoritos boolean default false;

alter table public.productos enable row level security;
drop policy if exists "productos_anon_rw" on public.productos;
create policy "productos_anon_rw" on public.productos for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 3. VENTAS
-- -----------------------------------------------------------------------------
create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  vendedor text,
  sucursal_id text,
  total numeric(12,2),
  metodo_pago text,
  articulos jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.ventas add column if not exists created_at timestamptz default now();
update public.ventas set created_at = now() where created_at is null;

alter table public.ventas enable row level security;
drop policy if exists "ventas_anon_rw" on public.ventas;
create policy "ventas_anon_rw" on public.ventas for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 4. LOGINS (entrada al sistema)
-- -----------------------------------------------------------------------------
create table if not exists public.logins (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id) on delete set null,
  nombre text,
  sucursal text,
  evento text,
  created_at timestamptz default now()
);

alter table public.logins enable row level security;
drop policy if exists "logins_anon_rw" on public.logins;
create policy "logins_anon_rw" on public.logins for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 5. CLIENTES
-- -----------------------------------------------------------------------------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  email text,
  rfc text,
  notas text,
  created_at timestamptz default now()
);

alter table public.clientes add column if not exists email text;
alter table public.clientes add column if not exists telefono text;
alter table public.clientes add column if not exists rfc text;
alter table public.clientes add column if not exists notas text;

alter table public.clientes enable row level security;
drop policy if exists "clientes_anon_rw" on public.clientes;
create policy "clientes_anon_rw" on public.clientes for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 6. PROVEEDORES
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 7. COMPRAS (pedido / recepción)
-- -----------------------------------------------------------------------------
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

alter table public.compras add column if not exists items jsonb default '[]'::jsonb;
alter table public.compras add column if not exists items_pedido jsonb default '[]'::jsonb;
alter table public.compras add column if not exists estado text default 'recibida';
alter table public.compras add column if not exists created_at timestamptz default now();

update public.compras set items = '[]'::jsonb where items is null;
update public.compras set items_pedido = '[]'::jsonb where items_pedido is null;
update public.compras set estado = coalesce(nullif(trim(estado), ''), 'recibida') where estado is null or trim(estado) = '';

alter table public.compras enable row level security;
drop policy if exists "compras_anon_rw" on public.compras;
create policy "compras_anon_rw" on public.compras for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 8. PROVEEDOR ↔ PRODUCTO
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 9. ASISTENCIAS (reloj checador)
-- -----------------------------------------------------------------------------
create table if not exists public.asistencias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id) on delete set null,
  nombre text not null,
  sucursal_id text not null,
  tipo text not null check (tipo in ('ENTRADA', 'SALIDA')),
  created_at timestamptz default now()
);

create index if not exists idx_asistencias_sucursal_creado on public.asistencias (sucursal_id, created_at desc);

alter table public.asistencias enable row level security;
drop policy if exists "asistencias_anon_rw" on public.asistencias;
create policy "asistencias_anon_rw" on public.asistencias for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 10. CORTES DE CAJA
-- -----------------------------------------------------------------------------
create table if not exists public.cortes_caja (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  usuario text,
  usuario_id uuid references public.usuarios(id) on delete set null,
  fecha date not null default (now() at time zone 'utc')::date,
  total_ventas numeric(12,2) default 0,
  tickets integer default 0,
  efectivo_esperado numeric(12,2) default 0,
  efectivo_contado numeric(12,2) default 0,
  diferencia numeric(12,2) default 0,
  electronico numeric(12,2) default 0,
  grupos jsonb default '{}'::jsonb,
  detalle_metodos jsonb default '[]'::jsonb,
  notas text,
  created_at timestamptz default now()
);

create index if not exists idx_cortes_sucursal_fecha on public.cortes_caja (sucursal_id, fecha desc);
create index if not exists idx_cortes_created on public.cortes_caja (created_at desc);

alter table public.cortes_caja enable row level security;
drop policy if exists "cortes_caja_anon_rw" on public.cortes_caja;
create policy "cortes_caja_anon_rw" on public.cortes_caja for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- OPCIONAL (movimientos inventario en nube):
-- -----------------------------------------------------------------------------
--   id uuid primary key default gen_random_uuid(),
--   sucursal_id text,
--   usuario text,
--   tipo text not null,
--   producto_id text,
--   producto_nombre text,
--   producto_destino_id text,
--   cantidad integer not null,
--   stock_antes integer,
--   stock_despues integer,
--   motivo text,
--   departamento text,
--   created_at timestamptz default now()
-- );
