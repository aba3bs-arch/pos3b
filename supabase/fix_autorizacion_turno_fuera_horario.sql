-- Autorización de entrada fuera de horario (login / checador).
-- Se otorga cuando el admin aprueba una solicitud (overlay celular: 2–12 h)
-- o desde flujos/flujos que llaman otorgarAutorizacionFueraHorario.
-- Ejecutar en Supabase → SQL Editor.

create table if not exists public.pos_autorizacion_turno_fh (
  usuario_id text not null,
  sucursal_id text not null,
  admin_id text,
  admin_nombre text,
  otorgado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  primary key (usuario_id, sucursal_id)
);

create index if not exists idx_pos_auth_turno_fh_expira
  on public.pos_autorizacion_turno_fh (expira_en);

create index if not exists idx_pos_auth_turno_fh_suc
  on public.pos_autorizacion_turno_fh (sucursal_id);

comment on table public.pos_autorizacion_turno_fh is
  'Autorización admin/gerente para que un cajero entre fuera de ventana de turno (duración variable). Solicitud desde login → overlay PIN.';

alter table public.pos_autorizacion_turno_fh enable row level security;

drop policy if exists pos_autorizacion_turno_fh_anon_all on public.pos_autorizacion_turno_fh;
create policy pos_autorizacion_turno_fh_anon_all on public.pos_autorizacion_turno_fh
  for all to anon, authenticated
  using (true)
  with check (true);
