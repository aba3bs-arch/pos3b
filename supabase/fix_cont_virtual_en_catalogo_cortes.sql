-- Flag: categoría de IE visible en el catálogo de gastos de cortes.
-- El admin decide en IE Virtual / IE Abarrotes (Más → Cuentas) si enviarla a cortes.
-- Ejecutar en SQL Editor de Supabase (seguro re-ejecutar).
-- NO requiere la columna "flujo".

alter table public.cont_virtual_categorias
  add column if not exists en_catalogo_cortes boolean default true;

comment on column public.cont_virtual_categorias.en_catalogo_cortes is
  'Si true, la categoría aparece en el catálogo de gastos de Corte Virtual/Abarrotes/Garage.';

-- Ingresos no van al catálogo de gastos de cortes (por id / nombre; sin usar flujo).
update public.cont_virtual_categorias
set en_catalogo_cortes = false
where lower(id) like 'ing-%'
   or lower(id) in ('ingresos', 'ing-recoleccion', 'ing-ventas', 'ing-manual')
   or lower(nombre) in ('ingresos', 'recoleccion', 'recolección', 'ventas', 'ingreso manual')
   or lower(nombre) like 'ingreso%';

-- Si ya existe la columna flujo (de fix_cont_virtual_ingresos.sql), también marcar por ahí.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cont_virtual_categorias'
      and column_name = 'flujo'
  ) then
    update public.cont_virtual_categorias
    set en_catalogo_cortes = false
    where coalesce(flujo, 'egreso') = 'ingreso';
  end if;
end $$;

-- Empleado siempre disponible en cortes.
update public.cont_virtual_categorias
set en_catalogo_cortes = true
where lower(id) = 'empleado' or lower(nombre) = 'empleado';
