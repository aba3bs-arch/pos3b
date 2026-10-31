-- Pago mixto de nómina (pagador «Abarrotes y Virtual»):
-- guarda cuánto del neto paga Virtual; el resto lo paga Abarrotes.
-- Ejecutar en Supabase → SQL Editor.

alter table public.nomina_lineas
  add column if not exists pago_virtual numeric not null default 0;

notify pgrst, 'reload schema';
