-- Bitácora de rastreo de uso del POS (quién / dónde / qué).
-- Append-only: solo INSERT + SELECT. No UPDATE/DELETE.
-- Ejecutar en Supabase → SQL Editor.

create table if not exists public.pos_auditoria_eventos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tipo text not null,
  accion text,
  severidad text not null default 'info',
  usuario_id text,
  usuario_nombre text,
  rol text,
  sucursal_id text,
  dispositivo_id text,
  dispositivo_corto text,
  dispositivo_reconocido boolean,
  es_movil boolean,
  terminal_tienda boolean,
  user_agent text,
  vista text,
  detalle jsonb not null default '{}'::jsonb
);

comment on table public.pos_auditoria_eventos is
  'Rastreo de uso: logins, módulos, PIN admin, cortes, config, dispositivos no reconocidos.';

create index if not exists idx_pos_auditoria_created
  on public.pos_auditoria_eventos (created_at desc);

create index if not exists idx_pos_auditoria_tipo_fecha
  on public.pos_auditoria_eventos (tipo, created_at desc);

create index if not exists idx_pos_auditoria_sucursal_fecha
  on public.pos_auditoria_eventos (sucursal_id, created_at desc);

create index if not exists idx_pos_auditoria_usuario_fecha
  on public.pos_auditoria_eventos (usuario_id, created_at desc);

create index if not exists idx_pos_auditoria_dispositivo_fecha
  on public.pos_auditoria_eventos (dispositivo_id, created_at desc);

create index if not exists idx_pos_auditoria_severidad_fecha
  on public.pos_auditoria_eventos (severidad, created_at desc)
  where severidad in ('warning', 'critical');

alter table public.pos_auditoria_eventos enable row level security;

drop policy if exists pos_auditoria_eventos_anon_all on public.pos_auditoria_eventos;
drop policy if exists pos_auditoria_eventos_select on public.pos_auditoria_eventos;
drop policy if exists pos_auditoria_eventos_insert on public.pos_auditoria_eventos;

create policy pos_auditoria_eventos_select on public.pos_auditoria_eventos
  for select to anon, authenticated
  using (true);

create policy pos_auditoria_eventos_insert on public.pos_auditoria_eventos
  for insert to anon, authenticated
  with check (true);

-- Bloquear update/delete vía revoke (RLS sin policy = denegado).
revoke update, delete on public.pos_auditoria_eventos from anon, authenticated;
grant select, insert on public.pos_auditoria_eventos to anon, authenticated;
