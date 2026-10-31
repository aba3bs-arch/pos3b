-- Pago mixto de nómina (pagador «Abarrotes y Virtual»):
-- guarda cuánto del neto paga Virtual; el resto lo paga Abarrotes.
-- Ejecutar en Supabase → SQL Editor. Si falta nomina_lineas, ejecuta antes
-- supabase/fix_contabilidad_completo.sql.

do $$
begin
  if to_regclass('public.nomina_lineas') is null then
    raise exception 'Falta la tabla nomina_lineas. Ejecuta primero supabase/fix_contabilidad_completo.sql';
  end if;
  alter table public.nomina_lineas
    add column if not exists pago_virtual numeric not null default 0;
end $$;

notify pgrst, 'reload schema';
