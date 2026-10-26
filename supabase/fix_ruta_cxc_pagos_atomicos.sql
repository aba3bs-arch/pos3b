-- Ejecutar en Supabase SQL Editor después de fix_venta_ruta_pos_v2.sql.
-- No borra ni reconstruye movimientos históricos. Seguro para volver a ejecutar.
begin;
alter table public.ruta_cxc_movimientos add column if not exists cargo_id uuid;
create index if not exists idx_ruta_cxc_cargo on public.ruta_cxc_movimientos(cargo_id);

create table if not exists public.ruta_cxc_pagos_solicitudes (
  id uuid primary key,
  entrada jsonb not null,
  resultado jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.ruta_cxc_pagos_solicitudes enable row level security;
-- Mantiene el modelo de acceso existente de ruta_cxc_movimientos.
drop policy if exists ruta_cxc_pagos_acceso on public.ruta_cxc_pagos_solicitudes;
create policy ruta_cxc_pagos_acceso on public.ruta_cxc_pagos_solicitudes
  for all to anon, authenticated using (true) with check (true);
grant select, insert on public.ruta_cxc_pagos_solicitudes to anon, authenticated;

create or replace function public.ruta_cxc_codigo(p text) returns text
language sql immutable strict set search_path = public as $$
  with codigo as (select regexp_replace(translate(upper(trim(p)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', '_', 'g') c)
  select coalesce(
    ('{"CENTRAL":"MAIN","CENTRAL_ADMIN":"MAIN","ADMINISTRACION":"MAIN",
       "CEDIS_CENTRAL":"CEDIS","ALMACEN_CENTRAL":"CEDIS","ALMACEN":"CEDIS",
       "DEL_VALLE":"3B7","DELVALLE":"3B7","PUEBLO_NUEVO":"3B2","PUEBLONUEVO":"3B2",
       "PETROLEOS":"3B3","LOMAS_DOS":"3B5","LOMASDOS":"3B5","SOLIDARIDAD":"3B6",
       "BUENOS_AIRES":"3B9","BUENOSAIRES":"3B9","EL_MEZQUITE":"3B10","ELMEZQUITE":"3B10","MEZQUITE":"3B10"}'::jsonb)->>c,
    substring(c from '^(3B[0-9]+)'), c) from codigo;
$$;

-- Impide cargos nuevos duplicados sin borrar ni alterar duplicados históricos.
create or replace function public.evitar_cargo_ruta_duplicado() returns trigger
language plpgsql security invoker set search_path = public as $$
declare referencia text;
begin
  if NEW.tipo <> 'cargo' then return NEW; end if;
  referencia := case when NEW.venta_id is not null then 'venta:'||NEW.venta_id
    when NEW.carga_id like 'rec:%' then NEW.carga_id else null end;
  if referencia is null then return NEW; end if;
  perform pg_advisory_xact_lock(hashtextextended('cargo-ruta:'||referencia,0));
  if exists(select 1 from public.ruta_cxc_movimientos c where c.tipo='cargo'
    and (case when NEW.venta_id is not null then c.venta_id=NEW.venta_id else c.carga_id=NEW.carga_id end)) then
    raise exception 'Ya existe el cargo CxC de esta venta o ficha' using errcode='23505';
  end if;
  return NEW;
end;
$$;
drop trigger if exists evitar_cargo_ruta_duplicado on public.ruta_cxc_movimientos;
create trigger evitar_cargo_ruta_duplicado before insert on public.ruta_cxc_movimientos
  for each row execute function public.evitar_cargo_ruta_duplicado();

create or replace function public.pagar_creditos_ruta_atomico(
  p_solicitud uuid, p_ids uuid[], p_monto numeric, p_sucursal text, p_cajero text
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  entrada jsonb;
  previo public.ruta_cxc_pagos_solicitudes%rowtype;
  cargo public.ruta_cxc_movimientos%rowtype;
  ficha public.transito_efectivo%rowtype;
  total numeric := 0;
  objetivo numeric;
  restante numeric;
  aplica numeric;
  parcial boolean;
  alguno_parcial boolean := false;
  suc text;
  suc_cargo text;
  folio text;
  etiqueta text;
  rec_id uuid;
  rep_id text;
  vendedor text;
  gasto_id_nuevo uuid;
  transito_id_nuevo uuid;
  resultado jsonb;
  pagados jsonb := '[]'::jsonb;
  ahora timestamptz := now();
begin
  if p_solicitud is null or coalesce(cardinality(p_ids),0)=0 or nullif(trim(p_cajero),'') is null
     or nullif(trim(p_sucursal),'') is null then
    raise exception 'Solicitud de pago incompleta';
  end if;
  if cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Hay créditos repetidos';
  end if;
  suc := public.ruta_cxc_codigo(p_sucursal);
  entrada := jsonb_build_object('ids', (select jsonb_agg(x order by x) from unnest(p_ids) x),
    'monto',p_monto,'sucursal',suc,'cajero',p_cajero);
  -- Serializa reintentos de una misma solicitud, incluso si llegan al mismo tiempo.
  perform pg_advisory_xact_lock(hashtextextended(p_solicitud::text,0));
  select * into previo from public.ruta_cxc_pagos_solicitudes where id=p_solicitud;
  if found then
    if previo.entrada <> entrada then raise exception 'Solicitud reutilizada con datos diferentes'; end if;
    return previo.resultado;
  end if;
  -- Bloqueo en orden fijo: dos sesiones no pueden pagar el mismo saldo.
  perform id from public.ruta_cxc_movimientos where id=any(p_ids) order by id for update;
  if (select count(*) from public.ruta_cxc_movimientos where id=any(p_ids)) <> cardinality(p_ids) then
    raise exception 'Algún crédito ya no existe o no es accesible';
  end if;
  for cargo in select * from public.ruta_cxc_movimientos where id=any(p_ids) loop
    if cargo.tipo <> 'cargo' or cargo.pagado_at is not null
       or lower(coalesce(nullif(cargo.estatus,''),'pendiente')) not in ('pendiente','null') then
      raise exception 'Un crédito ya fue pagado o cambió. Actualiza la consulta';
    end if;
    suc_cargo := case when cargo.cliente_tipo='sucursal' then public.ruta_cxc_codigo(cargo.cliente_id) else suc end;
    if suc_cargo <> suc then raise exception 'Los créditos no pertenecen a la sucursal seleccionada'; end if;
    if (cargo.venta_id is not null or cargo.carga_id like 'rec:%') and
      (select count(*) from public.ruta_cxc_movimientos c where c.tipo='cargo'
       and coalesce(c.estatus,'pendiente')<>'anulado' and
       (case when cargo.venta_id is not null then c.venta_id=cargo.venta_id else c.carga_id=cargo.carga_id end))>1 then
      raise exception 'Hay cargos duplicados para este folio; requiere conciliación antes de cobrar';
    end if;
    total := total + cargo.monto;
  end loop;
  objetivo := round(coalesce(p_monto,total),2);
  if objetivo <= 0 or objetivo > total or objetivo::text='NaN' then raise exception 'Monto fuera del saldo disponible'; end if;
  restante := objetivo;
  for cargo in select * from public.ruta_cxc_movimientos where id=any(p_ids) order by created_at,id loop
    exit when restante <= 0;
    aplica := least(restante,cargo.monto);
    parcial := aplica < cargo.monto;
    alguno_parcial := alguno_parcial or parcial;
    folio := coalesce(cargo.folio_venta,cargo.venta_id,cargo.id::text);
    rec_id := null;
    if cargo.carga_id like 'rec:%' then
      rec_id := substring(cargo.carga_id from 5)::uuid;
    elsif cargo.notas ~ 'transito:[0-9a-fA-F-]{36}' then
      rec_id := substring(cargo.notas from 'transito:([0-9a-fA-F-]{36})')::uuid;
    end if;
    rep_id := null;
    if rec_id is not null then
      select * into ficha from public.transito_efectivo where id=rec_id for update;
      if not found or ficha.estatus <> 'Por Cobrar' or ficha.tipo_movimiento <> 'Entrega Crédito'
        or public.ruta_cxc_codigo(ficha.sucursal_origen) <> suc or ficha.monto <> cargo.monto then
        raise exception 'La ficha de Recolecciones cambió o su saldo no coincide; requiere conciliación';
      end if;
      rep_id := ficha.repartidor_id;
    else
      select c.vendedor_id into vendedor from public.ruta_cargas c where c.id::text=cargo.carga_id;
      -- Usa el vendedor del cargo/carga, nunca el nombre del cajero que paga.
      select r.id into rep_id from public.repartidores r
        where r.activo is distinct from false and
          (r.id=regexp_replace(coalesce(vendedor,''),'^rt:','')
           or r.id=cargo.usuario_nombre
           or public.ruta_cxc_codigo(r.nombre)=public.ruta_cxc_codigo(cargo.usuario_nombre))
        order by (r.id=regexp_replace(coalesce(vendedor,''),'^rt:','')) desc, r.id limit 1;
      if rep_id is null then raise exception 'No hay recolector válido para el vendedor del crédito %; revisa Panel RT y la carga',folio; end if;
    end if;
    etiqueta := case when rec_id is not null then 'CREDITO COBRADO' else 'credito liquidado' end
      || case when parcial then ' parcial' else '' end;
    insert into public.cortes_contabilidad_gastos
      (sucursal_id,modulo,categoria,subcategoria,comentario,monto,usuario_nombre,cerrado)
    values(suc,'abarrotes',case when rec_id is not null then 'CREDITO' else 'CREDITO RUTA' end,
      case when rec_id is not null then 'COBRADO' else 'LIQUIDADO' end,
      etiqueta||' · '||folio||' · '||p_cajero,aplica,p_cajero,false) returning id into gasto_id_nuevo;
    if rec_id is not null and not parcial then
      update public.transito_efectivo set estatus='En Tránsito',tipo_movimiento='Cobro Crédito',
        cajero_nombre=p_cajero,descripcion_gasto='Crédito cobrado',usuario_liquida='No Leído',fecha_hora=ahora
        where id=rec_id returning id into transito_id_nuevo;
      if not found then raise exception 'No se pudo actualizar la ficha'; end if;
    else
      insert into public.transito_efectivo
        (sucursal_origen,repartidor_id,cajero_nombre,monto,num_traspaso,foto_url,estatus,tipo_movimiento,descripcion_gasto,fecha_hora,usuario_liquida)
      values(suc,rep_id,p_cajero,aplica,'CXC-'||gen_random_uuid()::text,
        etiqueta||' · '||folio,'En Tránsito','Venta Ruta','Crédito ruta cobrado',ahora,'No Leído')
      returning id into transito_id_nuevo;
      if rec_id is not null then
        update public.transito_efectivo set monto=cargo.monto-aplica where id=rec_id;
        if not found then raise exception 'No se pudo actualizar el remanente de la ficha'; end if;
      end if;
    end if;
    if parcial then
      update public.ruta_cxc_movimientos set monto=cargo.monto-aplica,
        notas=coalesce(cargo.notas,'')||' · abono parcial '||aplica::text where id=cargo.id;
    else
      update public.ruta_cxc_movimientos set estatus='pagado',pagado_por=p_cajero,pagado_at=ahora,gasto_id=gasto_id_nuevo where id=cargo.id;
    end if;
    if not found then raise exception 'No se pudo actualizar el cargo'; end if;
    insert into public.ruta_cxc_movimientos
      (cliente_tipo,cliente_id,cliente_nombre,tipo,monto,saldo_despues,venta_id,carga_id,folio_venta,
       metodo_pago,estatus,notas,usuario_nombre,pagado_por,pagado_at,gasto_id,cargo_id)
    values(cargo.cliente_tipo,cargo.cliente_id,cargo.cliente_nombre,'abono',aplica,
      coalesce((select sum(monto) from public.ruta_cxc_movimientos
        where cliente_tipo=cargo.cliente_tipo and
        (case when cliente_tipo='sucursal' then public.ruta_cxc_codigo(cliente_id) else cliente_id end)=
        (case when cargo.cliente_tipo='sucursal' then public.ruta_cxc_codigo(cargo.cliente_id) else cargo.cliente_id end)
        and tipo='cargo' and pagado_at is null and lower(coalesce(nullif(estatus,''),'pendiente')) in ('pendiente','null')),0),
      cargo.venta_id,cargo.carga_id,cargo.folio_venta,'efectivo','pagado',
      'Pago cajero · '||etiqueta||' · '||folio,p_cajero,p_cajero,ahora,gasto_id_nuevo,cargo.id);
    if not parcial and cargo.venta_id is not null and rec_id is null then
      update public.ruta_ventas set estado_credito='pagado',transito_id=transito_id_nuevo::text where id::text=cargo.venta_id;
      if not found then raise exception 'No se encontró la venta vinculada al crédito'; end if;
    end if;
    pagados := pagados || jsonb_build_array(jsonb_build_object('cargoId',cargo.id,'gastoId',gasto_id_nuevo,
      'transitoId',transito_id_nuevo,'monto',aplica,'parcial',parcial,'desdeRecoleccion',rec_id is not null));
    restante := restante-aplica;
  end loop;
  resultado := jsonb_build_object('ok',true,'pagados',pagados,'cajero',p_cajero,'montoPagado',objetivo,
    'parcial',alguno_parcial or objetivo<total);
  insert into public.ruta_cxc_pagos_solicitudes(id,entrada,resultado) values(p_solicitud,entrada,resultado);
  return resultado;
end;
$$;
revoke all on function public.pagar_creditos_ruta_atomico(uuid,uuid[],numeric,text,text) from public;
grant execute on function public.pagar_creditos_ruta_atomico(uuid,uuid[],numeric,text,text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
