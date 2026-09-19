-- =============================================================================
-- POS 3B — fix_turnos_config.sql
-- Horarios de caja (turnos) por sucursal → tabla public.pos_turnos_config
--
-- CÓMO USARLO (no pide contraseña ni parámetros):
--   1) Abre Supabase → SQL Editor
--   2) Copia TODO este archivo y pégalo
--   3) Pulsa Run / Ejecutar una sola vez
--   4) Al final debe aparecer una fila "ok" = true
-- Seguro re-ejecutar. No hay prompts ni variables.
-- =============================================================================

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

-- Columnas (idempotente si la tabla ya existía a medias)
alter table public.pos_turnos_config add column if not exists tipo_horario text;
alter table public.pos_turnos_config add column if not exists subtipo text;
alter table public.pos_turnos_config add column if not exists inicio text;
alter table public.pos_turnos_config add column if not exists turnos jsonb;
alter table public.pos_turnos_config add column if not exists tolerancia jsonb;
alter table public.pos_turnos_config add column if not exists patrones_rotacion_3 jsonb;
alter table public.pos_turnos_config add column if not exists updated_at timestamptz;

-- Defaults si faltaban
update public.pos_turnos_config set tipo_horario = '12x12' where tipo_horario is null or btrim(tipo_horario) = '';
update public.pos_turnos_config set inicio = '07:00' where inicio is null or btrim(inicio) = '';
update public.pos_turnos_config set turnos = '[]'::jsonb where turnos is null;
update public.pos_turnos_config
  set tolerancia = '{"minutos_antes":30,"minutos_despues_fin":30}'::jsonb
  where tolerancia is null;
update public.pos_turnos_config set updated_at = now() where updated_at is null;

alter table public.pos_turnos_config alter column tipo_horario set default '12x12';
alter table public.pos_turnos_config alter column inicio set default '07:00';
alter table public.pos_turnos_config alter column turnos set default '[]'::jsonb;
alter table public.pos_turnos_config
  alter column tolerancia set default '{"minutos_antes":30,"minutos_despues_fin":30}'::jsonb;
alter table public.pos_turnos_config alter column updated_at set default now();

-- PK si la tabla se creó sin ella
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pos_turnos_config'::regclass
      and contype = 'p'
  ) then
    alter table public.pos_turnos_config
      add constraint pos_turnos_config_pkey primary key (sucursal_id);
  end if;
exception
  when others then
    raise notice 'PK pos_turnos_config: %', SQLERRM;
end $$;

alter table public.pos_turnos_config enable row level security;

drop policy if exists pos_turnos_config_anon_all on public.pos_turnos_config;
drop policy if exists "pos_turnos_config_anon_all" on public.pos_turnos_config;
create policy pos_turnos_config_anon_all on public.pos_turnos_config
  for all
  using (true)
  with check (true);

grant select, insert, update, delete on public.pos_turnos_config to anon, authenticated;

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
    '[{"id":"diurno","nombre":"Turno diurno","hora_inicio":"07:00","hora_fin":"19:00"},{"id":"nocturno","nombre":"Turno nocturno","hora_inicio":"19:00","hora_fin":"07:00"}]'::jsonb,
    '{"minutos_antes":30,"minutos_despues_fin":30}'::jsonb,
    now()
  ),
  (
    'FUSION',
    '12x12',
    null,
    '07:00',
    '[{"id":"diurno","nombre":"Turno diurno","hora_inicio":"07:00","hora_fin":"19:00"},{"id":"nocturno","nombre":"Turno nocturno","hora_inicio":"19:00","hora_fin":"07:00"}]'::jsonb,
    '{"minutos_antes":30,"minutos_despues_fin":30}'::jsonb,
    now()
  )
on conflict (sucursal_id) do update set
  tipo_horario = excluded.tipo_horario,
  subtipo = excluded.subtipo,
  inicio = excluded.inicio,
  turnos = excluded.turnos,
  tolerancia = excluded.tolerancia,
  updated_at = excluded.updated_at;

-- Refresca el schema cache de PostgREST para que el POS vea la tabla al instante
notify pgrst, 'reload schema';

select
  true as ok,
  (select count(*)::int from public.pos_turnos_config) as filas,
  'pos_turnos_config lista — recarga la app / Configuración → Turnos de caja' as mensaje;
