-- Limpia latidos falsos (navegación desde Central marcaba tiendas “en línea”).
-- Ejecutar una vez en Supabase SQL Editor si tras actualizar la app aún ves puntos verdes incorrectos.
update public.pos_presencia_sucursal
set last_seen = timestamptz '1970-01-01+00',
    usuario_nombre = null;
