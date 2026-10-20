-- =============================================================================
-- Diagnóstico: no encuentro usuarios / no puedo entrar
-- Supabase → SQL Editor → Run (solo lectura, no modifica datos)
-- =============================================================================

-- A) ¿Existen las tablas críticas del LOGIN?
with needed(tabla, critica) as (
  values
    ('usuarios', true),
    ('logins', false),
    ('pos_turnos_config', false),
    ('pos_pin_cubre_turno', false),
    ('pos_autorizacion_turno_fh', false),
    ('pos_solicitud_extension_turno', false),
    ('contabilidad_notificaciones', false),
    ('productos', false)
)
select
  n.tabla,
  n.critica,
  case when t.relname is null then 'FALTA' else 'OK' end as estado,
  coalesce(c.reltuples::bigint, 0) as filas_aprox
from needed n
left join pg_class t
  on t.relname = n.tabla and t.relkind = 'r'
left join pg_namespace ns on ns.oid = t.relnamespace and ns.nspname = 'public'
left join pg_class c on c.oid = t.oid
order by n.critica desc, n.tabla;

-- B) Columnas de usuarios (las que usa el login)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'usuarios'
order by ordinal_position;

-- C) Conteos reales de usuarios
select
  count(*) as total,
  count(*) filter (where coalesce(activo, true) = true) as activos,
  count(*) filter (where activo = false) as dados_de_baja,
  count(distinct sucursal_id) as tiendas,
  count(*) filter (where rol ilike '%admin%') as admins
from public.usuarios;

-- D) Usuarios por tienda (si sale 0 en todas → tabla vacía o mal filtrada)
select coalesce(sucursal_id, '(null)') as sucursal_id,
       count(*) as total,
       count(*) filter (where coalesce(activo, true)) as activos
from public.usuarios
group by 1
order by total desc;

-- E) RLS y grants (anon DEBE poder SELECT)
select
  c.relname as tabla,
  c.relrowsecurity as rls_on,
  (select string_agg(pol.polname, ', ')
   from pg_policy pol where pol.polrelid = c.oid) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'usuarios', 'logins', 'pos_turnos_config', 'pos_pin_cubre_turno',
    'pos_autorizacion_turno_fh', 'pos_solicitud_extension_turno'
  )
order by c.relname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'usuarios'
  and grantee in ('anon', 'authenticated', 'public')
order by grantee, privilege_type;

-- F) Prueba de lectura como la app (si esto falla, el login no ve usuarios)
select id, nombre, rol, sucursal_id, activo, left(pin, 2) || '**' as pin_mask
from public.usuarios
order by nombre
limit 20;

-- G) Duplicados PIN+tienda (pueden romper maybeSingle)
select sucursal_id, pin, count(*) as veces, array_agg(nombre) as nombres
from public.usuarios
group by sucursal_id, pin
having count(*) > 1
limit 30;

-- H) Índices en usuarios
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'usuarios';
