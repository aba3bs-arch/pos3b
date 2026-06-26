-- =============================================================================
-- POS 3B — Aprobaciones vales/préstamos y notificaciones
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.vales add column if not exists categoria text default 'consumo';
alter table public.vales add column if not exists estado_aprobacion text default 'aprobado';
alter table public.vales add column if not exists descuenta_nomina boolean default false;
alter table public.vales add column if not exists cargado_corte boolean default false;
alter table public.vales add column if not exists aprobado_at timestamptz;
alter table public.vales add column if not exists rechazado_por text;
alter table public.vales add column if not exists motivo_rechazo text;

alter table public.prestamos add column if not exists cuota_semanal numeric(12,2) default 0;
alter table public.prestamos add column if not exists requiere_aprobacion_socio boolean default false;
alter table public.prestamos add column if not exists aprobado_admin_por text;
alter table public.prestamos add column if not exists aprobado_admin_at timestamptz;
alter table public.prestamos add column if not exists aprobado_socio_por text;
alter table public.prestamos add column if not exists aprobado_socio_at timestamptz;
alter table public.prestamos add column if not exists cargado_corte boolean default false;
alter table public.prestamos add column if not exists rechazado_por text;
alter table public.prestamos add column if not exists motivo_rechazo text;

-- estados prestamo: pendiente_admin | pendiente_socio | activo | rechazado | liquidado

create table if not exists public.contabilidad_notificaciones (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  tipo text not null,
  ref_tabla text not null,
  ref_id uuid not null,
  titulo text not null,
  mensaje text,
  estado text default 'pendiente',
  leida boolean default false,
  created_at timestamptz default now(),
  atendida_por text,
  atendida_at timestamptz
);

create index if not exists idx_cont_notif_pend on public.contabilidad_notificaciones (estado, created_at desc);

alter table public.contabilidad_notificaciones enable row level security;
drop policy if exists "cont_notif_anon_rw" on public.contabilidad_notificaciones;
create policy "cont_notif_anon_rw" on public.contabilidad_notificaciones for all using (true) with check (true);
