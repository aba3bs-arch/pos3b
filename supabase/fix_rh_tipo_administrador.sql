-- RH ABA3B — tipo de expediente «administrador» (pestaña propia, fuera de nómina de tienda).
-- Ejecutar en Supabase → SQL Editor. Seguro re-ejecutar.

alter table public.rh_empleados drop constraint if exists rh_empleados_tipo_empleado_check;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'rh_empleados'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%tipo_empleado%'
  loop
    execute format('alter table public.rh_empleados drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.rh_empleados
  add constraint rh_empleados_tipo_empleado_check
  check (tipo_empleado in ('tienda', 'cubre_turno', 'indirecto', 'administrador'));

comment on column public.rh_empleados.tipo_empleado is
  'tienda | cubre_turno | indirecto | administrador. Administrador se lista en su pestaña y no entra a nómina de tienda.';
