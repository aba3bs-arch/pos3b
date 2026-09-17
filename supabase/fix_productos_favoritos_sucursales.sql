-- Favoritos por sucursal (tiendas + CEDIS + RUTA).
-- favoritos_sucursales: { "3B5": true, "CEDIS": true, "RUTA": true, ... }
-- en_favoritos se mantiene como derivado (true si alguna sucursal está marcada).
-- RUTA = Venta en ruta (camión); no es tienda de piso.

alter table public.productos
  add column if not exists favoritos_sucursales jsonb default '{}'::jsonb;

comment on column public.productos.favoritos_sucursales is
  'Mapa sucursal → favorito. Tiendas, CEDIS y RUTA (venta en ruta); MAIN no aplica.';

-- Opcional: materializar legado en_favoritos=true a todas las sucursales operativas + CEDIS + RUTA
-- (descomenta si quieres migración masiva; si no, el cliente lo hace al primer toggle).
-- update public.productos
-- set favoritos_sucursales = jsonb_build_object(
--   'FUSION', true, '3B2', true, '3B5', true, '3B6', true,
--   '3B7', true, '3B9', true, '3B10', true, 'CEDIS', true, 'RUTA', true
-- )
-- where coalesce(en_favoritos, false) = true
--   and (favoritos_sucursales is null or favoritos_sucursales = '{}'::jsonb);
