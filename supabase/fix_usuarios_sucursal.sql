-- Ejecutar en Supabase → SQL Editor
-- Liga cada usuario a una sucursal; el mismo PIN puede repetirse en otra tienda.

alter table public.usuarios
  add column if not exists sucursal_id text;

update public.usuarios
set sucursal_id = 'MAIN'
where sucursal_id is null or trim(sucursal_id) = '';

-- Quitar PIN único global (antiguo); permite PIN 123 en varias sucursales.
alter table public.usuarios drop constraint if exists usuarios_pin_key;

create unique index if not exists idx_usuarios_sucursal_pin
  on public.usuarios (sucursal_id, pin);

create index if not exists idx_usuarios_sucursal
  on public.usuarios (sucursal_id);

comment on column public.usuarios.sucursal_id is 'Código de tienda (MAIN, FUSION, 3B2, 3B5…). Login valida PIN + sucursal de la caja.';
