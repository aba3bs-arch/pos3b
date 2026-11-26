-- Gastos de RC/Clientes ext. y su catálogo de 3 niveles.
-- Categoría → subcategoría → detalle. El gasto se resta de la venta de este submódulo.
-- Pega este archivo en Supabase → SQL Editor → Run. Seguro de repetir.

create table if not exists public.ruta_rc_ext_catalogo (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.ruta_rc_ext_catalogo(id) on delete restrict,
  nivel smallint not null check (nivel between 1 and 3),
  nombre text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ruta_rc_ext_gastos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references public.ruta_rc_ext_catalogo(id) on delete restrict,
  subcategoria_id uuid references public.ruta_rc_ext_catalogo(id) on delete restrict,
  detalle_id uuid references public.ruta_rc_ext_catalogo(id) on delete restrict,
  categoria_nombre text not null,
  subcategoria_nombre text not null,
  detalle_nombre text not null,
  monto numeric(12,2) not null check (monto > 0),
  notas text,
  usuario_nombre text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_ruta_rc_ext_catalogo_nombre
  on public.ruta_rc_ext_catalogo (
    nivel,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(nombre))
  );

create index if not exists idx_ruta_rc_ext_catalogo_parent
  on public.ruta_rc_ext_catalogo (parent_id, orden, nombre);

create index if not exists idx_ruta_rc_ext_gastos_fecha
  on public.ruta_rc_ext_gastos (created_at desc);

alter table public.ruta_rc_ext_catalogo enable row level security;
alter table public.ruta_rc_ext_gastos enable row level security;

drop policy if exists "ruta_rc_ext_catalogo_anon" on public.ruta_rc_ext_catalogo;
create policy "ruta_rc_ext_catalogo_anon" on public.ruta_rc_ext_catalogo
  for all using (true) with check (true);

drop policy if exists "ruta_rc_ext_gastos_anon" on public.ruta_rc_ext_gastos;
create policy "ruta_rc_ext_gastos_anon" on public.ruta_rc_ext_gastos
  for all using (true) with check (true);

do $$
begin
  execute 'grant select, insert, update, delete on public.ruta_rc_ext_catalogo to anon, authenticated, service_role';
  execute 'grant select, insert, update, delete on public.ruta_rc_ext_gastos to anon, authenticated, service_role';
exception when others then
  raise notice 'permisos: %', sqlerrm;
end $$;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  raise notice 'reload schema: %', sqlerrm;
end $$;

select c.relname as tabla
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('ruta_rc_ext_catalogo', 'ruta_rc_ext_gastos')
order by c.relname;
