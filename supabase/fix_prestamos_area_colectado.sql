-- =============================================================================
-- POS 3B — Préstamos área / sucursal: gasto en corte de origen + quién colectó
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Al registrar el préstamo se carga como gasto al corte de origen
-- (virtual, abarrotes o garage). Al recolectar ese corte, se guarda
-- quién colectó el dinero (recolector) en el préstamo.

alter table public.prestamos_interarea
  add column if not exists cargado_corte boolean default false;

alter table public.prestamos_interarea
  add column if not exists gasto_id uuid;

alter table public.prestamos_interarea
  add column if not exists colectado_por text;

alter table public.prestamos_interarea
  add column if not exists colectado_at timestamptz;

alter table public.prestamos_interarea
  add column if not exists colectado_folio text;

alter table public.prestamos_interarea
  add column if not exists colectado_modulo text;

comment on column public.prestamos_interarea.colectado_por is
  'Nombre de quien recolectó el corte donde el préstamo quedó como gasto.';

alter table public.prestamos_sucursales
  add column if not exists area_corte text;

alter table public.prestamos_sucursales
  add column if not exists cargado_corte boolean default false;

alter table public.prestamos_sucursales
  add column if not exists gasto_id uuid;

alter table public.prestamos_sucursales
  add column if not exists colectado_por text;

alter table public.prestamos_sucursales
  add column if not exists colectado_at timestamptz;

alter table public.prestamos_sucursales
  add column if not exists colectado_folio text;

alter table public.prestamos_sucursales
  add column if not exists colectado_modulo text;

comment on column public.prestamos_sucursales.colectado_por is
  'Nombre de quien recolectó el corte donde el préstamo quedó como gasto.';

create index if not exists idx_prestamos_interarea_gasto
  on public.prestamos_interarea (gasto_id)
  where gasto_id is not null;

create index if not exists idx_prestamos_sucursales_gasto
  on public.prestamos_sucursales (gasto_id)
  where gasto_id is not null;
