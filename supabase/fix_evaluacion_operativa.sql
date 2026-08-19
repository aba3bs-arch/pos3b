-- POS 3B — Evaluación Operativa FA3B-014 (auditor → personal de tienda)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)

create table if not exists public.evaluacion_operativa (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  fecha date not null,
  encargado_nombre text not null default '',
  encargado_id text,
  auditor_nombre text default '',
  auditor_id text,
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrado')),
  comentarios text default '',
  puntuacion_total numeric(8,2) default 0,
  puntuacion_pct numeric(6,2) default 0,
  detalle jsonb default '{}'::jsonb,
  cerrado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_evaluacion_operativa_fecha
  on public.evaluacion_operativa (fecha desc);

create index if not exists idx_evaluacion_operativa_sucursal
  on public.evaluacion_operativa (sucursal_id, fecha desc);

create index if not exists idx_evaluacion_operativa_estado
  on public.evaluacion_operativa (estado);

alter table public.evaluacion_operativa enable row level security;

drop policy if exists "evaluacion_operativa_anon_rw" on public.evaluacion_operativa;
create policy "evaluacion_operativa_anon_rw" on public.evaluacion_operativa
  for all using (true) with check (true);

comment on table public.evaluacion_operativa is
  'FA3B-014: evaluación operativa del personal (auditor). detalle jsonb = tickets, piso, preguntas aleatorias.';
