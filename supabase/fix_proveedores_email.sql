-- Columna email en proveedores (tablas antiguas creadas sin ella).
-- Preferir supabase/fix_proveedores_columnas.sql (incluye email + rfc + dirección + modo_compra).

alter table public.proveedores
  add column if not exists email text;

comment on column public.proveedores.email is 'Correo de contacto del proveedor';
