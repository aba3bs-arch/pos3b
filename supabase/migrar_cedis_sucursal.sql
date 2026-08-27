-- Migración: separar CEDIS de MAIN
-- Ejecutar en Supabase → SQL Editor DESPUÉS de desplegar fix_stock_delta_atomico.sql
--
-- Antes: stock_sucursales.MAIN.cedis = almacén
-- Después: stock_sucursales.CEDIS.cedis = almacén ; MAIN.cedis = 0

-- 1) Mover MAIN.cedis (+ stock_cedis legacy) → CEDIS.cedis
UPDATE public.productos
SET stock_sucursales =
  jsonb_set(
    COALESCE(stock_sucursales, '{}'::jsonb),
    '{CEDIS}',
    jsonb_build_object(
      'cedis',
      GREATEST(
        COALESCE((stock_sucursales -> 'CEDIS' ->> 'cedis')::int, 0),
        COALESCE((stock_sucursales -> 'MAIN' ->> 'cedis')::int, 0),
        COALESCE(stock_cedis, 0)
      ),
      'piso', COALESCE((stock_sucursales -> 'CEDIS' ->> 'piso')::int, 0)
    ),
    true
  );

-- 2) Cero en MAIN.cedis (conserva MAIN.piso si existía)
UPDATE public.productos
SET stock_sucursales =
  jsonb_set(
    COALESCE(stock_sucursales, '{}'::jsonb),
    '{MAIN}',
    jsonb_build_object(
      'cedis', 0,
      'piso', COALESCE((stock_sucursales -> 'MAIN' ->> 'piso')::int, 0)
    ),
    true
  );

-- 3) Resync columna legacy
UPDATE public.productos
SET stock_cedis = GREATEST(0, COALESCE((stock_sucursales -> 'CEDIS' ->> 'cedis')::int, 0));
