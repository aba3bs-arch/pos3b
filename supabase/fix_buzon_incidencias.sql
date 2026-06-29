-- =============================================================================
-- POS 3B — Buzón de incidencias de tienda
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.pos_incidencias (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  titulo text not null,
  descripcion text,
  categoria text default 'otro',
  prioridad text default 'normal',
  estado text default 'abierta',
  reportado_por text,
  resolucion text,
  atendida_por text,
  created_at timestamptz default now(),
  atendida_at timestamptz
);

create index if not exists idx_pos_incidencias_estado on public.pos_incidencias (estado, created_at desc);
create index if not exists idx_pos_incidencias_sucursal on public.pos_incidencias (sucursal_id, created_at desc);

alter table public.pos_incidencias enable row level security;
drop policy if exists "pos_incidencias_anon_rw" on public.pos_incidencias;
create policy "pos_incidencias_anon_rw" on public.pos_incidencias for all using (true) with check (true);
