-- Unifica tienda Fusión / FUSIÓN → FUSION (código canónico sin acento).
-- Ejecutar en Supabase → SQL Editor.
-- Evita desfase en Conciliaciones y pérdida de caja chica en Corte Abarrotes
-- cuando el estado quedó bajo la clave histórica «Fusión».

update public.transito_efectivo
set sucursal_origen = 'FUSION'
where sucursal_origen in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');

update public.cortes_contabilidad_gastos
set sucursal_id = 'FUSION'
where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');

update public.cortes_contabilidad_cierres
set sucursal_id = 'FUSION'
where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');

update public.usuarios
set sucursal_id = 'FUSION'
where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');

-- Folios: si ya hay fila FUSION, subir ultimo al máximo y borrar huérfanos.
update public.cortes_contabilidad_folios f
set ultimo = greatest(
  coalesce(f.ultimo, 0),
  coalesce((
    select max(h.ultimo)
    from public.cortes_contabilidad_folios h
    where h.modulo = f.modulo
      and h.sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion')
  ), 0)
)
where f.sucursal_id = 'FUSION';

insert into public.cortes_contabilidad_folios (sucursal_id, modulo, ultimo, prefijo)
select 'FUSION', h.modulo, max(h.ultimo), max(h.prefijo)
from public.cortes_contabilidad_folios h
where h.sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion')
  and not exists (
    select 1 from public.cortes_contabilidad_folios c
    where c.sucursal_id = 'FUSION' and c.modulo = h.modulo
  )
group by h.modulo;

delete from public.cortes_contabilidad_folios
where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');

-- Estado abierto (caja chica): reclamar huérfanos Fusión → FUSION.
-- Si ya existe FUSION vacío y hay huérfano con caja, fusionar JSON.
do $$
declare
  r record;
  canon jsonb;
  huer jsonb;
  caja_c numeric;
  caja_h numeric;
  merged jsonb;
begin
  for r in
    select distinct modulo
    from public.cortes_contabilidad_estado
    where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion', 'FUSION')
  loop
    select estado into canon
    from public.cortes_contabilidad_estado
    where sucursal_id = 'FUSION' and modulo = r.modulo;

    select estado into huer
    from public.cortes_contabilidad_estado
    where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion')
      and modulo = r.modulo
    order by updated_at desc nulls last
    limit 1;

    if huer is null then
      continue;
    end if;

    caja_c := coalesce((canon->>'caja_anterior')::numeric, 0);
    caja_h := coalesce((huer->>'caja_anterior')::numeric, 0);

    if canon is null then
      insert into public.cortes_contabilidad_estado (sucursal_id, modulo, estado, updated_at)
      values ('FUSION', r.modulo, huer, now())
      on conflict (sucursal_id, modulo) do update
        set estado = excluded.estado, updated_at = now();
    elsif caja_c < 0.01 and caja_h >= 0.01 then
      merged := coalesce(canon, '{}'::jsonb) || huer;
      update public.cortes_contabilidad_estado
      set estado = merged, updated_at = now()
      where sucursal_id = 'FUSION' and modulo = r.modulo;
    end if;
  end loop;

  delete from public.cortes_contabilidad_estado
  where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');
end $$;
