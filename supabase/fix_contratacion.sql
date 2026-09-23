-- POS 3B — Módulo de contratación (aspirantes)
-- Formularios públicos vía enlace/QR → bandeja del admin principal.
-- Incluye foto, perfil laboral, evaluación FA3B-003 y bolsa de trabajo.
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).

create table if not exists public.pos_contratacion_solicitudes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('planta', 'cubre_turno')),
  estado text not null default 'nueva'
    check (estado in (
      'nueva', 'en_seguimiento', 'redirigida', 'entrevista',
      'aceptada', 'rechazada', 'descartada',
      'bolsa_de_trabajo', 'no_califica'
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
  -- Foto del aspirante (JPEG data URL comprimido)
  foto_url text,
  -- Checklist de perfil laboral del negocio
  perfil_laboral jsonb not null default '{}'::jsonb,
  -- Evaluación FA3B-003 (respuestas, score, detalle)
  evaluacion jsonb not null default '{}'::jsonb,
  evaluacion_pct numeric(5,2),
  evaluacion_califica boolean,
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

-- Migración: columnas nuevas si la tabla ya existía
alter table public.pos_contratacion_solicitudes
  add column if not exists foto_url text;
alter table public.pos_contratacion_solicitudes
  add column if not exists perfil_laboral jsonb not null default '{}'::jsonb;
alter table public.pos_contratacion_solicitudes
  add column if not exists evaluacion jsonb not null default '{}'::jsonb;
alter table public.pos_contratacion_solicitudes
  add column if not exists evaluacion_pct numeric(5,2);
alter table public.pos_contratacion_solicitudes
  add column if not exists evaluacion_califica boolean;

-- Ampliar check de estado (bolsa / no califica)
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'pos_contratacion_solicitudes'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%estado%';
  if cname is not null then
    execute format('alter table public.pos_contratacion_solicitudes drop constraint %I', cname);
  end if;
exception when others then
  null;
end $$;

alter table public.pos_contratacion_solicitudes
  drop constraint if exists pos_contratacion_solicitudes_estado_check;

alter table public.pos_contratacion_solicitudes
  add constraint pos_contratacion_solicitudes_estado_check
  check (estado in (
    'nueva', 'en_seguimiento', 'redirigida', 'entrevista',
    'aceptada', 'rechazada', 'descartada',
    'bolsa_de_trabajo', 'no_califica'
  ));

create index if not exists pos_contratacion_estado_idx
  on public.pos_contratacion_solicitudes (estado, created_at desc);

create index if not exists pos_contratacion_asignado_idx
  on public.pos_contratacion_solicitudes (asignado_a_id, estado);

create index if not exists pos_contratacion_tipo_idx
  on public.pos_contratacion_solicitudes (tipo, created_at desc);

create index if not exists pos_contratacion_bolsa_idx
  on public.pos_contratacion_solicitudes (estado, evaluacion_pct desc nulls last)
  where estado = 'bolsa_de_trabajo';

alter table public.pos_contratacion_solicitudes enable row level security;

drop policy if exists pos_contratacion_solicitudes_all on public.pos_contratacion_solicitudes;
create policy pos_contratacion_solicitudes_all on public.pos_contratacion_solicitudes
  for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.pos_contratacion_solicitudes to anon, authenticated;

comment on table public.pos_contratacion_solicitudes is
  'Aspirantes (planta / cubre turno). Foto + perfil laboral + FA3B-003. Bolsa de trabajo / no califica.';
comment on column public.pos_contratacion_solicitudes.foto_url is
  'Foto del aspirante (data URL JPEG).';
comment on column public.pos_contratacion_solicitudes.perfil_laboral is
  'Checklist: horario, celular, deberes, drogas, juego, fin de semana, PC, permiso padres.';
comment on column public.pos_contratacion_solicitudes.evaluacion is
  'FA3B-003: respuestas, score, primeras5 y resultado califica.';
