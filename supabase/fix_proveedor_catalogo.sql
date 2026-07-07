-- Catálogo de productos por proveedor (independiente del inventario de tienda).
-- Las sucursales registran ítems del catálogo en productos vía la app (Proveedores → Registrar en inventario).

create table if not exists public.proveedor_catalogo (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  nombre text not null,
  presentacion text,
  sku_proveedor text,
  codigo_barras text,
  cat text default 'GENERAL',
  precio_compra_sugerido numeric(12, 2),
  producto_id text,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_prov_catalogo_nombre_pres
  on public.proveedor_catalogo(proveedor_id, nombre, coalesce(presentacion, ''));

create index if not exists idx_prov_catalogo_proveedor on public.proveedor_catalogo(proveedor_id);
create index if not exists idx_prov_catalogo_producto on public.proveedor_catalogo(producto_id) where producto_id is not null;

alter table public.proveedor_catalogo enable row level security;

drop policy if exists "proveedor_catalogo_anon_rw" on public.proveedor_catalogo;
create policy "proveedor_catalogo_anon_rw" on public.proveedor_catalogo for all using (true) with check (true);

comment on table public.proveedor_catalogo is 'Catálogo maestro del proveedor; producto_id se llena al registrar en inventario de tienda.';
comment on column public.proveedor_catalogo.presentacion is 'Ej. 600 ml, 1 lt, 2 lts';
comment on column public.proveedor_catalogo.producto_id is 'Código en productos.id una vez importado a inventario';
