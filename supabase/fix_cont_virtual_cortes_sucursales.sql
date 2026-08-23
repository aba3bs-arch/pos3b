-- Visibilidad en cortes: subcategorías + alcance por sucursal.
-- Ejecutar en SQL Editor de Supabase (seguro re-ejecutar).

-- Categorías: ya existe en_catalogo_cortes; agregar lista de tiendas (null = todas).
alter table public.cont_virtual_categorias
  add column if not exists en_catalogo_cortes boolean default true;

alter table public.cont_virtual_categorias
  add column if not exists cortes_sucursales jsonb default null;

comment on column public.cont_virtual_categorias.cortes_sucursales is
  'null o [] = todas las tiendas; ["FUSION","3B7"] = solo esas. Solo aplica si en_catalogo_cortes=true.';

-- Subcategorías: mismo flag + alcance.
alter table public.cont_virtual_subcategorias
  add column if not exists en_catalogo_cortes boolean default true;

alter table public.cont_virtual_subcategorias
  add column if not exists cortes_sucursales jsonb default null;

comment on column public.cont_virtual_subcategorias.en_catalogo_cortes is
  'Si true (y la categoría padre está en cortes), la subcuenta aparece en el catálogo de gastos de corte.';

comment on column public.cont_virtual_subcategorias.cortes_sucursales is
  'null o [] = hereda/todas; lista = solo esas tiendas.';

-- Empleado siempre en cortes.
update public.cont_virtual_categorias
set en_catalogo_cortes = true, cortes_sucursales = null
where lower(id) = 'empleado' or lower(nombre) = 'empleado';
