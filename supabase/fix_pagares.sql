-- =============================================================================
-- POS 3B — Pagarés de dinero en negativo (Virtual / Garage / Abarrotes)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Registro formal cuando admin/recolector genera un pagaré desde la alerta de
-- negativo del corte. El cajero puede abonar/liquidar sin ticket ni préstamo.
-- Aparece en Vales y Préstamos → Pagaré y en RC Virtual → Pagaré.

create table if not exists public.pagares (
  id uuid primary key default gen_random_uuid(),
  folio text,
  area text not null check (area in ('virtual', 'garage', 'abarrotes')),
  sucursal_id text not null,
  monto numeric(12, 2) not null default 0,
  saldo numeric(12, 2) not null default 0,
  abono numeric(12, 2) not null default 0,
  estado text not null default 'abierto',
  cajero_nombre text,
  cajero_id text,
  turno_nombre text,
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

alter table public.pagares add column if not exists folio text;
alter table public.pagares add column if not exists area text;
alter table public.pagares add column if not exists sucursal_id text;
alter table public.pagares add column if not exists monto numeric(12, 2);
alter table public.pagares add column if not exists saldo numeric(12, 2);
alter table public.pagares add column if not exists abono numeric(12, 2);
alter table public.pagares add column if not exists estado text;
alter table public.pagares add column if not exists cajero_nombre text;
alter table public.pagares add column if not exists cajero_id text;
alter table public.pagares add column if not exists turno_nombre text;
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

comment on table public.pagares is
  'Pagarés por negativo de corte (virtual/garage/abarrotes). Genera ticket x2; abono/liquidación de cajero sin ticket.';
comment on column public.pagares.estado is
  'abierto | parcial | liquidado | por_recolectar | recolectado';
