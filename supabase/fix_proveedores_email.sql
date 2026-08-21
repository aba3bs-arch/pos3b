-- Columna email en proveedores (tablas antiguas creadas sin ella).
-- Ejecutar en Supabase SQL Editor si al guardar marca que no existe la columna email.

alter table public.proveedores
  add column if not exists email text;

comment on column public.proveedores.email is 'Correo de contacto del proveedor';
