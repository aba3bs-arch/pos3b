-- Preinventario de cajeros: plantillas y conteos que NO afectan inventario teórico.
create table if not exists public.pos_preinventario_plantillas (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  nombre text not null,
  tipo text not null default 'personal', -- personal | departamento
  departamento text,
  creado_por text,
  creado_por_id text,
  productos jsonb not null default '[]'::jsonb, -- [{id, nombre}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_preinventario_plantillas_suc_idx
  on public.pos_preinventario_plantillas (sucursal_id, updated_at desc);

create table if not exists public.pos_preinventario_sesiones (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  plantilla_id uuid references public.pos_preinventario_plantillas(id) on delete set null,
  nombre text not null,
  creado_por text,
  creado_por_id text,
  lineas jsonb not null default '[]'::jsonb, -- [{id, nombre, teorico, contado}]
  estado text not null default 'abierta', -- abierta | cerrada
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists pos_preinventario_sesiones_suc_idx
  on public.pos_preinventario_sesiones (sucursal_id, created_at desc);

alter table public.pos_preinventario_plantillas enable row level security;
alter table public.pos_preinventario_sesiones enable row level security;

drop policy if exists pos_preinventario_plantillas_all on public.pos_preinventario_plantillas;
create policy pos_preinventario_plantillas_all on public.pos_preinventario_plantillas
  for all to anon, authenticated using (true) with check (true);

drop policy if exists pos_preinventario_sesiones_all on public.pos_preinventario_sesiones;
create policy pos_preinventario_sesiones_all on public.pos_preinventario_sesiones
  for all to anon, authenticated using (true) with check (true);

comment on table public.pos_preinventario_plantillas is
  'Plantillas de preinventario (personal o por depto). No modifican stock.';
comment on table public.pos_preinventario_sesiones is
  'Conteos de preinventario. Solo control interno; no aplica a inventario teórico.';
