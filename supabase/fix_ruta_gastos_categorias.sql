-- =============================================================================
-- POS 3B — Categorías de gastos de Venta en Ruta (catálogo editable por Admin)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.ruta_gastos_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_ruta_gastos_categorias_nombre_lower
  on public.ruta_gastos_categorias (lower(trim(nombre)));

create index if not exists idx_ruta_gastos_categorias_activo_orden
  on public.ruta_gastos_categorias (activo, orden, nombre);

alter table public.ruta_gastos_categorias enable row level security;

drop policy if exists "ruta_gastos_categorias_anon" on public.ruta_gastos_categorias;
create policy "ruta_gastos_categorias_anon" on public.ruta_gastos_categorias
  for all using (true) with check (true);

comment on table public.ruta_gastos_categorias is
  'Categorías de gasto del submódulo Venta en Ruta → Gastos (CRUD solo Admin en la app).';
