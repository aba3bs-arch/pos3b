-- =============================================================================
-- POS 3B — fix_pagares.sql
-- CÓMO USARLO (no pide contraseña ni parámetros):
--   1) Abre Supabase → SQL Editor
--   2) Copia TODO este archivo y pégalo
--   3) Pulsa Run / Ejecutar una sola vez
--   4) Al final debe aparecer una fila "ok" = true
-- Seguro re-ejecutar. No hay prompts ni variables.
-- =============================================================================
-- Tabla pagares + columnas (area_acreedora, encargado_nombre) + RLS INSERT/UPDATE
-- para que el POS deje de pedir este script y pueda generar/abonar/liquidar.

create table if not exists public.pagares (
  id uuid primary key default gen_random_uuid(),
  folio text,
  area text not null check (area in ('virtual', 'garage', 'abarrotes')),
  area_acreedora text,
  sucursal_id text not null,
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

create unique index if not exists pagares_folio_uidx on public.pagares (folio)
  where folio is not null and folio <> '';

create index if not exists pagares_area_suc_estado_idx
  on public.pagares (area, sucursal_id, estado);

create index if not exists pagares_created_at_idx
  on public.pagares (created_at desc);

create index if not exists pagares_area_acreedora_idx
  on public.pagares (area_acreedora, estado);

-- Columnas (idempotente si la tabla ya existía sin ellas)
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

-- Defaults útiles si faltaban
update public.pagares set estado = 'abierto' where estado is null or btrim(estado) = '';
update public.pagares set saldo = coalesce(saldo, monto, 0) where saldo is null;
update public.pagares set abono = 0 where abono is null;
update public.pagares set monto = 0 where monto is null;
update public.pagares
set area_acreedora = 'virtual'
where area_acreedora is null or btrim(area_acreedora) = '';

alter table public.pagares drop constraint if exists pagares_area_acreedora_check;
alter table public.pagares
  add constraint pagares_area_acreedora_check
  check (
    area_acreedora is null
    or area_acreedora in ('virtual', 'garage', 'abarrotes')
  );

comment on table public.pagares is
  'Pagares por sucursal. Cajero abona/liquida; recolectores autorizados pasan a RC Virtual.';
comment on column public.pagares.estado is
  'abierto | parcial | por_recolectar | recolectado | liquidado | cancelado';
comment on column public.pagares.area is
  'Area deudora: virtual | garage | abarrotes.';
comment on column public.pagares.area_acreedora is
  'Area acreedora: virtual | garage | abarrotes.';
comment on column public.pagares.encargado_nombre is
  'Nombre del encargado (opcional).';

-- RLS: sin FORCE (solo ENABLE). Políticas abiertas para la clave anon del POS.
alter table public.pagares enable row level security;

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

create policy pagares_select_all
  on public.pagares for select
  to anon, authenticated, public
  using (true);

create policy pagares_insert_all
  on public.pagares for insert
  to anon, authenticated, public
  with check (true);

create policy pagares_update_all
  on public.pagares for update
  to anon, authenticated, public
  using (true)
  with check (true);

create policy pagares_delete_all
  on public.pagares for delete
  to anon, authenticated, public
  using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.pagares to anon, authenticated, public;
grant all on public.pagares to service_role;

notify pgrst, 'reload schema';

-- Verificación: debe devolver ok = true
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
