-- Columnas opcionales de auditoríaacion de corte fuera de horario.
-- Pegar en Supabase → SQL Editor → Run (seguro re-ejecutar).

alter table public.cortes_caja add column if not exists autorizado_fuera_horario boolean default false;
alter table public.cortes_caja add column if not exists autorizado_por text;
alter table public.cortes_caja add column if not exists autorizado_at timestamptz;

comment on column public.cortes_caja.autorizado_fuera_horario is
  'true si un admin autorizo con PIN el cierre fuera de la ventana de hora_fin.';
comment on column public.cortes_caja.autorizado_por is
  'Nombre del administrador que autorizo el corte fuera de horario.';

notify pgrst, 'reload schema';
