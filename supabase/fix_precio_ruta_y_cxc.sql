-- =============================================================================
-- POS 3B — Precio CEDIS Ruta + Cuentas por cobrar (crédito / cobranza)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

-- Legado: precio_ruta (la app usa precio_compra_con como precio CEDIS Ruta)
alter table public.productos
  add column if not exists precio_ruta numeric(12,2) default 0;

comment on column public.productos.precio_ruta is
  'Legado. CEDIS Ruta toma precio_compra_con; al guardar producto se sincroniza aquí.';

-- Movimientos de crédito por cobrar (cargos de venta a crédito + abonos de cobranza)
create table if not exists public.ruta_cxc_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_tipo text not null, -- sucursal | externo
  cliente_id text not null,
  cliente_nombre text,
  tipo text not null, -- cargo | abono | ajuste
  monto numeric(12,2) not null check (monto > 0),
  saldo_despues numeric(12,2) not null default 0,
  venta_id text,
  carga_id text,
  metodo_pago text, -- en abonos: efectivo | transferencia | otro
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
