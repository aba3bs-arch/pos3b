-- POS 3B — Plan horario semanal (Checador)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)

create table if not exists public.pos_plan_horario (
  id text primary key default 'global',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pos_plan_horario enable row level security;

drop policy if exists "pos_plan_horario_anon_rw" on public.pos_plan_horario;
create policy "pos_plan_horario_anon_rw" on public.pos_plan_horario
  for all using (true) with check (true);

insert into public.pos_plan_horario (id, config, updated_at)
values ('global', '{"version":1,"filas":[]}'::jsonb, now())
on conflict (id) do nothing;

comment on table public.pos_plan_horario is
  'Plantilla semanal del plan horario (turnos, descansos, colores y CT). Sincronizado entre cajas.';
