-- POS 3B — Stock por ubicación (CEDIS / piso) y traspasos entre tiendas
-- Supabase → SQL Editor → Run (seguro re-ejecutar)

alter table public.productos add column if not exists stock_cedis integer default 0;
alter table public.productos add column if not exists stock_sucursales jsonb default '{}'::jsonb;

update public.productos set stock_cedis = 0 where stock_cedis is null;
update public.productos set stock_sucursales = '{}'::jsonb where stock_sucursales is null;

comment on column public.productos.stock is 'Unidades en piso de venta (lo que se vende en mostrador).';
comment on column public.productos.stock_cedis is 'Unidades en CEDIS / almacén de la tienda.';
comment on column public.productos.stock_sucursales is 'Inventario por sucursal: {"MAIN":{"cedis":0,"piso":10}, ...}';
