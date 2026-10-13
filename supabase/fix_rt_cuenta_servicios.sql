-- Cuenta RT "Servicios": recibe liquidaciones del Fondo (CFE/proveedor).
-- Desde aquí se transfieren fondos a Tesorería (Cheche).
-- Andrés / ABB / JLBB ya no se usan en el panel de Cuentas RT.

INSERT INTO public.rt_cuentas (id, nombre, activo)
VALUES
  ('servicios', 'Servicios (liquidación)', true),
  ('cheche', 'Cheche (Tesorería)', true),
  ('francisco', 'Francisco (FJBB)', true)
ON CONFLICT (id) DO UPDATE
SET nombre = EXCLUDED.nombre,
    activo = true;

-- Desactivar cuentas retiradas del panel (movimientos históricos se conservan).
UPDATE public.rt_cuentas
SET activo = false
WHERE id IN ('andres', 'abb', 'jlbb');
