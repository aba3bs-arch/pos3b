-- Columnas completas de proveedores (tablas antiguas incompletas).
-- Ejecutar en Supabase SQL Editor una sola vez.

alter table public.proveedores add column if not exists contacto text;
alter table public.proveedores add column if not exists telefono text;
alter table public.proveedores add column if not exists email text;
alter table public.proveedores add column if not exists rfc text;
alter table public.proveedores add column if not exists direccion text;
alter table public.proveedores add column if not exists notas text;
alter table public.proveedores add column if not exists modo_compra text not null default 'pedido';

comment on column public.proveedores.email is 'Correo de contacto del proveedor';
comment on column public.proveedores.rfc is 'RFC fiscal del proveedor';
comment on column public.proveedores.direccion is 'Dirección / domicilio fiscal';
comment on column public.proveedores.modo_compra is 'pedido = pedido pendiente + recepción; directa = entrega directa a inventario (preventa/repartidor)';
