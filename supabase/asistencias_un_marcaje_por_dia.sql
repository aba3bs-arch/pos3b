-- Opcional: refuerzo en base de datos. Una ENTRADA y una SALIDA por empleado por día (hora Sonora).
-- La app ya lo valida; este índice evita duplicados por doble clic simultáneo o dos dispositivos.
-- Si ya existen duplicados históricos, el índice NO se crea: revisa la consulta del bloque 1 y corrige/borra.

-- 1) Duplicados existentes (debe regresar 0 filas para poder crear el índice)
select usuario_id, nombre, tipo,
       (created_at at time zone 'America/Hermosillo')::date as dia,
       count(*) as total, array_agg(id order by created_at) as ids
from public.asistencias
where usuario_id is not null
group by 1, 2, 3, 4
having count(*) > 1
order by dia desc;

-- 2) Índice único (solo si el bloque 1 no regresó filas)
create unique index if not exists uq_asistencias_empleado_tipo_dia
  on public.asistencias (usuario_id, tipo, ((created_at at time zone 'America/Hermosillo')::date))
  where usuario_id is not null;
