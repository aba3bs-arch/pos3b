-- Cuenta IE del vale: MAIN (Central admin) o sucursal.
-- Supabase → SQL Editor → Run
alter table public.vales add column if not exists sucursal_ie text default 'MAIN';
comment on column public.vales.sucursal_ie is
  'Cuenta IE del egreso: MAIN = Central de administración, o código de sucursal.';
notify pgrst, 'reload schema';
