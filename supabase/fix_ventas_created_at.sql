-- Ejecutar UNA VEZ en Supabase → SQL Editor
-- Corrige: column ventas.created_at does not exist

alter table public.ventas
  add column if not exists created_at timestamptz default now();

-- Ventas antiguas sin fecha: asignar momento de la migración
update public.ventas
set created_at = now()
where created_at is null;
