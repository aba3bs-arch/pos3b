-- POS 3B — Stock atómico por sucursal/ubicación (evita lost-update del JSON).
-- Supabase → SQL Editor → Run (reemplaza la versión anterior).
--
-- Funciones:
--   aplicar_delta_stock_ubicacion(id, sucursal, 'piso'|'cedis', delta)
--   aplicar_set_stock_ubicacion(id, sucursal, 'piso'|'cedis', valor)
--   aplicar_delta_stock_piso(...)  — compat ventas (wrapper)

create or replace function public.aplicar_delta_stock_ubicacion(
  p_producto_id text,
  p_sucursal text,
  p_ubicacion text,
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
  v_ubi text;
  v_antes integer;
  v_despues integer;
  v_entry jsonb;
  v_cedis_main integer;
  v_piso_main integer;
  v_stock_cedis integer;
begin
  v_suc := upper(trim(both from coalesce(p_sucursal, '')));
  v_ubi := lower(trim(both from coalesce(p_ubicacion, 'piso')));
  if p_producto_id is null or length(trim(p_producto_id)) = 0 then
    raise exception 'producto_id vacio';
  end if;
  if v_suc = '' then
    raise exception 'sucursal vacia';
  end if;
  if v_ubi not in ('piso', 'cedis') then
    raise exception 'ubicacion invalida (piso|cedis)';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'delta invalido';
  end if;

  -- CEDIS de la empresa solo vive en MAIN.
  if v_ubi = 'cedis' then
    v_suc := 'MAIN';
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

  if v_ubi = 'cedis' then
    v_antes := coalesce((v_entry ->> 'cedis')::integer, v_stock_cedis, 0);
    v_despues := v_antes + p_delta;
    v_piso_main := coalesce((v_entry ->> 'piso')::integer, 0);
    v_entry := jsonb_build_object('cedis', v_despues, 'piso', v_piso_main);
  else
    v_antes := coalesce((v_entry ->> 'piso')::integer, 0);
    v_despues := v_antes + p_delta;
    v_cedis_main := case
      when v_suc = 'MAIN' then coalesce((v_entry ->> 'cedis')::integer, v_stock_cedis, 0)
      else 0
    end;
    v_entry := jsonb_build_object('cedis', v_cedis_main, 'piso', v_despues);
  end if;

  v_map := jsonb_set(v_map, array[v_suc], v_entry, true);

  v_cedis_main := coalesce((v_map -> 'MAIN' ->> 'cedis')::integer, v_stock_cedis, 0);
  v_piso_main := coalesce((v_map -> 'MAIN' ->> 'piso')::integer, 0);
  if v_suc = 'MAIN' then
    v_map := jsonb_set(
      v_map,
      array['MAIN'],
      jsonb_build_object('cedis', v_cedis_main, 'piso', v_piso_main),
      true
    );
  end if;

  -- stock legado = piso MAIN (estable); no el de la última tienda que escribió.
  update public.productos
  set
    stock_sucursales = v_map,
    stock = v_piso_main,
    stock_cedis = greatest(0, v_cedis_main)
  where id = p_producto_id;

  return jsonb_build_object(
    'ok', true,
    'antes', v_antes,
    'despues', v_despues,
    'sucursal', v_suc,
    'ubicacion', v_ubi,
    'stock_sucursales', v_map,
    'stock', v_piso_main,
    'stock_cedis', greatest(0, v_cedis_main)
  );
end;
$$;

create or replace function public.aplicar_set_stock_ubicacion(
  p_producto_id text,
  p_sucursal text,
  p_ubicacion text,
  p_valor integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map jsonb;
  v_suc text;
  v_ubi text;
  v_antes integer;
  v_despues integer;
  v_entry jsonb;
  v_cedis_main integer;
  v_piso_main integer;
  v_stock_cedis integer;
begin
  v_suc := upper(trim(both from coalesce(p_sucursal, '')));
  v_ubi := lower(trim(both from coalesce(p_ubicacion, 'piso')));
  if p_producto_id is null or length(trim(p_producto_id)) = 0 then
    raise exception 'producto_id vacio';
  end if;
  if v_suc = '' then
    raise exception 'sucursal vacia';
  end if;
  if v_ubi not in ('piso', 'cedis') then
    raise exception 'ubicacion invalida (piso|cedis)';
  end if;
  if p_valor is null then
    raise exception 'valor invalido';
  end if;
  v_despues := greatest(0, p_valor);

  if v_ubi = 'cedis' then
    v_suc := 'MAIN';
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

  if v_ubi = 'cedis' then
    v_antes := coalesce((v_entry ->> 'cedis')::integer, v_stock_cedis, 0);
    v_piso_main := coalesce((v_entry ->> 'piso')::integer, 0);
    v_entry := jsonb_build_object('cedis', v_despues, 'piso', v_piso_main);
  else
    v_antes := coalesce((v_entry ->> 'piso')::integer, 0);
    v_cedis_main := case
      when v_suc = 'MAIN' then coalesce((v_entry ->> 'cedis')::integer, v_stock_cedis, 0)
      else 0
    end;
    v_entry := jsonb_build_object('cedis', v_cedis_main, 'piso', v_despues);
  end if;

  v_map := jsonb_set(v_map, array[v_suc], v_entry, true);

  v_cedis_main := coalesce((v_map -> 'MAIN' ->> 'cedis')::integer, v_stock_cedis, 0);
  v_piso_main := coalesce((v_map -> 'MAIN' ->> 'piso')::integer, 0);
  if v_suc = 'MAIN' then
    v_map := jsonb_set(
      v_map,
      array['MAIN'],
      jsonb_build_object('cedis', v_cedis_main, 'piso', v_piso_main),
      true
    );
  end if;

  update public.productos
  set
    stock_sucursales = v_map,
    stock = v_piso_main,
    stock_cedis = greatest(0, v_cedis_main)
  where id = p_producto_id;

  return jsonb_build_object(
    'ok', true,
    'antes', v_antes,
    'despues', v_despues,
    'sucursal', v_suc,
    'ubicacion', v_ubi,
    'stock_sucursales', v_map,
    'stock', v_piso_main,
    'stock_cedis', greatest(0, v_cedis_main)
  );
end;
$$;

-- Compat: ventas / cancelaciones existentes
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
begin
  return public.aplicar_delta_stock_ubicacion(p_producto_id, p_sucursal, 'piso', p_delta);
end;
$$;

grant execute on function public.aplicar_delta_stock_ubicacion(text, text, text, integer) to anon, authenticated, service_role;
grant execute on function public.aplicar_set_stock_ubicacion(text, text, text, integer) to anon, authenticated, service_role;
grant execute on function public.aplicar_delta_stock_piso(text, text, integer) to anon, authenticated, service_role;

comment on function public.aplicar_delta_stock_ubicacion(text, text, text, integer) is
  'Delta atómico piso/cedis con FOR UPDATE; no reescribe otras sucursales.';
comment on function public.aplicar_set_stock_ubicacion(text, text, text, integer) is
  'Set atómico de piso/cedis (conteos físicos) con FOR UPDATE.';
