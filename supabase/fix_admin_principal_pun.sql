-- =============================================================================
-- Administrador principal oculto + PUN
-- Supabase → SQL Editor → Run
--
-- 1. Crea la cuenta oculta del administrador principal (no sale en Usuarios).
-- 2. Andrés Marrero / AMR pasa a Gerente, sigue en Usuarios y en nómina, con su PIN.
-- 3. El PUN queda en una tabla que la app no puede listar. Solo entra quien lo conoce.
--
-- Antes de ejecutar, cambia el texto de la última línea por el PUN que vas a usar.
-- No dejes ese número en el repositorio.
-- Seguro re-ejecutar: si la cuenta ya existe, solo actualiza el PUN.
-- =============================================================================

alter table public.usuarios
  add column if not exists es_admin_principal boolean not null default false;

alter table public.usuarios
  add column if not exists excluir_nomina boolean not null default false;

comment on column public.usuarios.es_admin_principal is
  'Cuenta oculta del administrador principal. No se lista ni se puede dar de baja desde la app.';

create table if not exists public.admin_principal_acceso (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  pun text not null unique,
  updated_at timestamptz not null default now()
);

revoke all on table public.admin_principal_acceso from public, anon, authenticated;

create or replace function public.norm_nombre_persona(t text)
returns text
language sql
immutable
as $$
  select lower(translate(trim(coalesce(t, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'));
$$;

create or replace function public.proteger_admin_principal()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.es_admin_principal is true then
    if current_setting('app.permitir_admin_principal', true) is distinct from 'on' then
      raise exception 'El administrador principal no se puede eliminar.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.es_admin_principal is true then
    if current_setting('app.permitir_admin_principal', true) is distinct from 'on' then
      if new.rol is distinct from old.rol
         or new.activo is distinct from old.activo
         or new.es_admin_principal is distinct from old.es_admin_principal
         or new.nombre is distinct from old.nombre
         or new.pin is distinct from old.pin
         or coalesce(new.excluir_nomina, false) is distinct from coalesce(old.excluir_nomina, false)
      then
        raise exception 'El administrador principal no se puede modificar ni excluir.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists usuarios_proteger_admin_principal on public.usuarios;
create trigger usuarios_proteger_admin_principal
  before update or delete on public.usuarios
  for each row
  execute function public.proteger_admin_principal();

create or replace function public.entrar_con_pun(p_pun text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.usuarios%rowtype;
begin
  if p_pun is null or length(trim(p_pun)) < 4 then
    return null;
  end if;
  select us.* into u
  from public.usuarios us
  join public.admin_principal_acceso a on a.usuario_id = us.id
  where a.pun = trim(p_pun)
    and us.es_admin_principal is true
    and us.activo is not false
  limit 1;
  if u.id is null then
    return null;
  end if;
  return (to_jsonb(u) - 'pin');
end;
$$;

create or replace function public.fijar_pun_admin_principal(p_actual text, p_nuevo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if p_nuevo is null or length(trim(p_nuevo)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'El PUN nuevo debe tener al menos 4 caracteres.');
  end if;
  if upper(trim(p_nuevo)) in ('TU-PUN-AQUI', 'CAMBIA-ESTE-PUN', 'PUN') then
    return jsonb_build_object('ok', false, 'error', 'Elige un PUN propio. No uses el texto de ejemplo.');
  end if;
  select a.usuario_id into uid
  from public.admin_principal_acceso a
  where a.pun = trim(p_actual);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'El PUN actual no coincide.');
  end if;
  update public.admin_principal_acceso
  set pun = trim(p_nuevo), updated_at = now()
  where usuario_id = uid;
  return jsonb_build_object('ok', true, 'pun', trim(p_nuevo));
end;
$$;

revoke all on function public.entrar_con_pun(text) from public;
revoke all on function public.fijar_pun_admin_principal(text, text) from public;
grant execute on function public.entrar_con_pun(text) to anon, authenticated;
grant execute on function public.fijar_pun_admin_principal(text, text) to anon, authenticated;

create or replace function public.preparar_admin_principal(p_pun text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  n_andres int := 0;
  pin_interno text;
begin
  if p_pun is null or length(trim(p_pun)) < 4 then
    raise exception 'Indica un PUN de al menos 4 caracteres.';
  end if;
  if upper(trim(p_pun)) in ('TU-PUN-AQUI', 'CAMBIA-ESTE-PUN', 'PUN') then
    raise exception 'Cambia TU-PUN-AQUI por el número que vas a usar. No lo dejes de ejemplo.';
  end if;

  perform set_config('app.permitir_admin_principal', 'on', true);

  -- Andrés Marrero / AMR queda como gerente, visible, en nómina, con el PIN que ya tiene.
  update public.usuarios
  set rol = 'Gerente',
      es_admin_principal = false,
      excluir_nomina = false,
      activo = true
  where es_admin_principal is not true
    and (
      public.norm_nombre_persona(nombre) = 'amr'
      or public.norm_nombre_persona(nombre) like '%marrero%'
    );
  get diagnostics n_andres = row_count;

  begin
    update public.usuarios
    set nomina_pagador = coalesce(nullif(nomina_pagador, ''), 'abarrotes')
    where rol = 'Gerente'
      and (
        public.norm_nombre_persona(nombre) = 'amr'
        or public.norm_nombre_persona(nombre) like '%marrero%'
      );
  exception
    when undefined_column then
      null;
  end;

  select id into uid
  from public.usuarios
  where es_admin_principal is true
  order by created_at nulls last
  limit 1;

  if uid is null then
    pin_interno := md5(random()::text || clock_timestamp()::text);
    insert into public.usuarios (
      nombre, pin, rol, sucursal_id, activo, es_admin_principal, excluir_nomina, tipo_empleado
    )
    values (
      'Administrador principal',
      pin_interno,
      'Administrador',
      'MAIN',
      true,
      true,
      true,
      'indirecto'
    )
    returning id into uid;
  else
    update public.usuarios
    set rol = 'Administrador',
        activo = true,
        es_admin_principal = true,
        excluir_nomina = true,
        sucursal_id = coalesce(nullif(sucursal_id, ''), 'MAIN')
    where id = uid;
  end if;

  insert into public.admin_principal_acceso (usuario_id, pun)
  values (uid, trim(p_pun))
  on conflict (usuario_id) do update
  set pun = excluded.pun, updated_at = now();

  return format(
    'Listo. Andrés/AMR actualizados a Gerente: %s. El administrador principal entra solo con el PUN y no aparece en las listas.',
    n_andres
  );
end;
$$;

revoke all on function public.preparar_admin_principal(text) from public, anon, authenticated;

-- Cuando este script ya corrió, ejecuta aparte (cambia el texto por tu PUN; no lo subas al repositorio):
-- select public.preparar_admin_principal('TU-PUN-AQUI');
