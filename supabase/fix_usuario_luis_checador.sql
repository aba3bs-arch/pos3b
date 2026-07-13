-- Asegura usuario de checador para Luis Enrique (personal central / recolector).
-- El reloj lee `usuarios`, no la tabla `repartidores`.
-- Ejecutar en Supabase → SQL Editor si no puede marcar entrada/salida en sucursales.

insert into public.usuarios (nombre, pin, rol, sucursal_id, activo)
select 'Luis Enrique Mada Osuna', '1423', 'Repartidor', 'MAIN', true
where not exists (
  select 1 from public.usuarios u
  where lower(trim(u.nombre)) like '%luis%enrique%mada%'
     or (u.pin = '1423' and upper(coalesce(u.sucursal_id, '')) = 'MAIN')
);

update public.usuarios
set
  sucursal_id = 'MAIN',
  rol = coalesce(nullif(trim(rol), ''), 'Repartidor'),
  activo = true
where lower(trim(nombre)) like '%luis%enrique%mada%'
   or (pin = '1423' and lower(trim(nombre)) like '%luis%enrique%');

comment on table public.usuarios is
  'Personal de MAIN (sucursal_id=MAIN) puede marcar asistencia en cualquier caja (checador).';
