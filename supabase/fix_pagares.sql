-- =============================================================================
-- POS 3B — Pagarés de dinero en negativo (Virtual / Garage / Abarrotes)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Registro formal cuando admin/recolector genera un pagaré desde la alerta de
-- negativo del corte. El cajero puede abonar/liquidar sin ticket ni préstamo.
-- Aparece en Vales y Préstamos → Pagaré y en RC Virtual → Pagaré.
--
-- Incluye: área deudora (area), área acreedora (area_acreedora), encargado,
-- RLS para anon/authenticated (mismo patrón que gastos_evidencia).

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

-- Columnas (idempotente para tablas creadas con scripts anteriores)
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

-- Filas viejas sin acreedor → Virtual (RC Virtual)
update public.pagares
set area_acreedora = 'virtual'
where area_acreedora is null or btrim(area_acreedora) = '';

-- Check acreedora (safe re-run)
alter table public.pagares drop constraint if exists pagares_area_acreedora_check;
alter table public.pagares
  add constraint pagares_area_acreedora_check
  check (
    area_acreedora is null
    or area_acreedora in ('virtual', 'garage', 'abarrotes')
  );

comment on table public.pagares is
  'Pagarés por sucursal. Cajero abona/liquida; Luis Enrique/AMR/ABB/JLBB/FBBB recolectan → RC Virtual.';
comment on column public.pagares.estado is
  'abierto | parcial | por_recolectar | recolectado | liquidado | cancelado';
comment on column public.pagares.area is
  'Área deudora (quién debe): virtual | garage | abarrotes.';
comment on column public.pagares.area_acreedora is
  'Área acreedora (a quién se paga): virtual | garage | abarrotes.';
comment on column public.pagares.encargado_nombre is
  'Nombre del encargado responsable del pagaré (opcional; si vacío, línea en blanco en ticket).';
comment on column public.pagares.liquidado_por is
  'Cajero (u admin/gerente) que liquidó y dejó el total listo para recolección.';
comment on column public.pagares.rc_recibido_por is
  'Quién recolectó el pagaré (Luis Enrique / AMR / ABB / JLBB / FBBB).';

-- Permisos API (Supabase anon / authenticated)
alter table public.pagares enable row level security;

drop policy if exists "pagares_anon_rw" on public.pagares;
create policy "pagares_anon_rw"
  on public.pagares for all
  using (true) with check (true);

drop policy if exists "pagares_auth_rw" on public.pagares;
create policy "pagares_auth_rw"
  on public.pagares for all
  using (true) with check (true);

grant select, insert, update, delete on public.pagares to anon, authenticated;
grant all on public.pagares to service_role;

-- Refrescar schema cache de PostgREST (por si faltaba area_acreedora)
notify pgrst, 'reload schema';
