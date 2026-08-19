-- POS 3B — Configuración global del sistema de bonos por recolección
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)

create table if not exists public.pos_bonos_config (
  id text primary key default 'global',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pos_bonos_config enable row level security;

drop policy if exists "pos_bonos_config_anon_rw" on public.pos_bonos_config;
create policy "pos_bonos_config_anon_rw" on public.pos_bonos_config
  for all using (true) with check (true);

insert into public.pos_bonos_config (id, config, updated_at)
values ('global', '{}'::jsonb, now())
on conflict (id) do nothing;

comment on table public.pos_bonos_config is
  'Parámetros del bono por recolección (rangos, % cumplimiento, umbrales). Sincronizado entre cajas.';
