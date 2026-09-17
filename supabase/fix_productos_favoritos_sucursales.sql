-- Favoritos por sucursal (tiendas + RUTA).
-- favoritos_sucursales: { "3B5": true, "RUTA": true, ... }
-- en_favoritos se mantiene como derivado (true si alguna sucursal está marcada).
-- RUTA = Venta en ruta (camión). CEDIS es centro de distribución (sin favoritos de caja).

alter table public.productos
  add column if not exists favoritos_sucursales jsonb default '{}'::jsonb;

comment on column public.productos.favoritos_sucursales is
  'Mapa sucursal → favorito. Tiendas y RUTA (venta en ruta). CEDIS/MAIN no aplican.';

-- Opcional: materializar legado en_favoritos=true a tiendas operativas + RUTA
-- (descomenta si quieres migración masiva; si no, el cliente lo hace al primer toggle).
-- update public.productos
-- set favoritos_sucursales = jsonb_build_object(
--   'FUSION', true, '3B2', true, '3B5', true, '3B6', true,
--   '3B7', true, '3B9', true, '3B10', true, 'RUTA', true
-- )
-- where coalesce(en_favoritos, false) = true
--   and (favoritos_sucursales is null or favoritos_sucursales = '{}'::jsonb);
