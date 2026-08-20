-- =============================================================================
-- POS 3B — Venta en Ruta / CEDIS Ruta (aislado de MAIN)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
--
-- Alternativa (recomendado): un solo script con Auto Fin + Venta en Ruta:
--   supabase/fix_autofin_y_venta_ruta_completo.sql
-- También necesitas: fix_precio_ruta_y_cxc.sql y fix_venta_ruta_pos_v2.sql
-- =============================================================================

-- Stock del almacén CEDIS Ruta (NO toca stock_sucursales / MAIN.cedis)
create table if not exists public.cedis_ruta_stock (
  producto_id text primary key,
  cantidad numeric(14,3) not null default 0 check (cantidad >= 0),
  updated_at timestamptz default now()
);

create table if not exists public.cedis_ruta_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id text not null,
  tipo text not null, -- ingreso | retiro | carga | devolucion_carga | ajuste
  cantidad numeric(14,3) not null,
  stock_antes numeric(14,3),
  stock_despues numeric(14,3),
  ref_tabla text,
  ref_id text,
  nota text,
  usuario_nombre text,
  created_at timestamptz default now()
);
create index if not exists idx_cedis_ruta_mov_fecha on public.cedis_ruta_movimientos (created_at desc);
create index if not exists idx_cedis_ruta_mov_prod on public.cedis_ruta_movimientos (producto_id, created_at desc);

-- Clientes externos de ruta
create table if not exists public.ruta_clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  telefono text,
  credito_limite numeric(12,2) default 0,
  activo boolean default true,
  notas text,
  created_at timestamptz default now()
);

-- Cargas de camión
create table if not exists public.ruta_cargas (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  vendedor_id text,
  vendedor_nombre text,
  fecha date not null default current_date,
  estado text not null default 'armada', -- armada | en_ruta | liquidada | cancelada
  notas text,
  created_at timestamptz default now(),
  liquidada_at timestamptz
);
create unique index if not exists idx_ruta_cargas_folio on public.ruta_cargas (folio);
create index if not exists idx_ruta_cargas_estado on public.ruta_cargas (estado, fecha desc);

create table if not exists public.ruta_carga_lineas (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references public.ruta_cargas(id) on delete cascade,
  producto_id text not null,
  producto_nombre text,
  precio numeric(12,2) default 0,
  qty_cargada numeric(14,3) not null default 0,
  qty_vendida numeric(14,3) not null default 0,
  qty_devuelta numeric(14,3) not null default 0,
  unique (carga_id, producto_id)
);
create index if not exists idx_ruta_carga_lineas_carga on public.ruta_carga_lineas (carga_id);

-- Ventas de ruta (separadas de ventas POS)
create table if not exists public.ruta_ventas (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references public.ruta_cargas(id),
  folio text not null,
  cliente_tipo text not null, -- sucursal | externo
  cliente_id text not null,
  cliente_nombre text,
  metodo_pago text not null, -- efectivo | credito
  total numeric(12,2) not null default 0,
  articulos jsonb not null default '[]',
  vendedor_nombre text,
  created_at timestamptz default now()
);
create index if not exists idx_ruta_ventas_carga on public.ruta_ventas (carga_id, created_at desc);
create index if not exists idx_ruta_ventas_fecha on public.ruta_ventas (created_at desc);

create table if not exists public.ruta_liquidaciones (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references public.ruta_cargas(id),
  venta_efectivo numeric(12,2) not null default 0,
  venta_credito numeric(12,2) not null default 0,
  efectivo_entregado numeric(12,2) not null default 0,
  diferencia numeric(12,2) not null default 0,
  notas text,
  cerrado_por text,
  created_at timestamptz default now()
);
create unique index if not exists idx_ruta_liq_carga on public.ruta_liquidaciones (carga_id);

alter table public.cedis_ruta_stock enable row level security;
alter table public.cedis_ruta_movimientos enable row level security;
alter table public.ruta_clientes enable row level security;
alter table public.ruta_cargas enable row level security;
alter table public.ruta_carga_lineas enable row level security;
alter table public.ruta_ventas enable row level security;
alter table public.ruta_liquidaciones enable row level security;

drop policy if exists "cedis_ruta_stock_anon" on public.cedis_ruta_stock;
create policy "cedis_ruta_stock_anon" on public.cedis_ruta_stock for all using (true) with check (true);
drop policy if exists "cedis_ruta_mov_anon" on public.cedis_ruta_movimientos;
create policy "cedis_ruta_mov_anon" on public.cedis_ruta_movimientos for all using (true) with check (true);
drop policy if exists "ruta_clientes_anon" on public.ruta_clientes;
create policy "ruta_clientes_anon" on public.ruta_clientes for all using (true) with check (true);
drop policy if exists "ruta_cargas_anon" on public.ruta_cargas;
create policy "ruta_cargas_anon" on public.ruta_cargas for all using (true) with check (true);
drop policy if exists "ruta_carga_lineas_anon" on public.ruta_carga_lineas;
create policy "ruta_carga_lineas_anon" on public.ruta_carga_lineas for all using (true) with check (true);
drop policy if exists "ruta_ventas_anon" on public.ruta_ventas;
create policy "ruta_ventas_anon" on public.ruta_ventas for all using (true) with check (true);
drop policy if exists "ruta_liquidaciones_anon" on public.ruta_liquidaciones;
create policy "ruta_liquidaciones_anon" on public.ruta_liquidaciones for all using (true) with check (true);

comment on table public.cedis_ruta_stock is 'Almacén CEDIS Ruta — aislado de MAIN / stock_sucursales';
