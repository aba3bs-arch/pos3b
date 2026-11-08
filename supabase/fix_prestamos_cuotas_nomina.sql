-- Préstamos a empleado: calendario de cobro en nómina.
-- num_cuotas  = cuántas semanas se descuenta (por defecto monto ÷ $500, redondeado hacia arriba).
-- primer_cobro = fecha de la primera nómina que descuenta (por defecto, la semana siguiente).
-- Después de la última cuota la nómina ya no descuenta; la última cuota liquida el saldo.
-- Los préstamos que ya existen sin estas columnas siguen con el cobro de $500 por semana.
-- Ejecutar en Supabase → SQL Editor.

do $$
begin
  if to_regclass('public.prestamos') is null then
    raise exception 'Falta la tabla prestamos. Ejecuta primero supabase/fix_contabilidad_completo.sql';
  end if;
  alter table public.prestamos add column if not exists num_cuotas integer;
  alter table public.prestamos add column if not exists primer_cobro date;
end $$;

notify pgrst, 'reload schema';
