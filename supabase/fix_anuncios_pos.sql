-- =============================================================================
-- POS 3B — Anuncios en pantalla principal del POS
-- Seguro re-ejecutar.
-- =============================================================================

create table if not exists public.anuncios_pos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text,
  asunto text not null,
  descripcion text not null,
  duracion_horas numeric(8,2) not null default 24,
  activo boolean not null default true,
  creado_por text,
  expira_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_anuncios_pos_activo on public.anuncios_pos (activo, expira_at desc);

alter table public.anuncios_pos enable row level security;

drop policy if exists "anuncios_pos_anon_rw" on public.anuncios_pos;
create policy "anuncios_pos_anon_rw" on public.anuncios_pos for all using (true) with check (true);
