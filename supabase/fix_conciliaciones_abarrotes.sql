-- =============================================================================
-- POS 3B — Conciliaciones Abarrotes (Smoking)
-- Supabase → SQL Editor → pegar TODO → Run
-- Seguro re-ejecutar.
-- =============================================================================
-- Si la tabla “no se puede abrir” en Table Editor o la app dice que falta:
-- este script crea la tabla, columnas, índices, RLS y GRANTS (anon/authenticated).
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.conciliaciones_abarrotes (
  id uuid primary key default gen_random_uuid(),
  folio text,
  desde date not null,
  hasta date not null,
  sucursal_id text,
  repartidor_id text,
  proveedor_filtro text,
  total_entradas numeric(14,2) not null default 0,
  total_salidas numeric(14,2) not null default 0,
  diferencia numeric(14,2) not null default 0,
  detalle jsonb not null default '{}'::jsonb,
  notas text,
  estatus text not null default 'sellada',
  usuario_id text,
  usuario_nombre text,
  created_at timestamptz not null default now(),
  anulado_at timestamptz,
  anulado_por text,
  motivo_anulacion text
);

-- Columnas por si la tabla ya existía incompleta
alter table public.conciliaciones_abarrotes add column if not exists folio text;
alter table public.conciliaciones_abarrotes add column if not exists desde date;
alter table public.conciliaciones_abarrotes add column if not exists hasta date;
alter table public.conciliaciones_abarrotes add column if not exists sucursal_id text;
alter table public.conciliaciones_abarrotes add column if not exists repartidor_id text;
alter table public.conciliaciones_abarrotes add column if not exists proveedor_filtro text;
alter table public.conciliaciones_abarrotes add column if not exists total_entradas numeric(14,2) default 0;
alter table public.conciliaciones_abarrotes add column if not exists total_salidas numeric(14,2) default 0;
alter table public.conciliaciones_abarrotes add column if not exists diferencia numeric(14,2) default 0;
alter table public.conciliaciones_abarrotes add column if not exists detalle jsonb default '{}'::jsonb;
alter table public.conciliaciones_abarrotes add column if not exists notas text;
alter table public.conciliaciones_abarrotes add column if not exists estatus text default 'sellada';
alter table public.conciliaciones_abarrotes add column if not exists usuario_id text;
alter table public.conciliaciones_abarrotes add column if not exists usuario_nombre text;
alter table public.conciliaciones_abarrotes add column if not exists created_at timestamptz default now();
alter table public.conciliaciones_abarrotes add column if not exists anulado_at timestamptz;
alter table public.conciliaciones_abarrotes add column if not exists anulado_por text;
alter table public.conciliaciones_abarrotes add column if not exists motivo_anulacion text;

-- Defaults / nulls seguros
update public.conciliaciones_abarrotes set total_entradas = 0 where total_entradas is null;
update public.conciliaciones_abarrotes set total_salidas = 0 where total_salidas is null;
update public.conciliaciones_abarrotes set diferencia = 0 where diferencia is null;
update public.conciliaciones_abarrotes set detalle = '{}'::jsonb where detalle is null;
update public.conciliaciones_abarrotes set estatus = 'sellada' where estatus is null or estatus = '';
update public.conciliaciones_abarrotes set created_at = now() where created_at is null;

-- Check de estatus (drop + add para poder re-ejecutar)
alter table public.conciliaciones_abarrotes drop constraint if exists conciliaciones_abarrotes_estatus_check;
alter table public.conciliaciones_abarrotes
  add constraint conciliaciones_abarrotes_estatus_check
  check (estatus in ('sellada', 'anulada'));

create unique index if not exists conciliaciones_abarrotes_folio_uidx
  on public.conciliaciones_abarrotes (folio)
  where folio is not null and folio <> '';

create index if not exists idx_conciliaciones_abarrotes_periodo
  on public.conciliaciones_abarrotes (desde, hasta, created_at desc);

create index if not exists idx_conciliaciones_abarrotes_suc
  on public.conciliaciones_abarrotes (sucursal_id, created_at desc)
  where sucursal_id is not null;

create index if not exists idx_conciliaciones_abarrotes_estatus
  on public.conciliaciones_abarrotes (estatus, created_at desc);

-- Permisos API (sin esto Table Editor / PostgREST no pueden “abrir” la tabla)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.conciliaciones_abarrotes to anon, authenticated;
grant all on table public.conciliaciones_abarrotes to service_role, postgres;

alter table public.conciliaciones_abarrotes enable row level security;
alter table public.conciliaciones_abarrotes force row level security;

drop policy if exists "conciliaciones_abarrotes_anon_rw" on public.conciliaciones_abarrotes;
drop policy if exists conciliaciones_abarrotes_anon_all on public.conciliaciones_abarrotes;
drop policy if exists conciliaciones_abarrotes_auth_all on public.conciliaciones_abarrotes;

create policy conciliaciones_abarrotes_anon_all on public.conciliaciones_abarrotes
  for all to anon, authenticated
  using (true)
  with check (true);

comment on table public.conciliaciones_abarrotes is
  'Conciliación Contabilidad: cobros Recolección del repartidor vs gastos Smoking de Corte Abarrotes.';

comment on column public.conciliaciones_abarrotes.detalle is
  'JSON: entradas[], salidas[], tiendasSinRecoleccion[], porTienda[], resumen.';

comment on column public.conciliaciones_abarrotes.estatus is
  'sellada | anulada';

-- Refresca el schema cache de PostgREST para que aparezca en la API / Table Editor
notify pgrst, 'reload schema';

-- Verificación (debe devolver 1 fila con count >= 0)
select
  'conciliaciones_abarrotes' as tabla,
  count(*)::int as filas,
  true as ok
from public.conciliaciones_abarrotes;
