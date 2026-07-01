-- =============================================================================
-- POS 3B — Incidencias: subcategoría + catálogo editable
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.pos_incidencias add column if not exists subcategoria text;

create table if not exists public.pos_incidencias_catalogo (
  id uuid primary key default gen_random_uuid(),
  categoria_id text not null unique,
  etiqueta text not null,
  subcategorias jsonb default '[]'::jsonb,
  es_personalizada boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_pos_incidencias_catalogo_id on public.pos_incidencias_catalogo (categoria_id);

alter table public.pos_incidencias_catalogo enable row level security;
drop policy if exists "pos_incidencias_catalogo_anon_rw" on public.pos_incidencias_catalogo;
create policy "pos_incidencias_catalogo_anon_rw" on public.pos_incidencias_catalogo for all using (true) with check (true);

comment on table public.pos_incidencias_catalogo is 'Categorías y subcategorías de incidencias (POS Incidencias / Buzón)';
comment on column public.pos_incidencias.subcategoria is 'Subcategoría opcional dentro de la categoría del reporte';
