-- Ejecutar en Supabase → SQL Editor
-- Turnos en corte de caja: un corte por tienda + fecha + turno.

alter table public.usuarios add column if not exists turno_id text;

alter table public.cortes_caja add column if not exists turno_id text;
alter table public.cortes_caja add column if not exists turno_nombre text;

create unique index if not exists idx_cortes_sucursal_fecha_turno
  on public.cortes_caja (sucursal_id, fecha, turno_id)
  where turno_id is not null and trim(turno_id) <> '';

comment on column public.usuarios.turno_id is 'Id de turno (manana, tarde, noche…) definido en Configuración del POS.';
alter table public.usuarios add column if not exists turno_horario jsonb;
comment on column public.usuarios.turno_horario is 'Horario personalizado por día: {"tipo":"personalizado","dias":{"1":"diurno","2":"diurno",...}}';
comment on column public.cortes_caja.turno_id is 'Un solo corte permitido por sucursal, fecha y turno.';
