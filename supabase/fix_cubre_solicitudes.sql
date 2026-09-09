-- =============================================================================
-- POS 3B — Sistema de coberturas CT (solicitudes, PIN temporal, hold)
-- Independiente de empleados de planta. El catálogo CT sigue en rh_empleados
-- (tipo_empleado = 'cubre_turno'). Ejecutar en Supabase → SQL Editor.
-- =============================================================================

create table if not exists public.pos_cubre_solicitudes (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  fecha date not null,
  turno_id text,
  turno_etiqueta text,
  empleado_planta_id text,
  empleado_planta_nombre text,
  plan_fila_id text,
  plan_dia smallint,
  ct_rh_id uuid,
  ct_nombre text not null,
  ct_telefono text,
  solicitado_por_id text,
  solicitado_por_nombre text,
  estado text not null default 'solicitada'
    check (estado in (
      'solicitada',
      'aceptada',
      'rechazada',
      'cumplida',
      'no_show',
      'retenida',
      'liberada',
      'cancelada'
    )),
  pin_temporal text,
  pin_valido_desde timestamptz,
  pin_valido_hasta timestamptz,
  aceptada_at timestamptz,
  rechazo_motivo text,
  hold_until timestamptz,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cubre_sol_suc_fecha
  on public.pos_cubre_solicitudes (sucursal_id, fecha desc);
create index if not exists idx_cubre_sol_ct
  on public.pos_cubre_solicitudes (ct_rh_id, estado);
create index if not exists idx_cubre_sol_estado
  on public.pos_cubre_solicitudes (estado, hold_until);
create index if not exists idx_cubre_sol_pin
  on public.pos_cubre_solicitudes (pin_temporal)
  where pin_temporal is not null and pin_temporal <> '';

comment on table public.pos_cubre_solicitudes is
  'Solicitudes de cubre turno por tienda/fecha. PIN temporal al aceptar; hold 7 días si no cumple.';
comment on column public.pos_cubre_solicitudes.estado is
  'solicitada→aceptada→cumplida | no_show→retenida→liberada | rechazada|cancelada';
comment on column public.pos_cubre_solicitudes.pin_temporal is
  'PIN exclusivo de la tienda/fecha/turno; válido solo en esa ventana.';

alter table public.pos_cubre_solicitudes enable row level security;

drop policy if exists pos_cubre_solicitudes_anon_all on public.pos_cubre_solicitudes;
create policy pos_cubre_solicitudes_anon_all on public.pos_cubre_solicitudes
  for all to anon, authenticated
  using (true)
  with check (true);

-- Disponibilidad / hold en extras de RH (sin migrar columnas obligatorias):
-- extras.ct_disponibilidad = 'disponible' | 'no_disponible'
-- extras.ct_hold_until = ISO timestamptz
-- extras.ct_push_opt_in = true
comment on column public.rh_empleados.extras is
  'JSON libre. CT: ct_disponibilidad, ct_hold_until, ct_push_opt_in.';
