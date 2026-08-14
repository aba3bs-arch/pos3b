-- Flag: categoría de IE visible en el catálogo de gastos de cortes.
-- El admin decide en IE Virtual / IE Abarrotes (Más → Cuentas) si enviarla a cortes.
-- Ejecutar en SQL Editor de Supabase.

alter table public.cont_virtual_categorias
  add column if not exists en_catalogo_cortes boolean default true;

comment on column public.cont_virtual_categorias.en_catalogo_cortes is
  'Si true, la categoría aparece en el catálogo de gastos de Corte Virtual/Abarrotes/Garage.';

-- Ingresos no van al catálogo de gastos de cortes.
update public.cont_virtual_categorias
set en_catalogo_cortes = false
where coalesce(flujo, 'egreso') = 'ingreso';

-- Empleado siempre disponible en cortes.
update public.cont_virtual_categorias
set en_catalogo_cortes = true
where lower(id) = 'empleado' or lower(nombre) = 'empleado';
