-- =============================================================================
-- POS 3B — Candado para cancelar consumo (directos / indirectos)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Configuración → Operación → Cancelar consumo.
-- ON: se puede cancelar el consumo de ese grupo.
-- OFF: el consumo no se puede borrar (vale ni gasto de corte).

create table if not exists public.pos_candado_cancelar_consumo (
  id text primary key default 'GLOBAL',
  directos boolean not null default true,
  indirectos boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.pos_candado_cancelar_consumo
  add column if not exists directos boolean;

alter table public.pos_candado_cancelar_consumo
  add column if not exists indirectos boolean;

alter table public.pos_candado_cancelar_consumo
  add column if not exists updated_at timestamptz;

alter table public.pos_candado_cancelar_consumo enable row level security;

drop policy if exists pos_candado_cancelar_consumo_anon_all on public.pos_candado_cancelar_consumo;
create policy pos_candado_cancelar_consumo_anon_all on public.pos_candado_cancelar_consumo
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.pos_candado_cancelar_consumo (id, directos, indirectos, updated_at)
values ('GLOBAL', true, true, now())
on conflict (id) do nothing;

comment on table public.pos_candado_cancelar_consumo is
  'Candado global para cancelar consumo. directos = empleados de tienda. indirectos = MAIN. true = se puede cancelar.';
