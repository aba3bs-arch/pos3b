-- Usuarios de ejemplo: PIN 123 por sucursal (un empleado por tienda con ese PIN).

-- Ejecutar DESPUÉS de fix_usuarios_sucursal.sql o migracion_completa.sql



insert into public.usuarios (nombre, pin, rol, sucursal_id)

values

  ('Admin FUSION', '123', 'Administrador', 'FUSION'),

  ('Admin 3B2', '123', 'Administrador', '3B2'),

  ('Admin 3B5', '123', 'Administrador', '3B5'),

  ('Admin 3B6', '123', 'Administrador', '3B6'),

  ('Admin 3B7', '123', 'Administrador', '3B7'),

  ('Admin 3B9', '123', 'Administrador', '3B9'),

  ('Admin 3B10', '123', 'Administrador', '3B10')

on conflict do nothing;



-- Uso: fija la tienda en la caja y entra con PIN 123.

