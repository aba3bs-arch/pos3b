-- Subcategorías IE: ocultar del catálogo de gastos de cortes (sin desactivar en IE).
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).

alter table public.cont_virtual_subcategorias
  add column if not exists en_catalogo_cortes boolean default true;

comment on column public.cont_virtual_subcategorias.en_catalogo_cortes is
  'Si true (default), la subcuenta aparece en el catálogo de gastos de Corte Virtual/Abarrotes/Garage cuando su categoría está en cortes. false = ocultar solo en cortes; sigue en IE.';

-- Valores nulos → visibles en cortes (compat).
update public.cont_virtual_subcategorias
set en_catalogo_cortes = true
where en_catalogo_cortes is null;

notify pgrst, 'reload schema';
