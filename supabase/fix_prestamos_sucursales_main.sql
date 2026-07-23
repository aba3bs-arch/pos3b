-- =============================================================================
-- POS 3B — Ampliar préstamos sucursales para envío MAIN → tienda
-- (opcional; el flujo funciona sin estas columnas)
-- =============================================================================

alter table public.prestamos_sucursales
  add column if not exists area_corte text;

alter table public.prestamos_sucursales
  add column if not exists cargado_corte boolean default false;

alter table public.prestamos_sucursales
  add column if not exists tipo text default 'sucursal';

comment on column public.prestamos_sucursales.tipo is
  'sucursal = préstamo tienda→tienda (cobro manual); main_envio = vale MAIN→tienda cargado al corte sin IE';
