-- =============================================================================
-- Roles de usuarios — ampliar check constraint (Supabase → SQL Editor → Run)
-- La app usa: Cajero, Auditor, Repartidor, Supervisor, Gerente, Administrador
-- Si solo existían Cajero/Administrador en BD, el alta de otros roles fallaba.
-- Seguro re-ejecutar.
-- =============================================================================

-- Normalizar filas antiguas (minúsculas / variantes)
update public.usuarios set rol = 'Cajero' where lower(trim(rol)) in ('cajero');
update public.usuarios set rol = 'Auditor' where lower(trim(rol)) in ('auditor');
update public.usuarios set rol = 'Repartidor' where lower(trim(rol)) in ('repartidor');
update public.usuarios set rol = 'Supervisor' where lower(trim(rol)) in ('supervisor');
update public.usuarios set rol = 'Gerente' where lower(trim(rol)) in ('gerente');
update public.usuarios set rol = 'Administrador' where lower(trim(rol)) in ('administrador', 'admin');

alter table public.usuarios drop constraint if exists usuarios_rol_check;

alter table public.usuarios add constraint usuarios_rol_check
  check (rol in (
    'Cajero',
    'Auditor',
    'Repartidor',
    'Supervisor',
    'Gerente',
    'Administrador'
  ));

comment on constraint usuarios_rol_check on public.usuarios is
  'Roles del POS 3B; deben coincidir con src/lib/roles.js';
