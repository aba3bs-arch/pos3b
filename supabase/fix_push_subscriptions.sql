-- Suscripciones Web Push (VAPID) para alertas con la app cerrada.
-- Ejecutar en Supabase → SQL Editor.
-- Luego despliega la Edge Function `enviar-push` (ver supabase/web_push_setup.md).

create table if not exists public.pos_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  usuario_nombre text,
  usuario_nombre text,
  rol text,
  dispositivo_id text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_push_subscriptions_rol_idx
  on public.pos_push_subscriptions (rol);

comment on table public.pos_push_subscriptions is
  'Endpoints Web Push de Admin/Gerente. La Edge Function enviar-push los usa con VAPID.';

alter table public.pos_push_subscriptions enable row level security;

drop policy if exists pos_push_subscriptions_anon_all on public.pos_push_subscriptions;
create policy pos_push_subscriptions_anon_all on public.pos_push_subscriptions
  for all to anon, authenticated
  using (true)
  with check (true);

-- Opcional: publicar realtime no es necesario para push (el servidor envía al SO).
