-- Ejecutar en Supabase → SQL Editor
-- Solicitudes de abono / descuento / liquidación en préstamos a empleados.

alter table public.prestamos add column if not exists solicitud_tipo text;
alter table public.prestamos add column if not exists solicitud_monto numeric(12,2) default 0;
alter table public.prestamos add column if not exists solicitud_por text;
alter table public.prestamos add column if not exists solicitud_at timestamptz;
alter table public.prestamos add column if not exists solicitud_notas text;

comment on column public.prestamos.solicitud_tipo is 'abono | descuento | liquidacion | null';
comment on column public.prestamos.solicitud_monto is 'Monto solicitado pendiente de aprobación admin';
