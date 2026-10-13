-- Cuenta Tesorería (Cheche) para RC/VentaRuta.
-- Recibe fondos de servicios desde ABB / JLBB / FJBB (Francisco). Administrada por JLBB.

INSERT INTO public.rt_cuentas (id, nombre, activo)
VALUES
  ('cheche', 'Cheche (Tesorería)', true),
  ('francisco', 'Francisco (FJBB)', true),
  ('abb', 'ABB', true),
  ('jlbb', 'JLBB', true)
ON CONFLICT (id) DO UPDATE
SET nombre = EXCLUDED.nombre,
    activo = true;
