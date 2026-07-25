-- =============================================================================
-- POS 3B — tipo_empleado: tienda (máx. 2 por sucursal) | indirecto (MAIN, todas)
-- Ejecutar en Supabase → SQL Editor. Seguro re-ejecutar.
-- =============================================================================

alter table public.usuarios
  add column if not exists tipo_empleado text;

update public.usuarios
set tipo_empleado = case
  when upper(coalesce(sucursal_id, '')) = 'MAIN'
    and coalesce(rol, '') not ilike 'administrador%'
    then 'indirecto'
  else 'tienda'
end
where tipo_empleado is null or tipo_empleado = '';

alter table public.usuarios
  alter column tipo_empleado set default 'tienda';

update public.usuarios set tipo_empleado = 'tienda' where tipo_empleado is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usuarios_tipo_empleado_check'
  ) then
    alter table public.usuarios
      add constraint usuarios_tipo_empleado_check
      check (tipo_empleado in ('tienda', 'indirecto'));
  end if;
end $$;

comment on column public.usuarios.tipo_empleado is
  'tienda = fijo de sucursal (máx. 2 activos); indirecto = MAIN / aparece en todas las tiendas y cortes.';
