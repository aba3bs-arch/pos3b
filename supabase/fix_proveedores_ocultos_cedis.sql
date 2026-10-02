-- Proveedores ocultos solo en CEDIS (no borra el proveedor de tiendas).
-- Ejecutar en Supabase → SQL Editor.

create table if not exists public.pos_proveedores_ocultos_cedis (
  proveedor_id text primary key,
  oculto boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pos_proveedores_ocultos_cedis enable row level security;

drop policy if exists pos_proveedores_ocultos_cedis_anon_all on public.pos_proveedores_ocultos_cedis;
create policy pos_proveedores_ocultos_cedis_anon_all on public.pos_proveedores_ocultos_cedis
  for all to anon, authenticated
  using (true)
  with check (true);
