-- =============================================================================
-- POS 3B — Columna activo en usuarios (dar de baja / reactivar)
-- Ejecutar en Supabase → SQL Editor. Seguro re-ejecutar.
-- =============================================================================

alter table public.usuarios add column if not exists activo boolean default true;

update public.usuarios set activo = true where activo is null;

comment on column public.usuarios.activo is
  'false = dado de baja (no puede iniciar sesión ni aparece en listas operativas).';
