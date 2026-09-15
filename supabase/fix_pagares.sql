-- =============================================================================
-- POS 3B — fix_pagares.sql  (TABLA pagares)
-- Pegar TODO en Supabase → SQL Editor → Run (1 sola vez; se puede repetir)
-- No pide contraseña ni parámetros.
-- Al final debe salir: ok = true | politicas_rls >= 4
-- =============================================================================

-- 1) Tabla
create table if not exists public.pagares (
  id uuid primary key default gen_random_uuid(),
  folio text,
  area text not null default 'virtual',
  area_acreedora text,
  sucursal_id text not null default 'MAIN',
  monto numeric(12, 2) not null default 0,
  saldo numeric(12, 2) not null default 0,
  abono numeric(12, 2) not null default 0,
  estado text not null default 'abierto',
  cajero_nombre text,
  cajero_id text,
  turno_nombre text,
  encargado_nombre text,
  texto text,
  creado_por text,
  creado_por_rol text,
  created_at timestamptz not null default now(),
  liquidado_por text,
  liquidado_at timestamptz,
  rc_recibido_por text,
  rc_recibido_at timestamptz,
  rc_monto numeric(12, 2) default 0,
  notas text
);

-- 2) Columnas (si la tabla ya existía a medias)
alter table public.pagares add column if not exists folio text;
alter table public.pagares add column if not exists area text;
alter table public.pagares add column if not exists area_acreedora text;
alter table public.pagares add column if not exists sucursal_id text;
alter table public.pagares add column if not exists monto numeric(12, 2);
alter table public.pagares add column if not exists saldo numeric(12, 2);
alter table public.pagares add column if not exists abono numeric(12, 2);
alter table public.pagares add column if not exists estado text;
alter table public.pagares add column if not exists cajero_nombre text;
alter table public.pagares add column if not exists cajero_id text;
alter table public.pagares add column if not exists turno_nombre text;
alter table public.pagares add column if not exists encargado_nombre text;
alter table public.pagares add column if not exists texto text;
alter table public.pagares add column if not exists creado_por text;
alter table public.pagares add column if not exists creado_por_rol text;
alter table public.pagares add column if not exists created_at timestamptz;
alter table public.pagares add column if not exists liquidado_por text;
alter table public.pagares add column if not exists liquidado_at timestamptz;
alter table public.pagares add column if not exists rc_recibido_por text;
alter table public.pagares add column if not exists rc_recibido_at timestamptz;
alter table public.pagares add column if not exists rc_monto numeric(12, 2);
alter table public.pagares add column if not exists notas text;

-- 3) Rellenar nulos (evita que fallen los CHECK)
update public.pagares set area = 'virtual' where area is null or btrim(area) = '';
update public.pagares set sucursal_id = 'MAIN' where sucursal_id is null or btrim(sucursal_id) = '';
update public.pagares set estado = 'abierto' where estado is null or btrim(estado) = '';
update public.pagares set monto = 0 where monto is null;
update public.pagares set saldo = coalesce(saldo, monto, 0) where saldo is null;
update public.pagares set abono = 0 where abono is null;
update public.pagares set rc_monto = 0 where rc_monto is null;
update public.pagares set created_at = now() where created_at is null;
update public.pagares
set area_acreedora = 'virtual'
where area_acreedora is null or btrim(area_acreedora) = '';

-- Areas invalidas → virtual (por si habia datos viejos)
update public.pagares
set area = 'virtual'
where lower(area) not in ('virtual', 'garage', 'abarrotes');

update public.pagares
set area_acreedora = 'virtual'
where lower(area_acreedora) not in ('virtual', 'garage', 'abarrotes');

-- 4) CHECK de areas (seguro re-ejecutar)
alter table public.pagares drop constraint if exists pagares_area_check;
alter table public.pagares drop constraint if exists pagares_area_acreedora_check;

alter table public.pagares
  add constraint pagares_area_check
  check (area in ('virtual', 'garage', 'abarrotes'));

alter table public.pagares
  add constraint pagares_area_acreedora_check
  check (area_acreedora in ('virtual', 'garage', 'abarrotes'));

-- 5) Indices
create unique index if not exists pagares_folio_uidx on public.pagares (folio)
  where folio is not null and folio <> '';

create index if not exists pagares_area_suc_estado_idx
  on public.pagares (area, sucursal_id, estado);

create index if not exists pagares_created_at_idx
  on public.pagares (created_at desc);

create index if not exists pagares_area_acreedora_idx
  on public.pagares (area_acreedora, estado);

-- 6) RLS + permisos (mismo patron que gastos_evidencia)
alter table public.pagares enable row level security;

-- Quitar TODAS las politicas viejas (cualquier nombre)
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'pagares'
  loop
    execute format('drop policy if exists %I on public.pagares', r.policyname);
  end loop;
end $$;

-- Por si quedaron con comillas / nombres viejos
drop policy if exists "pagares_select_all" on public.pagares;
drop policy if exists "pagares_insert_all" on public.pagares;
drop policy if exists "pagares_update_all" on public.pagares;
drop policy if exists "pagares_delete_all" on public.pagares;
drop policy if exists pagares_select_all on public.pagares;
drop policy if exists pagares_insert_all on public.pagares;
drop policy if exists pagares_update_all on public.pagares;
drop policy if exists pagares_delete_all on public.pagares;
drop policy if exists "pagares_anon_rw" on public.pagares;
drop policy if exists "pagares_auth_rw" on public.pagares;
drop policy if exists pagares_anon_rw on public.pagares;
drop policy if exists pagares_auth_rw on public.pagares;

-- Politicas abiertas para la clave publica (anon) del POS
create policy "pagares_anon_rw"
  on public.pagares for all
  to anon
  using (true)
  with check (true);

create policy "pagares_auth_rw"
  on public.pagares for all
  to authenticated
  using (true)
  with check (true);

create policy "pagares_public_rw"
  on public.pagares for all
  to public
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.pagares to anon, authenticated, public;
grant all on public.pagares to service_role;

notify pgrst, 'reload schema';

-- 7) Verificacion
select
  true as ok,
  to_regclass('public.pagares') is not null as tabla_ok,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pagares' and column_name = 'area_acreedora'
  ) as tiene_area_acreedora,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pagares' and column_name = 'encargado_nombre'
  ) as tiene_encargado_nombre,
  (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'pagares'
  ) as politicas_rls;
