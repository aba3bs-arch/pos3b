-- Tesorería (Cheche): recibe fondos de servicios desde la cuenta Servicios.
-- Ejecuta también fix_rt_cuenta_servicios.sql para crear/activar Servicios
-- y desactivar Andrés / ABB / JLBB del panel.

INSERT INTO public.rt_cuentas (id, nombre, activo)
VALUES
  ('cheche', 'Cheche (Tesorería)', true),
  ('servicios', 'Servicios (liquidación)', true),
  ('francisco', 'Francisco (FJBB)', true)
ON CONFLICT (id) DO UPDATE
SET nombre = EXCLUDED.nombre,
    activo = true;
