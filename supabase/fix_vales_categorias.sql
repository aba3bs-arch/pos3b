-- Tipos de vale permanentes (extras creados por admin) + área de corte en préstamos.
-- Supabase → SQL Editor → Run

create table if not exists public.vales_categorias (
  id text primary key,
  label text not null,
  descuenta_nomina boolean not null default false,
  activo boolean not null default true,
  fijo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text
);

alter table public.vales_categorias enable row level security;

drop policy if exists "vales_categorias_anon_rw" on public.vales_categorias;
create policy "vales_categorias_anon_rw" on public.vales_categorias
  for all to anon, authenticated
  using (true)
  with check (true);

alter table public.prestamos add column if not exists area_corte text;

comment on column public.prestamos.area_corte is 'Módulo de corte donde se carga el desembolso: virtual | abarrotes | garage';
