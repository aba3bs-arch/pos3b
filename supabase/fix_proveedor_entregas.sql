-- =============================================================================
-- POS 3B — Días de entrega por proveedor y sucursal
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- dia_semana: 1=Lun … 7=Dom
-- =============================================================================

create table if not exists public.proveedor_entregas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  sucursal_id text not null,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_proveedor_entregas_unico
  on public.proveedor_entregas(proveedor_id, sucursal_id, dia_semana);

create index if not exists idx_proveedor_entregas_sucursal_dia
  on public.proveedor_entregas(sucursal_id, dia_semana);

alter table public.proveedor_entregas enable row level security;

drop policy if exists "proveedor_entregas_anon_rw" on public.proveedor_entregas;
create policy "proveedor_entregas_anon_rw" on public.proveedor_entregas for all using (true) with check (true);

comment on table public.proveedor_entregas is 'Programa de visitas/entregas: qué proveedor llega qué día a cada sucursal.';
comment on column public.proveedor_entregas.dia_semana is '1=Lunes … 7=Domingo';
