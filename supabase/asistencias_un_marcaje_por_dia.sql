-- Refuerzo en base de datos: una ENTRADA y una SALIDA por empleado por día (hora Sonora).
-- La app ya lo valida; este índice evita duplicados por doble clic simultáneo o dos dispositivos.
--
-- Hay duplicados históricos, así que el índice solo aplica a marcajes NUEVOS (desde la fecha de corte).
-- No borra ni modifica nada del historial.

-- Paso 1 (requerido): índice único solo para marcajes desde el 2026-11-06 (hora Sonora).
create unique index if not exists uq_asistencias_empleado_tipo_dia_nuevos
  on public.asistencias (usuario_id, tipo, ((created_at at time zone 'America/Hermosillo')::date))
  where usuario_id is not null
    and created_at >= timestamptz '2026-11-06 00:00:00-07';

-- Paso 2 (opcional): ver los duplicados históricos.
-- select usuario_id, nombre, tipo,
--        (created_at at time zone 'America/Hermosillo')::date as dia,
--        count(*) as total, array_agg(id order by created_at) as ids
-- from public.asistencias
-- where usuario_id is not null
-- group by 1, 2, 3, 4
-- having count(*) > 1
-- order by dia desc;

-- Paso 3 (opcional, solo si quieres limpiar el historial): respaldo y borrado de duplicados.
-- Conserva la PRIMERA entrada y la ÚLTIMA salida de cada día. Revisa el paso 2 antes de ejecutar.
-- create table if not exists public.asistencias_respaldo_duplicados as
--   select * from public.asistencias where false;
-- with ranked as (
--   select id, tipo,
--          row_number() over (
--            partition by usuario_id, tipo, (created_at at time zone 'America/Hermosillo')::date
--            order by case when tipo = 'ENTRADA' then created_at end asc,
--                     case when tipo = 'SALIDA' then created_at end desc
--          ) as rn
--   from public.asistencias
--   where usuario_id is not null
-- ), sobran as (select id from ranked where rn > 1),
-- guardados as (
--   insert into public.asistencias_respaldo_duplicados
--   select a.* from public.asistencias a join sobran s on s.id = a.id
--   returning id
-- )
-- delete from public.asistencias where id in (select id from guardados);
