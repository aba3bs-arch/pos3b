-- =============================================================================
-- POS 3B — Tercer nivel del catálogo IE: detalle (sub-subcategoría)
-- Categoría → Subcategoría → Detalle
-- Ejecutar en Supabase → SQL Editor. Seguro re-ejecutar.
-- =============================================================================

create table if not exists public.cont_virtual_detalles (
  id text primary key,
  subcategoria_id text not null references public.cont_virtual_subcategorias(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true,
  fijo boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_cont_virtual_det_sub on public.cont_virtual_detalles (subcategoria_id);

alter table public.cont_virtual_egresos
  add column if not exists detalle_id text;

alter table public.cont_virtual_egresos
  add column if not exists detalle_nombre text;

alter table public.cont_virtual_detalles enable row level security;

drop policy if exists "cont_virtual_detalles_anon_rw" on public.cont_virtual_detalles;
create policy "cont_virtual_detalles_anon_rw" on public.cont_virtual_detalles for all using (true) with check (true);

comment on table public.cont_virtual_detalles is
  'Tercer nivel del catálogo IE (Virtual/Abarrotes): Categoría → Subcategoría → Detalle.';
