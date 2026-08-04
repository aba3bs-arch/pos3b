-- Tipo de flujo de compra por proveedor (pedido vs entrega directa a inventario).
alter table public.proveedores
  add column if not exists modo_compra text not null default 'pedido';

comment on column public.proveedores.modo_compra is 'pedido = pedido pendiente + recepción; directa = entrega directa a inventario (preventa/repartidor)';
