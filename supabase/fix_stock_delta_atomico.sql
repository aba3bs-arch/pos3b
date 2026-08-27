-- POS 3B — Stock atómico por sucursal/ubicación (evita lost-update del JSON).
-- Supabase → SQL Editor → Run (reemplaza la versión anterior).
--
-- CEDIS (sucursal) = almacén central. MAIN = solo panel admin (sin inventario CEDIS).
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
  v_cedis_central integer;
  v_piso_suc integer;
  v_stock_cedis integer;
  v_main_cedis_legacy integer;
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

  -- CEDIS de la empresa solo vive en la sucursal CEDIS.
  if v_ubi = 'cedis' then
    v_suc := 'CEDIS';
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

  -- Migración lazy: MAIN.cedis → CEDIS.cedis
  v_main_cedis_legacy := coalesce((v_map -> 'MAIN' ->> 'cedis')::integer, 0);
  v_cedis_central := coalesce((v_map -> 'CEDIS' ->> 'cedis')::integer, 0);
  if v_main_cedis_legacy > 0 then
    v_cedis_central := v_cedis_central + v_main_cedis_legacy;
    v_map := jsonb_set(
      v_map,
      array['CEDIS'],
      jsonb_build_object(
        'cedis', v_cedis_central,
        'piso', coalesce((v_map -> 'CEDIS' ->> 'piso')::integer, 0)
      ),
      true
    );
    v_map := jsonb_set(
      v_map,
      array['MAIN'],
      jsonb_build_object(
        'cedis', 0,
        'piso', coalesce((v_map -> 'MAIN' ->> 'piso')::integer, 0)
      ),
      true
    );
  end if;

  v_entry := v_map -> v_suc;
  if v_entry is null or jsonb_typeof(v_entry) = 'null' then
    v_entry := '{"cedis":0,"piso":0}'::jsonb;
  elsif jsonb_typeof(v_entry) = 'number' then
    v_entry := jsonb_build_object('cedis', 0, 'piso', coalesce((v_entry #>> '{}')::integer, 0));
  end if;

  if v_ubi = 'cedis' then
    v_antes := coalesce((v_entry ->> 'cedis')::integer, v_cedis_central, v_stock_cedis, 0);
    v_despues := v_antes + p_delta;
    v_piso_suc := coalesce((v_entry ->> 'piso')::integer, 0);
    v_entry := jsonb_build_object('cedis', v_despues, 'piso', v_piso_suc);
  else
    v_antes := coalesce((v_entry ->> 'piso')::integer, 0);
    v_despues := v_antes + p_delta;
    v_cedis_central := case
      when v_suc = 'CEDIS' then coalesce((v_entry ->> 'cedis')::integer, v_stock_cedis, 0)
      else 0
    end;
    v_entry := jsonb_build_object('cedis', v_cedis_central, 'piso', v_despues);
  end if;

  v_map := jsonb_set(v_map, array[v_suc], v_entry, true);

  v_cedis_central := coalesce((v_map -> 'CEDIS' ->> 'cedis')::integer, v_stock_cedis, 0);
  v_piso_suc := coalesce((v_map -> v_suc ->> 'piso')::integer, 0);
  v_map := jsonb_set(
    v_map,
    array['CEDIS'],
    jsonb_build_object(
      'cedis', v_cedis_central,
      'piso', coalesce((v_map -> 'CEDIS' ->> 'piso')::integer, 0)
    ),
    true
  );
  -- MAIN no guarda inventario CEDIS.
  v_map := jsonb_set(
    v_map,
    array['MAIN'],
    jsonb_build_object(
      'cedis', 0,
      'piso', coalesce((v_map -> 'MAIN' ->> 'piso')::integer, 0)
    ),
    true
  );

  update public.productos
  set
    stock_sucursales = v_map,
    stock = v_piso_suc,
    stock_cedis = greatest(0, v_cedis_central)
  where id = p_producto_id;

  return jsonb_build_object(
    'ok', true,
    'antes', v_antes,
    'despues', v_despues,
    'sucursal', v_suc,
    'ubicacion', v_ubi,
    'stock_sucursales', v_map,
    'stock', v_piso_suc,
    'stock_cedis', greatest(0, v_cedis_central)
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
  v_cedis_central integer;
  v_piso_suc integer;
  v_stock_cedis integer;
  v_main_cedis_legacy integer;
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
    v_suc := 'CEDIS';
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

  v_main_cedis_legacy := coalesce((v_map -> 'MAIN' ->> 'cedis')::integer, 0);
  v_cedis_central := coalesce((v_map -> 'CEDIS' ->> 'cedis')::integer, 0);
  if v_main_cedis_legacy > 0 then
    v_cedis_central := v_cedis_central + v_main_cedis_legacy;
    v_map := jsonb_set(
      v_map,
      array['CEDIS'],
      jsonb_build_object(
        'cedis', v_cedis_central,
        'piso', coalesce((v_map -> 'CEDIS' ->> 'piso')::integer, 0)
      ),
      true
    );
    v_map := jsonb_set(
      v_map,
      array['MAIN'],
      jsonb_build_object(
        'cedis', 0,
        'piso', coalesce((v_map -> 'MAIN' ->> 'piso')::integer, 0)
      ),
      true
    );
  end if;

  v_entry := v_map -> v_suc;
  if v_entry is null or jsonb_typeof(v_entry) = 'null' then
    v_entry := '{"cedis":0,"piso":0}'::jsonb;
  elsif jsonb_typeof(v_entry) = 'number' then
    v_entry := jsonb_build_object('cedis', 0, 'piso', coalesce((v_entry #>> '{}')::integer, 0));
  end if;

  if v_ubi = 'cedis' then
    v_antes := coalesce((v_entry ->> 'cedis')::integer, v_cedis_central, v_stock_cedis, 0);
    v_piso_suc := coalesce((v_entry ->> 'piso')::integer, 0);
    v_entry := jsonb_build_object('cedis', v_despues, 'piso', v_piso_suc);
  else
    v_antes := coalesce((v_entry ->> 'piso')::integer, 0);
    v_cedis_central := case
      when v_suc = 'CEDIS' then coalesce((v_entry ->> 'cedis')::integer, v_stock_cedis, 0)
      else 0
    end;
    v_entry := jsonb_build_object('cedis', v_cedis_central, 'piso', v_despues);
  end if;

  v_map := jsonb_set(v_map, array[v_suc], v_entry, true);

  v_cedis_central := coalesce((v_map -> 'CEDIS' ->> 'cedis')::integer, v_stock_cedis, 0);
  v_piso_suc := coalesce((v_map -> v_suc ->> 'piso')::integer, 0);
  v_map := jsonb_set(
    v_map,
    array['CEDIS'],
    jsonb_build_object(
      'cedis', v_cedis_central,
      'piso', coalesce((v_map -> 'CEDIS' ->> 'piso')::integer, 0)
    ),
    true
  );
  v_map := jsonb_set(
    v_map,
    array['MAIN'],
    jsonb_build_object(
      'cedis', 0,
      'piso', coalesce((v_map -> 'MAIN' ->> 'piso')::integer, 0)
    ),
    true
  );

  update public.productos
  set
    stock_sucursales = v_map,
    stock = v_piso_suc,
    stock_cedis = greatest(0, v_cedis_central)
  where id = p_producto_id;

  return jsonb_build_object(
    'ok', true,
    'antes', v_antes,
    'despues', v_despues,
    'sucursal', v_suc,
    'ubicacion', v_ubi,
    'stock_sucursales', v_map,
    'stock', v_piso_suc,
    'stock_cedis', greatest(0, v_cedis_central)
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
  'Delta atómico piso/cedis con FOR UPDATE; CEDIS empresa en sucursal CEDIS (no MAIN).';
comment on function public.aplicar_set_stock_ubicacion(text, text, text, integer) is
  'Set atómico de piso/cedis (conteos físicos) con FOR UPDATE.';
