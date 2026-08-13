-- POS 3B — Check List operativo FA3B-017 (por tienda + fecha + turno)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)

create table if not exists public.checklist_sesiones (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  fecha date not null,
  turno text not null check (turno in ('TD', 'TN', 'SUP')),
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrado')),
  usuario_id text,
  usuario_nombre text default '',
  comentarios text default '',
  cerrado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_checklist_sesiones_unica
  on public.checklist_sesiones (sucursal_id, fecha, turno);

create index if not exists idx_checklist_sesiones_fecha
  on public.checklist_sesiones (fecha desc);

create index if not exists idx_checklist_sesiones_sucursal
  on public.checklist_sesiones (sucursal_id, fecha desc);

create table if not exists public.checklist_respuestas (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.checklist_sesiones(id) on delete cascade,
  item_codigo text not null,
  seccion_id text default '',
  estado text not null check (estado in ('ok', 'no', 'reportar')),
  comentario text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sesion_id, item_codigo)
);

create index if not exists idx_checklist_respuestas_sesion
  on public.checklist_respuestas (sesion_id);

alter table public.checklist_sesiones enable row level security;
alter table public.checklist_respuestas enable row level security;

drop policy if exists "checklist_sesiones_anon_rw" on public.checklist_sesiones;
create policy "checklist_sesiones_anon_rw" on public.checklist_sesiones
  for all using (true) with check (true);

drop policy if exists "checklist_respuestas_anon_rw" on public.checklist_respuestas;
create policy "checklist_respuestas_anon_rw" on public.checklist_respuestas
  for all using (true) with check (true);

comment on table public.checklist_sesiones is
  'Check List operativo FA3B-017: una sesión por sucursal + fecha + turno (TD/TN/SUP).';
comment on table public.checklist_respuestas is
  'Respuestas por punto (codigo 1.1, 3.2…): ok | no | reportar.';
