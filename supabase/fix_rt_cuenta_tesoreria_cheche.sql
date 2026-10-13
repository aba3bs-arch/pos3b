-- Tesorería (Cheche): solo recibe fondos de servicios desde JLBB.
-- Administrada por JLBB. No usa ABB ni FJBB.

INSERT INTO public.rt_cuentas (id, nombre, activo)
VALUES
  ('cheche', 'Cheche (Tesorería)', true),
  ('jlbb', 'JLBB', true)
ON CONFLICT (id) DO UPDATE
SET nombre = EXCLUDED.nombre,
    activo = true;
