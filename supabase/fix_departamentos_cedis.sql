-- Departamentos propios del catálogo CEDIS (independientes del menú de tiendas).
-- Ejecutar en Supabase → SQL Editor.

create table if not exists public.pos_departamentos_cedis (
  codigo text primary key,
  etiqueta text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pos_departamentos_cedis enable row level security;

drop policy if exists pos_departamentos_cedis_anon_all on public.pos_departamentos_cedis;
create policy pos_departamentos_cedis_anon_all on public.pos_departamentos_cedis
  for all to anon, authenticated
  using (true)
  with check (true);

-- Semilla: departamentos base del catálogo CEDIS (idempotente).
insert into public.pos_departamentos_cedis (codigo, etiqueta)
values
  ('CIGARROS', 'CIGARROS'),
  ('BLUNTWRAP', 'BLUNTWRAP'),
  ('ELECTRONICOS', 'ELECTRONICOS'),
  ('ABARROTES', 'ABARROTES'),
  ('MEDICAMENTO', 'MEDICAMENTO'),
  ('ROPA', 'ROPA')
on conflict (codigo) do nothing;
