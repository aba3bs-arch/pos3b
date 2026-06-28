-- POS 3B — Stock por ubicación (CEDIS / piso) y traspasos entre tiendas
-- Supabase → SQL Editor → Run (seguro re-ejecutar)

alter table public.productos add column if not exists stock_cedis integer default 0;
alter table public.productos add column if not exists stock_sucursales jsonb default '{}'::jsonb;

update public.productos set stock_cedis = 0 where stock_cedis is null;
update public.productos set stock_sucursales = '{}'::jsonb where stock_sucursales is null;

comment on column public.productos.stock is 'Unidades en piso de venta de la tienda (mostrador).';
comment on column public.productos.stock_cedis is 'Unidades en CEDIS central (MAIN) — único almacén de la empresa.';
comment on column public.productos.stock_sucursales is 'Inventario por sucursal: CEDIS solo en MAIN; piso en cada tienda. Ej: {"MAIN":{"cedis":100,"piso":0},"FUSION":{"cedis":0,"piso":24}}';
