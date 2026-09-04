-- =============================================================================
-- POS 3B — RH ABA3B: altas / bajas / recontratación de empleados
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.rh_empleados (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id) on delete set null,
  folio text,
  nombre text not null,
  apellidos text,
  nombre_completo text,
  tipo_empleado text not null default 'tienda'
    check (tipo_empleado in ('tienda', 'cubre_turno', 'indirecto')),
  estado text not null default 'activo'
    check (estado in ('activo', 'baja')),
  sucursal_id text,
  puesto text,
  rol_sistema text,
  fecha_nacimiento date,
  curp text,
  rfc text,
  nss text,
  telefono text,
  telefono_emergencia text,
  contacto_emergencia text,
  email text,
  direccion text,
  colonia text,
  ciudad text,
  estado_mx text,
  cp text,
  banco text,
  clabe text,
  salario_diario numeric(12, 2),
  fecha_alta date not null default (current_date),
  fecha_baja date,
  motivo_baja text,
  notas_baja text,
  recontratable boolean not null default true,
  motivo_no_recontratable text,
  documentos jsonb default '{}'::jsonb,
  extras jsonb default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rh_empleados_estado on public.rh_empleados (estado, tipo_empleado);
create index if not exists idx_rh_empleados_sucursal on public.rh_empleados (sucursal_id);
create index if not exists idx_rh_empleados_usuario on public.rh_empleados (usuario_id);
create index if not exists idx_rh_empleados_nombre on public.rh_empleados (nombre_completo);

create table if not exists public.rh_movimientos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.rh_empleados(id) on delete cascade,
  tipo text not null
    check (tipo in (
      'alta', 'baja', 'recontratacion', 'edicion', 'nota',
      'cambio_tipo', 'cambio_sucursal', 'documento', 'aprobacion_pin'
    )),
  titulo text,
  detalle text,
  payload jsonb default '{}'::jsonb,
  actor_id uuid,
  actor_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rh_movimientos_empleado on public.rh_movimientos (empleado_id, created_at desc);

create table if not exists public.rh_recontratacion_solicitudes (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.rh_empleados(id) on delete cascade,
  estatus text not null default 'pendiente'
    check (estatus in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  motivo text,
  solicitado_por text,
  solicitado_at timestamptz not null default now(),
  requiere_admin_principal boolean not null default true,
  completada_at timestamptz,
  payload jsonb default '{}'::jsonb
);

create index if not exists idx_rh_recontrata_emp on public.rh_recontratacion_solicitudes (empleado_id, estatus);

create table if not exists public.rh_recontratacion_pins (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.rh_recontratacion_solicitudes(id) on delete cascade,
  admin_usuario_id uuid,
  admin_nombre text not null,
  es_admin_principal boolean not null default false,
  pin_ok boolean not null default true,
  aprobado_at timestamptz not null default now(),
  unique (solicitud_id, admin_nombre)
);

create index if not exists idx_rh_recontrata_pins on public.rh_recontratacion_pins (solicitud_id);

alter table public.rh_empleados enable row level security;
alter table public.rh_movimientos enable row level security;
alter table public.rh_recontratacion_solicitudes enable row level security;
alter table public.rh_recontratacion_pins enable row level security;

drop policy if exists "rh_empleados_anon_rw" on public.rh_empleados;
create policy "rh_empleados_anon_rw" on public.rh_empleados for all using (true) with check (true);
drop policy if exists "rh_empleados_auth_rw" on public.rh_empleados;
create policy "rh_empleados_auth_rw" on public.rh_empleados for all to authenticated using (true) with check (true);

drop policy if exists "rh_movimientos_anon_rw" on public.rh_movimientos;
create policy "rh_movimientos_anon_rw" on public.rh_movimientos for all using (true) with check (true);
drop policy if exists "rh_movimientos_auth_rw" on public.rh_movimientos;
create policy "rh_movimientos_auth_rw" on public.rh_movimientos for all to authenticated using (true) with check (true);

drop policy if exists "rh_recontrata_sol_anon_rw" on public.rh_recontratacion_solicitudes;
create policy "rh_recontrata_sol_anon_rw" on public.rh_recontratacion_solicitudes for all using (true) with check (true);
drop policy if exists "rh_recontrata_sol_auth_rw" on public.rh_recontratacion_solicitudes;
create policy "rh_recontrata_sol_auth_rw" on public.rh_recontratacion_solicitudes for all to authenticated using (true) with check (true);

drop policy if exists "rh_recontrata_pins_anon_rw" on public.rh_recontratacion_pins;
create policy "rh_recontrata_pins_anon_rw" on public.rh_recontratacion_pins for all using (true) with check (true);
drop policy if exists "rh_recontrata_pins_auth_rw" on public.rh_recontratacion_pins;
create policy "rh_recontrata_pins_auth_rw" on public.rh_recontratacion_pins for all to authenticated using (true) with check (true);

comment on table public.rh_empleados is 'RH ABA3B: expediente de altas/bajas (tienda, cubre turno, indirectos).';
comment on column public.rh_empleados.recontratable is 'Si false, reingreso exige PIN del administrador principal (AMR).';
