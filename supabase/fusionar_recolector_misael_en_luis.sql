-- Fusiona al recolector duplicado rep_misael dentro de rep_luis (una sola vez).
-- Ejecutar completo en Supabase → SQL Editor.
--
-- Qué hace (todo en una sola transacción: si algo falla, no se cambia nada):
--   1. Verifica que rep_luis exista y que no haya conflicto de camión activo.
--   2. Pasa de rep_misael a rep_luis TODAS las columnas repartidor_id / recolector_id
--      de las tablas de public (movimientos de efectivo, camiones, conciliaciones, fondo, etc.).
--   3. Pasa las cargas de ruta (vendedor_id 'rt:rep_misael' o 'rep_misael') a rep_luis.
--   4. Borra el registro rep_misael de repartidores.
-- Al final devuelve una tabla con cuántos registros se movieron en cada tabla.

begin;

create temp table fusion_resumen (
  tabla text,
  columna text,
  movidos bigint
) on commit drop;

do $$
declare
  v_origen constant text := 'rep_misael';
  v_destino constant text := 'rep_luis';
  r record;
  n bigint;
begin
  if not exists (select 1 from public.repartidores where id = v_destino) then
    raise exception 'No existe el recolector destino % en repartidores.', v_destino;
  end if;
  if not exists (select 1 from public.repartidores where id = v_origen) then
    raise exception 'El recolector % ya no existe; no hay nada que fusionar.', v_origen;
  end if;

  if to_regclass('public.ruta_camiones') is not null
     and exists (
       select 1 from public.ruta_camiones a
       join public.ruta_camiones b on b.id <> a.id
       where a.repartidor_id = v_origen and b.repartidor_id = v_destino
         and coalesce(a.activo, true) and coalesce(b.activo, true)
     ) then
    raise exception 'Ambos recolectores tienen un camión ACTIVO asignado. Desactiva o reasigna uno en Venta en Ruta → Camiones y vuelve a ejecutar.';
  end if;

  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name in ('repartidor_id', 'recolector_id')
      and c.data_type in ('text', 'character varying')
      and c.table_name <> 'repartidores'
    order by c.table_name, c.column_name
  loop
    execute format('update public.%I set %I = $1 where %I = $2', r.table_name, r.column_name, r.column_name)
      using v_destino, v_origen;
    get diagnostics n = row_count;
    insert into fusion_resumen values (r.table_name, r.column_name, n);
  end loop;

  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name = 'vendedor_id'
      and c.data_type in ('text', 'character varying')
    order by c.table_name
  loop
    execute format(
      'update public.%I set vendedor_id = case when lower(vendedor_id) like ''rt:%%'' then ''rt:'' || $1 else $1 end '
      'where lower(vendedor_id) in (''rt:'' || $2, $2)', r.table_name)
      using v_destino, v_origen;
    get diagnostics n = row_count;
    insert into fusion_resumen values (r.table_name, 'vendedor_id', n);
  end loop;

  delete from public.repartidores where id = v_origen;
  insert into fusion_resumen values ('repartidores', 'id (rep_misael eliminado)', 1);
end
$$;

select tabla, columna, movidos
from fusion_resumen
order by (movidos = 0), tabla, columna;

commit;
