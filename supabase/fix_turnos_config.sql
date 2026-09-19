-- =============================================================================
-- POS 3B — fix_turnos_config.sql
-- Horarios de caja (turnos) por sucursal → tabla public.pos_turnos_config
--
-- CÓMO USARLO:
--   1) Supabase → SQL Editor
--   2) Copia TODO este archivo y pégalo
--   3) Run / Ejecutar
--   4) Debe aparecer ok = true
--
-- IMPORTANTE: NO sobrescribe horarios ni tolerancia que ya existan.
--   Solo crea la tabla y siembra GLOBAL/FUSION si faltan.
-- Seguro re-ejecutar.
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

alter table public.pos_turnos_config add column if not exists tipo_horario text;
alter table public.pos_turnos_config add column if not exists subtipo text;
alter table public.pos_turnos_config add column if not exists inicio text;
alter table public.pos_turnos_config add column if not exists turnos jsonb;
alter table public.pos_turnos_config add column if not exists tolerancia jsonb;
alter table public.pos_turnos_config add column if not exists patrones_rotacion_3 jsonb;
alter table public.pos_turnos_config add column if not exists updated_at timestamptz;

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

-- Semilla SOLO si no existe (no pisa horarios/tolerancia ya configurados).
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
on conflict (sucursal_id) do nothing;

-- ---------------------------------------------------------------------------
-- RECUPERAR LOGIN (si un seed anterior dejó a cajeros "fuera de horario"):
-- Descomenta el bloque siguiente, ejecuta, y vuelve a entrar.
-- Amplía tolerancia a ±2 h en todas las tiendas sin cambiar los horarios.
-- ---------------------------------------------------------------------------
-- update public.pos_turnos_config
-- set
--   tolerancia = '{"minutos_antes":120,"minutos_despues_fin":120}'::jsonb,
--   updated_at = now();

notify pgrst, 'reload schema';

select
  true as ok,
  (select count(*)::int from public.pos_turnos_config) as filas,
  'pos_turnos_config lista — Admin siempre puede entrar; cajeros según horario+tolerancia' as mensaje;
