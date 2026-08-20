-- =============================================================================
-- POS 3B — Auto Fin + Venta en Ruta (completo, idempotente)
-- Supabase → SQL Editor → pegar TODO → Run
--
-- Incluye:
--   1) Auto Fin (créditos, cuotas, pagos, préstamos / externos / MAIN)
--   2) Venta en Ruta (cargas, ventas, clientes)
--   3) Precio ruta + CxC (crédito / cobranza)
--   4) POS v2 (columnas compra_id, tránsito, estatus CxC)
--
-- Equivale a ejecutar en orden:
--   fix_auto_fin.sql
--   fix_auto_fin_prestamos.sql
--   fix_venta_en_ruta.sql
--   fix_precio_ruta_y_cxc.sql
--   fix_venta_ruta_pos_v2.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) AUTO FIN
-- ---------------------------------------------------------------------------
create table if not exists public.auto_fin_creditos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  cliente_id text,
  cliente_nombre text not null,
  cliente_telefono text,
  descripcion text,
  precio numeric(12,2) not null default 0,
  enganche numeric(12,2) not null default 0,
  monto_financiar numeric(12,2) not null default 0,
  frecuencia text not null default 'semanal' check (frecuencia in ('semanal', 'quincenal', 'mensual')),
  num_cuotas int not null default 1,
  con_interes boolean not null default false,
  tasa_interes numeric(8,4) not null default 0,
  interes_total numeric(12,2) not null default 0,
  total_pagar numeric(12,2) not null default 0,
  cuota_monto numeric(12,2) not null default 0,
  fecha_inicio date not null default current_date,
  estado text not null default 'activo' check (estado in ('activo', 'liquidado', 'cancelado')),
  notas text,
  usuario_nombre text,
  created_at timestamptz default now()
);

create index if not exists idx_auto_fin_creditos_estado on public.auto_fin_creditos (estado, created_at desc);
create index if not exists idx_auto_fin_creditos_cliente on public.auto_fin_creditos (cliente_nombre);

create table if not exists public.auto_fin_cuotas (
  id uuid primary key default gen_random_uuid(),
  credito_id uuid not null references public.auto_fin_creditos(id) on delete cascade,
  numero int not null,
  fecha_vencimiento date not null,
  monto numeric(12,2) not null default 0,
  capital numeric(12,2) not null default 0,
  interes numeric(12,2) not null default 0,
  pagado numeric(12,2) not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'parcial', 'pagada', 'vencida')),
  created_at timestamptz default now(),
  unique (credito_id, numero)
);

create index if not exists idx_auto_fin_cuotas_credito on public.auto_fin_cuotas (credito_id, numero);

create table if not exists public.auto_fin_pagos (
  id uuid primary key default gen_random_uuid(),
  credito_id uuid not null references public.auto_fin_creditos(id) on delete cascade,
  cuota_id uuid references public.auto_fin_cuotas(id) on delete set null,
  fecha date not null default current_date,
  monto numeric(12,2) not null default 0,
  metodo text,
  nota text,
  usuario_nombre text,
  created_at timestamptz default now()
);

create index if not exists idx_auto_fin_pagos_credito on public.auto_fin_pagos (credito_id, fecha desc);

alter table public.auto_fin_creditos add column if not exists tipo text default 'vehiculo';
alter table public.auto_fin_creditos add column if not exists beneficiario_tipo text default 'cliente';
alter table public.auto_fin_creditos add column if not exists empleado_id text;
alter table public.auto_fin_creditos add column if not exists empleado_nombre text;
alter table public.auto_fin_creditos add column if not exists prestamo_id uuid;

update public.auto_fin_creditos set tipo = 'vehiculo' where tipo is null;
update public.auto_fin_creditos set beneficiario_tipo = 'cliente' where beneficiario_tipo is null;

create index if not exists idx_auto_fin_creditos_tipo on public.auto_fin_creditos (tipo, estado, created_at desc);
create index if not exists idx_auto_fin_creditos_empleado on public.auto_fin_creditos (empleado_id);
create index if not exists idx_auto_fin_creditos_prestamo on public.auto_fin_creditos (prestamo_id);

alter table public.auto_fin_creditos enable row level security;
alter table public.auto_fin_cuotas enable row level security;
alter table public.auto_fin_pagos enable row level security;

drop policy if exists "auto_fin_creditos_anon_rw" on public.auto_fin_creditos;
create policy "auto_fin_creditos_anon_rw" on public.auto_fin_creditos for all using (true) with check (true);

