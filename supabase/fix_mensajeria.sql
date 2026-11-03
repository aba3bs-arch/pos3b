-- =============================================================================
-- POS 3B — Mensajería (chat por sucursal, grupo, soporte y directos)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Quién ve cada chat lo decide la caja:
--   sucursal__CODIGO  → personal de esa sucursal
--   grupo             → todas las sucursales
--   soporte__CODIGO   → esa sucursal; la atienden todos los administradores
--   dm__idA__idB      → los dos usuarios
-- El administrador principal (AMR / Andrés) es el único que consulta todos los chats.
-- Cualquier rol Administrador ve el soporte de todas las sucursales y lo marca resuelto.

create table if not exists public.pos_mensajes (
  id uuid primary key default gen_random_uuid(),
  canal text not null,
  texto text not null,
  autor_id text,
  autor_nombre text not null,
  autor_rol text,
  autor_sucursal text,
  turno_id text,
  turno_nombre text,
  destinatario_id text,
  destinatario_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_mensajes_canal on public.pos_mensajes (canal, created_at desc);
create index if not exists idx_pos_mensajes_autor on public.pos_mensajes (autor_id, created_at desc);
create index if not exists idx_pos_mensajes_destino on public.pos_mensajes (destinatario_id, created_at desc);

alter table public.pos_mensajes enable row level security;
drop policy if exists "pos_mensajes_anon_rw" on public.pos_mensajes;
create policy "pos_mensajes_anon_rw" on public.pos_mensajes for all using (true) with check (true);

create table if not exists public.pos_soporte_solicitudes (
  canal text primary key,
  sucursal_id text not null,
  estado text not null default 'abierta',
  texto text,
  solicitante_nombre text,
  solicitante_turno text,
  resuelta_por text,
  resuelta_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_soporte_estado on public.pos_soporte_solicitudes (estado, updated_at desc);

alter table public.pos_soporte_solicitudes enable row level security;
drop policy if exists "pos_soporte_solicitudes_anon_rw" on public.pos_soporte_solicitudes;
create policy "pos_soporte_solicitudes_anon_rw" on public.pos_soporte_solicitudes for all using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.pos_mensajes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.pos_soporte_solicitudes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
