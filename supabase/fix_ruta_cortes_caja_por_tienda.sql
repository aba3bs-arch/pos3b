-- Desglose por tienda/cliente en cortes de caja de Venta en Ruta.
-- Se guarda al cerrar el corte (tickets, total, efectivo, crédito por destino).

alter table public.ruta_cortes_caja
  add column if not exists por_tienda jsonb not null default '[]'::jsonb;

comment on column public.ruta_cortes_caja.por_tienda is
  'Desglose de ventas por tienda/cliente: [{cliente_id, cliente_nombre, tickets, total, efectivo, credito}, ...]';