drop policy if exists "auto_fin_cuotas_anon_rw" on public.auto_fin_cuotas;
create policy "auto_fin_cuotas_anon_rw" on public.auto_fin_cuotas for all using (true) with check (true);

drop policy if exists "auto_fin_pagos_anon_rw" on public.auto_fin_pagos;
create policy "auto_fin_pagos_anon_rw" on public.auto_fin_pagos for all using (true) with check (true);

comment on table public.auto_fin_creditos is
  'Autofinanciamiento Contabilidad → Auto Fin (clientes externos o empleados, incluye MAIN)';

-- ---------------------------------------------------------------------------
-- 2) VENTA EN RUTA (tablas base)
-- ---------------------------------------------------------------------------
create table if not exists public.cedis_ruta_stock (
  producto_id text primary key,
  cantidad numeric(14,3) not null default 0 check (cantidad >= 0),
  updated_at timestamptz default now()
);

create table if not exists public.cedis_ruta_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id text not null,
  tipo text not null,
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

create table if not exists public.ruta_cargas (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  vendedor_id text,
  vendedor_nombre text,
  fecha date not null default current_date,
  estado text not null default 'armada',
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

create table if not exists public.ruta_ventas (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references public.ruta_cargas(id),
  folio text not null,
  cliente_tipo text not null,
  cliente_id text not null,
  cliente_nombre text,
  metodo_pago text not null,
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

-- ---------------------------------------------------------------------------
-- 3) PRECIO RUTA + CxC
-- ---------------------------------------------------------------------------
alter table public.productos
  add column if not exists precio_ruta numeric(12,2) default 0;

comment on column public.productos.precio_ruta is
  'Precio especial Venta en Ruta (sin impuestos). Lo define el administrador.';

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

create index if not exists idx_ruta_cxc_cliente
  on public.ruta_cxc_movimientos (cliente_tipo, cliente_id, created_at desc);
create index if not exists idx_ruta_cxc_fecha
  on public.ruta_cxc_movimientos (created_at desc);
create index if not exists idx_ruta_cxc_venta
  on public.ruta_cxc_movimientos (venta_id)
  where venta_id is not null;

alter table public.ruta_cxc_movimientos enable row level security;
drop policy if exists "ruta_cxc_movimientos_anon" on public.ruta_cxc_movimientos;
create policy "ruta_cxc_movimientos_anon" on public.ruta_cxc_movimientos
  for all using (true) with check (true);

comment on table public.ruta_cxc_movimientos is
  'Crédito y cobranza de Venta en Ruta (CxC). Separado de ventas POS y de Auto Fin.';

-- ---------------------------------------------------------------------------
-- 4) VENTA EN RUTA POS v2 (columnas extra)
-- ---------------------------------------------------------------------------
alter table public.ruta_ventas add column if not exists compra_id uuid;
alter table public.ruta_ventas add column if not exists transito_id text;
alter table public.ruta_ventas add column if not exists estado_credito text;

comment on column public.ruta_ventas.compra_id is
  'Pedido en compras (estado=pedido) generado para la sucursal compradora.';
comment on column public.ruta_ventas.transito_id is
  'Id en transito_efectivo cuando la venta (o el cobro de crédito) entra a efectivo en tránsito.';
comment on column public.ruta_ventas.estado_credito is
  'pendiente | pagado · solo ventas a crédito.';

alter table public.ruta_cxc_movimientos add column if not exists estatus text default 'pendiente';
alter table public.ruta_cxc_movimientos add column if not exists pagado_por text;
alter table public.ruta_cxc_movimientos add column if not exists pagado_at timestamptz;
alter table public.ruta_cxc_movimientos add column if not exists gasto_id uuid;
alter table public.ruta_cxc_movimientos add column if not exists folio_venta text;

create index if not exists idx_ruta_cxc_estatus
  on public.ruta_cxc_movimientos (estatus, created_at desc);
create index if not exists idx_ruta_cxc_folio
  on public.ruta_cxc_movimientos (folio_venta);

comment on column public.ruta_cxc_movimientos.estatus is
  'En cargos: pendiente|pagado. Abonos quedan como abono.';

-- Tablas que deben existir tras este script:
--   auto_fin_creditos, auto_fin_cuotas, auto_fin_pagos
--   ruta_clientes, ruta_cargas, ruta_carga_lineas, ruta_ventas, ruta_liquidaciones
--   ruta_cxc_movimientos
--   productos.precio_ruta
--   (legado opcional) cedis_ruta_stock, cedis_ruta_movimientos
