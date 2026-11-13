-- Diagnóstico de recargas telefónicas (solo lectura). Cambia las fechas si hace falta.
-- Hora mostrada en Nogales (UTC-7, sin horario de verano).

-- 1) Posibles duplicados: misma tienda, vendedor, total y artículos con menos de 2 minutos de diferencia.
with r as (
  select id, sucursal_id, vendedor, total, metodo_pago, turno_nombre, articulos::text as arts,
         created_at, (created_at at time zone 'America/Hermosillo') as hora_nogales
  from public.ventas
  where created_at >= now() - interval '14 days'
    and (articulos::text ilike '%recarga%' or metodo_pago ilike '%recarga%')
)
select a.sucursal_id, a.vendedor, a.total, a.hora_nogales as hora_1, b.hora_nogales as hora_2,
       (b.created_at - a.created_at) as diferencia, a.id as venta_1, b.id as venta_2
from r a
join r b on b.sucursal_id = a.sucursal_id and b.vendedor = a.vendedor and b.total = a.total
        and b.arts = a.arts and b.created_at > a.created_at
        and b.created_at - a.created_at <= interval '2 minutes'
order by a.hora_nogales desc;

-- 2) Recargas con turno guardado distinto al turno que corresponde a su hora (12x12: diurno 07-19).
select id, sucursal_id, vendedor, total, metodo_pago, turno_id, turno_nombre,
       (created_at at time zone 'America/Hermosillo') as hora_nogales,
       case when extract(hour from (created_at at time zone 'America/Hermosillo')) between 7 and 18
            then 'diurno' else 'nocturno' end as turno_por_hora
from public.ventas
where created_at >= now() - interval '14 days'
  and (articulos::text ilike '%recarga%' or metodo_pago ilike '%recarga%')
  and coalesce(turno_id, '') <> ''
  and turno_id <> case when extract(hour from (created_at at time zone 'America/Hermosillo')) between 7 and 18
                       then 'diurno' else 'nocturno' end
order by created_at desc;

-- 3) Ajustes del candado Mercado Pago (llevan la hora del cierre, no la de la recarga).
select id, sucursal_id, vendedor, total, turno_nombre,
       (created_at at time zone 'America/Hermosillo') as hora_nogales
from public.ventas
where created_at >= now() - interval '30 days'
  and (metodo_pago ilike 'Recarga Mercado Pago%' or articulos::text like '%recarga-mp-ajuste-candado%')
order by created_at desc;
