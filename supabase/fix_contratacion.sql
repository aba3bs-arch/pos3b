-- POS 3B — Módulo de contratación (aspirantes)
-- Formularios públicos vía enlace/QR → bandeja del admin principal.
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).

create table if not exists public.pos_contratacion_solicitudes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('planta', 'cubre_turno')),
  estado text not null default 'nueva'
    check (estado in (
      'nueva', 'en_seguimiento', 'redirigida', 'entrevista',
      'aceptada', 'rechazada', 'descartada'
    )),
  nombre text not null,
  apellidos text not null,
  edad integer,
  fecha_nacimiento date,
  telefono text not null,
  telefono_alt text,
  email text,
  direccion text,
  colonia text,
  ciudad text,
  estado_mx text,
  cp text,
  grado_estudios text,
  carrera text,
  anios_experiencia numeric(4,1) default 0,
  experiencia text,
  puestos_anteriores text,
  disponibilidad_turno text, -- diurno | nocturno | ambos
  sucursales_interes jsonb not null default '[]'::jsonb,
  tiene_transporte boolean default false,
  licencia_conducir boolean default false,
  disponibilidad_inmediata boolean default true,
  expectativa_sueldo text,
  curp text,
  motivacion text,
  referencias text,
  notas_admin text,
  -- Dueño: admin principal por defecto; se puede redirigir a otro admin
  asignado_a_id text,
  asignado_a_nombre text,
  redirigido_por_id text,
  redirigido_por_nombre text,
  redirigido_at timestamptz,
  seguimiento jsonb not null default '[]'::jsonb, -- [{at, por, texto, estado}]
  origen text default 'enlace', -- enlace | qr | app
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_contratacion_estado_idx
  on public.pos_contratacion_solicitudes (estado, created_at desc);

create index if not exists pos_contratacion_asignado_idx
  on public.pos_contratacion_solicitudes (asignado_a_id, estado);

create index if not exists pos_contratacion_tipo_idx
  on public.pos_contratacion_solicitudes (tipo, created_at desc);

alter table public.pos_contratacion_solicitudes enable row level security;

drop policy if exists pos_contratacion_solicitudes_all on public.pos_contratacion_solicitudes;
create policy pos_contratacion_solicitudes_all on public.pos_contratacion_solicitudes
  for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.pos_contratacion_solicitudes to anon, authenticated;

comment on table public.pos_contratacion_solicitudes is
  'Aspirantes (planta / cubre turno). Bandeja del admin principal; puede redirigir a otros admins.';
