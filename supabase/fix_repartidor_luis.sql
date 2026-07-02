-- Corregir nombre del recolector (ejecutar en Supabase si aparece Misael Rodríguez)
UPDATE repartidores
SET nombre = 'Luis Enrique Mada Osuna', activo = TRUE
WHERE id IN ('rep_misael', 'rep_luis');

INSERT INTO repartidores (id, nombre, pin, activo)
VALUES ('rep_luis', 'Luis Enrique Mada Osuna', '1423', TRUE)
ON CONFLICT (id) DO UPDATE
SET nombre = EXCLUDED.nombre, activo = TRUE;

-- Opcional: desactivar registro viejo si quedó duplicado
UPDATE repartidores SET activo = FALSE WHERE id = 'rep_misael' AND id <> 'rep_luis';
