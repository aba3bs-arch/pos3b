-- =============================================================================
-- POS 3B — Conciliaciones Abarrotes (Smoking)
-- Ejecutar en Supabase → SQL Editor → pegar todo → Run
-- Seguro re-ejecutar (IF NOT EXISTS).
-- =============================================================================
-- Sella cobros del repartidor (Recolección) vs gastos Smoking de Corte Abarrotes.
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

create index if not exists idx_conciliaciones_abarrotes_periodo
  on public.conciliaciones_abarrotes (desde, hasta, created_at desc);

create index if not exists idx_conciliaciones_abarrotes_suc
  on public.conciliaciones_abarrotes (sucursal_id, created_at desc)
  where sucursal_id is not null;

alter table public.conciliaciones_abarrotes enable row level security;

drop policy if exists "conciliaciones_abarrotes_anon_rw" on public.conciliaciones_abarrotes;
create policy "conciliaciones_abarrotes_anon_rw" on public.conciliaciones_abarrotes
  for all using (true) with check (true);

comment on table public.conciliaciones_abarrotes is
  'Conciliación Contabilidad: cobros Recolección del repartidor vs gastos Smoking de Corte Abarrotes.';
