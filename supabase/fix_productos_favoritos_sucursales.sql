-- Favoritos por sucursal (tiendas + CEDIS).
-- favoritos_sucursales: { "3B5": true, "CEDIS": true, ... }
-- en_favoritos se mantiene como derivado (true si alguna sucursal está marcada).

alter table public.productos
  add column if not exists favoritos_sucursales jsonb default '{}'::jsonb;

comment on column public.productos.favoritos_sucursales is
  'Mapa sucursal → favorito. CEDIS y tiendas; MAIN no aplica.';

-- Opcional: materializar legado en_favoritos=true a todas las sucursales operativas + CEDIS
-- (descomenta si quieres migración masiva; si no, el cliente lo hace al primer toggle).
-- update public.productos
-- set favoritos_sucursales = jsonb_build_object(
--   'FUSION', true, '3B2', true, '3B5', true, '3B6', true,
--   '3B7', true, '3B9', true, '3B10', true, 'CEDIS', true
-- )
-- where coalesce(en_favoritos, false) = true
--   and (favoritos_sucursales is null or favoritos_sucursales = '{}'::jsonb);
