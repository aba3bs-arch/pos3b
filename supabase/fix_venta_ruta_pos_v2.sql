-- =============================================================================
-- POS 3B — Venta en Ruta POS v2 (MAIN → camión → venta → tránsito / CxC / compras)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

-- Precio especial de ruta (sin impuestos). Lo ajusta el admin.
alter table public.productos
  add column if not exists precio_ruta numeric(12,2) default 0;

comment on column public.productos.precio_ruta is
  'Precio especial Venta en Ruta (sin impuestos). Lo define el administrador.';

-- Campos extra en ventas de ruta
alter table public.ruta_ventas
  add column if not exists compra_id uuid;
alter table public.ruta_ventas
  add column if not exists transito_id text;
alter table public.ruta_ventas
  add column if not exists estado_credito text; -- null | pendiente | pagado

comment on column public.ruta_ventas.compra_id is
  'Pedido en compras (estado=pedido) generado para la sucursal compradora.';
comment on column public.ruta_ventas.transito_id is
  'Id en transito_efectivo cuando la venta (o el cobro de crédito) entra a efectivo en tránsito.';
comment on column public.ruta_ventas.estado_credito is
  'pendiente | pagado · solo ventas a crédito.';

-- CxC: marca de pago por cajero
alter table public.ruta_cxc_movimientos
  add column if not exists estatus text default 'pendiente';
alter table public.ruta_cxc_movimientos
  add column if not exists pagado_por text;
alter table public.ruta_cxc_movimientos
  add column if not exists pagado_at timestamptz;
alter table public.ruta_cxc_movimientos
  add column if not exists gasto_id uuid;
alter table public.ruta_cxc_movimientos
  add column if not exists folio_venta text;

create index if not exists idx_ruta_cxc_estatus
  on public.ruta_cxc_movimientos (estatus, created_at desc);
create index if not exists idx_ruta_cxc_folio
  on public.ruta_cxc_movimientos (folio_venta);

comment on column public.ruta_cxc_movimientos.estatus is
  'En cargos: pendiente|pagado. Abonos quedan como abono.';

-- Deprecados (ya no usa la app; se pueden vaciar después):
--   cedis_ruta_stock, cedis_ruta_movimientos
--   ruta_efectivo_movimientos, ruta_capital_solicitudes, ruta_preinventario_sesiones
