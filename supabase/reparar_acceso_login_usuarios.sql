-- =============================================================================
-- URGENTE: reparar acceso login / tabla usuarios
-- Ejecutar en Supabase → SQL Editor → Run
-- Seguro re-ejecutar. No borra empleados.
-- =============================================================================

-- 1) Asegurar columnas usadas por el login
alter table public.usuarios add column if not exists sucursal_id text default 'MAIN';
alter table public.usuarios add column if not exists activo boolean default true;
alter table public.usuarios add column if not exists dispositivo_id text;
alter table public.usuarios add column if not exists dispositivo_id_2 text;
alter table public.usuarios add column if not exists dispositivo_vinculado_at timestamptz;
alter table public.usuarios add column if not exists turno_id text;
alter table public.usuarios add column if not exists turno_horario jsonb;

update public.usuarios set sucursal_id = 'MAIN'
where sucursal_id is null or trim(sucursal_id) = '';
update public.usuarios set activo = true where activo is null;

-- 2) RLS: anon debe poder leer/escribir usuarios (el POS usa anon key)
alter table public.usuarios enable row level security;
drop policy if exists "usuarios_anon_rw" on public.usuarios;
create policy "usuarios_anon_rw" on public.usuarios
  for all to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.usuarios to anon, authenticated;

-- 3) Índice único PIN por tienda (login)
create unique index if not exists idx_usuarios_sucursal_pin
  on public.usuarios (sucursal_id, pin);

-- 4) EMERGENCIA: liberar TODOS los dispositivos anclados
--    (tras limpiar caché / cambiar celulares nadie podía entrar)
update public.usuarios
set dispositivo_id = null,
    dispositivo_id_2 = null,
    dispositivo_vinculado_at = null
where dispositivo_id is not null
   or dispositivo_id_2 is not null;

-- 5) Verificación
select count(*) as total,
       count(*) filter (where coalesce(activo, true)) as activos,
       count(*) filter (where dispositivo_id is not null) as con_dispositivo
from public.usuarios;
