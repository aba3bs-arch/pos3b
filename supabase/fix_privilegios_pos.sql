-- Privilegios globales del POS (módulos por rol / usuario) — sincroniza todas las cajas.
create table if not exists public.pos_privilegios (
  id text primary key default 'global',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pos_privilegios enable row level security;

drop policy if exists pos_privilegios_anon_all on public.pos_privilegios;
create policy pos_privilegios_anon_all on public.pos_privilegios
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.pos_privilegios (id, data)
values ('global', '{}'::jsonb)
on conflict (id) do nothing;
