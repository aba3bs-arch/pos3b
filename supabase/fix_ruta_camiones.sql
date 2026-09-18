-- =============================================================================
-- POS 3B — Camiones de Venta en Ruta (asignados a repartidor / Panel RT)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.ruta_camiones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  placa text,
  alias text,
  usuario_id text,
  repartidor_id text,
  activo boolean not null default true,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_ruta_camiones_codigo
  on public.ruta_camiones (lower(codigo));

-- Un solo camión activo por usuario Repartidor
create unique index if not exists idx_ruta_camiones_usuario_activo
  on public.ruta_camiones (usuario_id)
  where usuario_id is not null and activo = true;

-- Un solo camión activo por recolector Panel RT
create unique index if not exists idx_ruta_camiones_repartidor_activo
  on public.ruta_camiones (repartidor_id)
  where repartidor_id is not null and activo = true;

create index if not exists idx_ruta_camiones_activo
  on public.ruta_camiones (activo, codigo);

alter table public.ruta_cargas
  add column if not exists camion_id uuid references public.ruta_camiones(id);

create index if not exists idx_ruta_cargas_camion
  on public.ruta_cargas (camion_id)
  where camion_id is not null;

alter table public.ruta_camiones enable row level security;

drop policy if exists "ruta_camiones_anon_rw" on public.ruta_camiones;
create policy "ruta_camiones_anon_rw" on public.ruta_camiones
  for all using (true) with check (true);

grant select, insert, update, delete on public.ruta_camiones to anon, authenticated;
