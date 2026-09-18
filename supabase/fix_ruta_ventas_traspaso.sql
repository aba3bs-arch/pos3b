-- =============================================================================
-- Venta en Ruta: enlace a traspaso (recepción en tienda)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.ruta_ventas
  add column if not exists traspaso_id uuid;

comment on column public.ruta_ventas.traspaso_id is
  'inventario_traspasos.id del envío (estado=enviado) creado al cerrar venta a sucursal; la tienda recibe en Productos → Traspasos.';

create index if not exists idx_ruta_ventas_traspaso
  on public.ruta_ventas (traspaso_id)
  where traspaso_id is not null;
