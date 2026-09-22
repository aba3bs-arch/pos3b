-- Tipos de vale permanentes (extras creados por admin) + subcategorías + área de corte en préstamos.
-- Supabase → SQL Editor → Run

create table if not exists public.vales_categorias (
  id text primary key,
  label text not null,
  descuenta_nomina boolean not null default false,
  activo boolean not null default true,
  fijo boolean not null default false,
  subcategorias jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by text
);

alter table public.vales_categorias
  add column if not exists subcategorias jsonb not null default '[]'::jsonb;

alter table public.vales_categorias enable row level security;

drop policy if exists "vales_categorias_anon_rw" on public.vales_categorias;
create policy "vales_categorias_anon_rw" on public.vales_categorias
  for all to anon, authenticated
  using (true)
  with check (true);

alter table public.prestamos add column if not exists area_corte text;

comment on column public.prestamos.area_corte is 'Módulo de corte donde se carga el desembolso: virtual | abarrotes | garage';

-- Subcategoría y detalle (3er nivel) opcionales al generar un vale.
alter table public.vales add column if not exists subcategoria text;
alter table public.vales add column if not exists detalle text;

comment on column public.vales.subcategoria is 'Subcategoría opcional del tipo de vale (catálogo vales_categorias.subcategorias).';
comment on column public.vales.detalle is 'Detalle / 3er nivel opcional bajo la subcategoría (subcategorias[].detalles).';
comment on column public.vales_categorias.subcategorias is 'Array JSON [{id,label,detalles:[{id,label}]}] de subcategorías y detalles del tipo de vale.';
