-- Índices para bajar Disk IO en consultas frecuentes del POS.
-- Seguro de re-ejecutar (IF NOT EXISTS). Correr tras ver seq scans altos en
-- supabase/diagnostico_disk_io.sql.

-- Notificaciones pendientes (polling overlays / badge / push monitor).
create index if not exists idx_cont_notif_estado_tipo_created
  on public.contabilidad_notificaciones (estado, tipo, created_at desc);

create index if not exists idx_cont_notif_estado_suc_created
  on public.contabilidad_notificaciones (estado, sucursal_id, created_at desc);

-- Presencia (latido + mapa en línea).
create index if not exists idx_pos_presencia_last_seen
  on public.pos_presencia_sucursal (last_seen desc);

-- Productos: ORDER BY nombre en catálogo paginado.
create index if not exists idx_productos_nombre
  on public.productos (nombre);

-- Usuarios por PIN (login / autorizaciones).
create index if not exists idx_usuarios_pin
  on public.usuarios (pin);

-- Autorización fuera de horario (sync en login).
create index if not exists idx_pos_auth_fh_user_suc_exp
  on public.pos_autorizacion_turno_fh (usuario_id, sucursal_id, expira_en);

analyze public.contabilidad_notificaciones;
analyze public.pos_presencia_sucursal;
analyze public.productos;
analyze public.usuarios;
