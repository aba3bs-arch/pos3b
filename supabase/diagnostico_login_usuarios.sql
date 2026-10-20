-- Diagnóstico: no puedo entrar (login / usuarios).
-- Ejecutar en Supabase → SQL Editor. Solo lectura.

-- 1) ¿Existe la tabla y cuántos hay?
select count(*) as total_usuarios,
       count(*) filter (where coalesce(activo, true) = true) as activos,
       count(*) filter (where activo = false) as dados_de_baja
from public.usuarios;

-- 2) PIN duplicado en la MISMA tienda (rompe unique / confundía maybeSingle).
select sucursal_id, pin, count(*) as veces, array_agg(nombre) as nombres
from public.usuarios
group by sucursal_id, pin
having count(*) > 1
order by veces desc
limit 50;

-- 3) Mismo PIN en varias tiendas (normal: permitido). Solo informativo.
select pin, count(distinct sucursal_id) as tiendas, count(*) as filas
from public.usuarios
group by pin
having count(*) > 1
order by filas desc
limit 30;

-- 4) Índices relevantes (debe existir idx_usuarios_sucursal_pin UNIQUE).
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'usuarios'
order by indexname;

-- 5) Políticas RLS (anon debe poder SELECT).
select polname, polcmd, polroles::regrole[]
from pg_policy
where polrelid = 'public.usuarios'::regclass;

-- 6) Prueba rápida: ¿responde la tabla? (cambia el PIN de prueba)
-- select id, nombre, rol, sucursal_id, activo from public.usuarios where pin = '1234' limit 5;
