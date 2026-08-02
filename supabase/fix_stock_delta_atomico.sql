-- POS 3B — Delta atómico de piso por sucursal (evita que una caja con stock viejo
-- reescriba stock_sucursales completo y “regrese” existencias).
-- Supabase → SQL Editor → Run

create or replace function public.aplicar_delta_stock_piso(
  p_producto_id text,
  p_sucursal text,
  p_delta integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map jsonb;
  v_suc text;
  v_antes integer;
  v_despues integer;
  v_entry jsonb;
  v_cedis_main integer;
  v_stock_cedis integer;
begin
  v_suc := upper(trim(both from coalesce(p_sucursal, '')));
  if p_producto_id is null or length(trim(p_producto_id)) = 0 then
    raise exception 'producto_id vacio';
  end if;
  if v_suc = '' then
    raise exception 'sucursal vacia';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'delta invalido';
  end if;

  select coalesce(stock_sucursales, '{}'::jsonb), coalesce(stock_cedis, 0)
    into v_map, v_stock_cedis
  from public.productos
  where id = p_producto_id
  for update;

  if not found then
    raise exception 'producto % no existe', p_producto_id;
  end if;

  if jsonb_typeof(v_map) is distinct from 'object' then
    v_map := '{}'::jsonb;
  end if;

  v_entry := v_map -> v_suc;
  if v_entry is null or jsonb_typeof(v_entry) = 'null' then
    v_entry := '{"cedis":0,"piso":0}'::jsonb;
  elsif jsonb_typeof(v_entry) = 'number' then
    v_entry := jsonb_build_object('cedis', 0, 'piso', coalesce((v_entry #>> '{}')::integer, 0));
  end if;

  v_antes := coalesce((v_entry ->> 'piso')::integer, 0);
  v_despues := v_antes + p_delta;

  v_entry := jsonb_build_object(
    'cedis', case when v_suc = 'MAIN' then coalesce((v_map -> 'MAIN' ->> 'cedis')::integer, v_stock_cedis, 0) else 0 end,
    'piso', v_despues
  );
  v_map := jsonb_set(v_map, array[v_suc], v_entry, true);

  v_cedis_main := coalesce((v_map -> 'MAIN' ->> 'cedis')::integer, v_stock_cedis, 0);
  if v_suc = 'MAIN' then
    -- conservar cedis en MAIN al mover solo piso
    v_map := jsonb_set(
      v_map,
      array['MAIN'],
      jsonb_build_object('cedis', v_cedis_main, 'piso', v_despues),
      true
    );
  end if;

  -- stock legado = piso de la sucursal tocada (la UI remapea por tienda activa).
  -- stock_cedis siempre refleja MAIN.cedis; no se tocan otras claves del JSON.
  update public.productos
  set
    stock_sucursales = v_map,
    stock = v_despues,
    stock_cedis = greatest(0, v_cedis_main)
  where id = p_producto_id;

  return jsonb_build_object(
    'ok', true,
    'antes', v_antes,
    'despues', v_despues,
    'sucursal', v_suc,
    'stock_sucursales', v_map,
    'stock', v_despues,
    'stock_cedis', greatest(0, v_cedis_main)
  );
end;
$$;

grant execute on function public.aplicar_delta_stock_piso(text, text, integer) to anon, authenticated, service_role;

comment on function public.aplicar_delta_stock_piso(text, text, integer) is
  'Ajusta solo el piso de una sucursal con bloqueo de fila; evita lost-update del JSON completo.';
