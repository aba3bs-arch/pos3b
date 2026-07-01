-- =============================================================================
-- Roles personalizados — permitir cualquier nombre de rol (2–48 caracteres)
-- Ejecutar en Supabase → SQL Editor después de crear roles en Configuración.
-- Seguro re-ejecutar.
-- =============================================================================

alter table public.usuarios drop constraint if exists usuarios_rol_check;

alter table public.usuarios add constraint usuarios_rol_check
  check (char_length(trim(rol)) >= 2 and char_length(rol) <= 48);

comment on constraint usuarios_rol_check on public.usuarios is
  'Roles del sistema + roles personalizados creados en Configuración del POS';
