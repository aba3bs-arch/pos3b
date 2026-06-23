-- Ejecutar en Supabase → SQL Editor
-- Deja PIN 123 en todos los usuarios (cada uno en su sucursal para no chocar).

alter table public.usuarios drop constraint if exists usuarios_pin_key;

create unique index if not exists idx_usuarios_sucursal_pin
  on public.usuarios (sucursal_id, pin);

do $$
declare
  r record;
  sucursales text[] := array['MAIN','FUSION','3B2','3B5','3B6','3B7','3B9','3B10'];
  i int := 0;
  suc text;
begin
  for r in select id from public.usuarios order by nombre loop
    i := i + 1;
    suc := sucursales[((i - 1) % array_length(sucursales, 1)) + 1];
    update public.usuarios
    set pin = '123', sucursal_id = suc
    where id = r.id;
  end loop;
end $$;

select nombre, pin, rol, sucursal_id from public.usuarios order by sucursal_id, nombre;
