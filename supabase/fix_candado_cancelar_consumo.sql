-- =============================================================================
-- POS 3B — Candado de consumo por empleado
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Configuración → Operación → Cancelar consumo.
-- Por empleado: cancelar ON/OFF y límite de consumo del día.
-- empleados es un json { "id-usuario": { id, nombre, cancelar, limite } }.

create table if not exists public.pos_candado_cancelar_consumo (
  id text primary key default 'GLOBAL',
  directos boolean not null default true,
  indirectos boolean not null default true,
  empleados jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pos_candado_cancelar_consumo
  add column if not exists directos boolean;

alter table public.pos_candado_cancelar_consumo
  add column if not exists indirectos boolean;

alter table public.pos_candado_cancelar_consumo
  add column if not exists empleados jsonb;

alter table public.pos_candado_cancelar_consumo
  add column if not exists updated_at timestamptz;

update public.pos_candado_cancelar_consumo
set empleados = '{}'::jsonb
where empleados is null;

alter table public.pos_candado_cancelar_consumo enable row level security;

drop policy if exists pos_candado_cancelar_consumo_anon_all on public.pos_candado_cancelar_consumo;
create policy pos_candado_cancelar_consumo_anon_all on public.pos_candado_cancelar_consumo
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.pos_candado_cancelar_consumo (id, directos, indirectos, empleados, updated_at)
values ('GLOBAL', true, true, '{}'::jsonb, now())
on conflict (id) do nothing;

comment on table public.pos_candado_cancelar_consumo is
  'Candado de consumo por empleado. empleados json: cancelar true/false y limite del día (null = sin límite).';
