-- Favoritos por sucursal (tiendas de venta).
-- favoritos_sucursales: { "3B5": true, "FUSION": true, ... }
-- en_favoritos se mantiene como derivado (true si alguna tienda está marcada).
-- CEDIS = centro de distribución (sin favoritos). RUTA POS usa la carga del camión.

alter table public.productos
  add column if not exists favoritos_sucursales jsonb default '{}'::jsonb;

comment on column public.productos.favoritos_sucursales is
  'Mapa tienda → favorito. Solo sucursales de venta. CEDIS/MAIN/RUTA no aplican.';

-- Opcional: materializar legado en_favoritos=true a tiendas operativas
-- (descomenta si quieres migración masiva; si no, el cliente lo hace al primer toggle).
-- update public.productos
-- set favoritos_sucursales = jsonb_build_object(
--   'FUSION', true, '3B2', true, '3B5', true, '3B6', true,
--   '3B7', true, '3B9', true, '3B10', true
-- )
-- where coalesce(en_favoritos, false) = true
--   and (favoritos_sucursales is null or favoritos_sucursales = '{}'::jsonb);
