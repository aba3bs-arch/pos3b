-- =============================================================================
-- POS 3B — Clientes máquinas: vínculo a usuario rol Cliente + rol en check
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.clientes_maquinas
  add column if not exists usuario_id uuid references public.usuarios (id) on delete set null;

create index if not exists idx_clientes_maquinas_usuario
  on public.clientes_maquinas (usuario_id)
  where usuario_id is not null;

comment on column public.clientes_maquinas.usuario_id is
  'Usuario POS con rol Cliente; solo ve este espacio (cortes Virtual/Garage).';

-- Asegurar que el check de roles admite «Cliente»
update public.usuarios set rol = 'Cliente' where lower(trim(rol)) in ('cliente');

alter table public.usuarios drop constraint if exists usuarios_rol_check;

alter table public.usuarios add constraint usuarios_rol_check
  check (
    char_length(trim(rol)) >= 2 and char_length(rol) <= 48
  );

comment on constraint usuarios_rol_check on public.usuarios is
  'Roles del sistema (incl. Cliente) + roles personalizados; ver src/lib/roles.js';
