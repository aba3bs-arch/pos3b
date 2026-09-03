-- =============================================================================
-- POS 3B — Conciliaciones Abarrotes
-- Ejecutar en Supabase → SQL Editor → pegar todo → Run
-- Seguro re-ejecutar (IF NOT EXISTS).
-- =============================================================================
-- Sella lo que colecta el repartidor (recolecciones + cobros de crédito)
-- vs gastos PROVEEDORES en efectivo del Corte Abarrotes.
-- Sin esta tabla el módulo calcula bien, pero no puede sellar ni guardar historial.
-- =============================================================================

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
  estatus text not null default 'sellada'
    check (estatus in ('sellada', 'anulada')),
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

alter table public.conciliaciones_abarrotes enable row level security;

drop policy if exists "conciliaciones_abarrotes_anon_rw" on public.conciliaciones_abarrotes;
create policy "conciliaciones_abarrotes_anon_rw" on public.conciliaciones_abarrotes
  for all using (true) with check (true);

comment on table public.conciliaciones_abarrotes is
  'Conciliación Contabilidad: lo que colecta el repartidor (recolecciones + créditos) vs gastos PROVEEDORES de Corte Abarrotes en efectivo.';

comment on column public.conciliaciones_abarrotes.detalle is
  'JSON v1: entradas[], salidas[], resumen{totalEntradas,totalSalidas,diferencia,texto}.';

comment on column public.conciliaciones_abarrotes.estatus is
  'sellada | anulada';
