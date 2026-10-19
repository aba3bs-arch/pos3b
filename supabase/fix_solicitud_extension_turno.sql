-- Solicitud de más tiempo / entrada fuera de horario.
-- Empleado pide desde el login → admin aprueba en overlay (celular) con PIN + horas (2/4/6/8/12).
-- La autorización vigente sigue en pos_autorizacion_turno_fh.
-- Ejecutar en Supabase → SQL Editor (después de fix_autorizacion_turno_fuera_horario.sql).

create table if not exists public.pos_solicitud_extension_turno (
  id uuid primary key default gen_random_uuid(),
  usuario_id text not null,
  usuario_nombre text,
  usuario_rol text,
  sucursal_id text not null,
  origen text not null default 'login',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada')),
  horas_otorgadas int,
  admin_id text,
  admin_nombre text,
  motivo_rechazo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  atendida_at timestamptz
);

create index if not exists idx_pos_sol_ext_pend
  on public.pos_solicitud_extension_turno (estado, created_at desc);

create index if not exists idx_pos_sol_ext_user_suc
  on public.pos_solicitud_extension_turno (usuario_id, sucursal_id, estado);

comment on table public.pos_solicitud_extension_turno is
  'Solicitud de entrada fuera de horario / más tiempo. Admin aprueba con PIN y elige 2–12 h.';

alter table public.pos_solicitud_extension_turno enable row level security;

drop policy if exists pos_solicitud_extension_turno_anon_all on public.pos_solicitud_extension_turno;
create policy pos_solicitud_extension_turno_anon_all on public.pos_solicitud_extension_turno
  for all to anon, authenticated
  using (true)
  with check (true);
