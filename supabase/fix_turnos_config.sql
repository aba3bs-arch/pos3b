-- POS 3B — Horarios de caja (turnos) por sucursal
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).
-- Cada tienda puede tener su propio diurno/nocturno; las cajas sincronizan al iniciar sesión.

create table if not exists public.pos_turnos_config (
  sucursal_id text primary key,
  tipo_horario text not null default '12x12',
  subtipo text,
  inicio text not null default '07:00',
  turnos jsonb not null default '[]'::jsonb,
  tolerancia jsonb not null default '{"minutos_antes":30,"minutos_despues_fin":30}'::jsonb,
  patrones_rotacion_3 jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pos_turnos_config enable row level security;

drop policy if exists pos_turnos_config_anon_all on public.pos_turnos_config;
create policy pos_turnos_config_anon_all on public.pos_turnos_config
  for all to anon, authenticated
  using (true)
  with check (true);

comment on table public.pos_turnos_config is
  'Horarios de corte/caja por tienda (12×12, 8×24 o personalizado). Cache local pos3b_turnos_*__<SUC>.';

-- Semilla: 12×12 estándar 07:00–19:00 / 19:00–07:00 (corrige el desfase admin vs Fusion).
insert into public.pos_turnos_config (sucursal_id, tipo_horario, subtipo, inicio, turnos, tolerancia, updated_at)
values
  (
    'GLOBAL',
    '12x12',
    null,
    '07:00',
    '[
      {"id":"diurno","nombre":"Turno diurno","hora_inicio":"07:00","hora_fin":"19:00"},
      {"id":"nocturno","nombre":"Turno nocturno","hora_inicio":"19:00","hora_fin":"07:00"}
    ]'::jsonb,
    '{"minutos_antes":30,"minutos_despues_fin":30}'::jsonb,
    now()
  ),
  (
    'FUSION',
    '12x12',
    null,
    '07:00',
    '[
      {"id":"diurno","nombre":"Turno diurno","hora_inicio":"07:00","hora_fin":"19:00"},
      {"id":"nocturno","nombre":"Turno nocturno","hora_inicio":"19:00","hora_fin":"07:00"}
    ]'::jsonb,
    '{"minutos_antes":30,"minutos_despues_fin":30}'::jsonb,
    now()
  )
on conflict (sucursal_id) do update set
  tipo_horario = excluded.tipo_horario,
  subtipo = excluded.subtipo,
  inicio = excluded.inicio,
  turnos = excluded.turnos,
  tolerancia = excluded.tolerancia,
  updated_at = excluded.updated_at
where public.pos_turnos_config.updated_at < excluded.updated_at
   or public.pos_turnos_config.turnos is distinct from excluded.turnos;
