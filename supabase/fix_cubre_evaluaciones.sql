-- =============================================================================
-- POS 3B — Evaluaciones de planta sobre CT (cubre turno)
-- El empleado de planta / cajero califica al CT tras la cobertura.
-- Ejecutar en Supabase → SQL Editor (después de fix_cubre_solicitudes.sql).
-- =============================================================================

create table if not exists public.pos_cubre_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.pos_cubre_solicitudes(id) on delete cascade,
  sucursal_id text not null,
  fecha date not null,
  ct_rh_id uuid,
  ct_nombre text not null,
  evaluado_por_id text,
  evaluado_por_nombre text,
  -- Criterios (true = hubo problema / bandera negativa)
  consume_mucho boolean not null default false,
  faltante_cigarro boolean not null default false,
  faltante_dinero boolean not null default false,
  quejas_cliente boolean not null default false,
  llego_tarde boolean not null default false,
  trato_malo boolean not null default false,
  desorden_caja boolean not null default false,
  otro_problema boolean not null default false,
  calificacion smallint check (calificacion is null or (calificacion >= 1 and calificacion <= 5)),
  comentario text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_cubre_evaluaciones_solicitud_unica unique (solicitud_id)
);

create index if not exists idx_cubre_eval_ct
  on public.pos_cubre_evaluaciones (ct_rh_id, fecha desc);
create index if not exists idx_cubre_eval_suc
  on public.pos_cubre_evaluaciones (sucursal_id, fecha desc);

comment on table public.pos_cubre_evaluaciones is
  'Review del empleado de planta sobre el CT tras cubrir. Banderas = problemas detectados.';
comment on column public.pos_cubre_evaluaciones.calificacion is
  '1=muy mal … 5=excelente (opcional).';

alter table public.pos_cubre_evaluaciones enable row level security;

drop policy if exists pos_cubre_evaluaciones_anon_all on public.pos_cubre_evaluaciones;
create policy pos_cubre_evaluaciones_anon_all on public.pos_cubre_evaluaciones
  for all to anon, authenticated
  using (true)
  with check (true);
