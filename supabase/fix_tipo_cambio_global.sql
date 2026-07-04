-- Tipo de cambio global del POS — sincroniza todas las sucursales desde administración MAIN.
create table if not exists public.pos_config (
  id text primary key default 'global',
  tipo_cambio numeric(12, 4) not null default 17.5,
  updated_at timestamptz not null default now()
);

alter table public.pos_config enable row level security;

drop policy if exists pos_config_anon_all on public.pos_config;
create policy pos_config_anon_all on public.pos_config
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.pos_config (id, tipo_cambio)
values ('global', 17.5)
on conflict (id) do nothing;
