-- Ejecutar en Supabase → SQL Editor → Run
-- Repara o crea la tabla compras completa (pedido + recepción).

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  sucursal_id text,
  fecha date default (now() at time zone 'utc')::date,
  total numeric(12,2) default 0,
  notas text,
  items jsonb default '[]'::jsonb,
  items_pedido jsonb default '[]'::jsonb,
  estado text default 'recibida',
  created_at timestamptz default now()
);

alter table public.compras add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;
alter table public.compras add column if not exists sucursal_id text;
alter table public.compras add column if not exists fecha date default (now() at time zone 'utc')::date;
alter table public.compras add column if not exists total numeric(12,2) default 0;
alter table public.compras add column if not exists notas text;
alter table public.compras add column if not exists items jsonb default '[]'::jsonb;
alter table public.compras add column if not exists items_pedido jsonb default '[]'::jsonb;
alter table public.compras add column if not exists estado text default 'recibida';
alter table public.compras add column if not exists created_at timestamptz default now();

update public.compras set items = '[]'::jsonb where items is null;
update public.compras set items_pedido = '[]'::jsonb where items_pedido is null;
update public.compras set total = 0 where total is null;
update public.compras set estado = 'recibida' where estado is null or trim(estado) = '';
update public.compras set created_at = now() where created_at is null;

alter table public.compras enable row level security;
drop policy if exists "compras_anon_rw" on public.compras;
create policy "compras_anon_rw" on public.compras for all using (true) with check (true);

comment on column public.compras.items is 'Líneas recibidas en inventario (recepción).';
comment on column public.compras.items_pedido is 'Plan del pedido al proveedor (sin mover stock).';
comment on column public.compras.estado is 'pedido | recibida';

-- Verifica (debe listar id, total, items, items_pedido, estado):
-- select column_name, data_type from information_schema.columns where table_name = 'compras' order by ordinal_position;
