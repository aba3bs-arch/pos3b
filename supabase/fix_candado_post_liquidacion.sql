-- =============================================================================
-- POS 3B — Candado de recolección post-liquidación (global ON/OFF)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Configuración → Operación → Candado post-liquidación.
-- ON: si el recolector ya liquidó hoy, no se acepta más efectivo (solo crédito).
-- OFF: se puede seguir cobrando efectivo tras liquidar (sigue el aviso al admin).

create table if not exists public.pos_candado_post_liquidacion (
  id text primary key default 'GLOBAL',
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.pos_candado_post_liquidacion
  add column if not exists activo boolean;

alter table public.pos_candado_post_liquidacion
  add column if not exists updated_at timestamptz;

alter table public.pos_candado_post_liquidacion enable row level security;

drop policy if exists pos_candado_post_liquidacion_anon_all on public.pos_candado_post_liquidacion;
create policy pos_candado_post_liquidacion_anon_all on public.pos_candado_post_liquidacion
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.pos_candado_post_liquidacion (id, activo, updated_at)
values ('GLOBAL', true, now())
on conflict (id) do nothing;

comment on table public.pos_candado_post_liquidacion is
  'Candado global: bloquear cobros de efectivo después de liquidar el día. Una sola fila GLOBAL.';
