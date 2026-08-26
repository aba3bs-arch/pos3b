-- =============================================================================
-- POS 3B — Hora límite de vales sin autorización (global, hora Sonora)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Antes: Configuración → Vales → Horario sin autorización.
-- Cada caja sincroniza al iniciar sesión (evita que una tienda quede en 09:00
-- mientras el admin ya puso 10:45 en otro equipo).

create table if not exists public.pos_hora_limite_vale (
  id text primary key default 'GLOBAL',
  etiqueta text not null default '09:00',
  minutos int not null default 540,
  updated_at timestamptz not null default now()
);

alter table public.pos_hora_limite_vale
  add column if not exists etiqueta text;

alter table public.pos_hora_limite_vale
  add column if not exists minutos int;

alter table public.pos_hora_limite_vale
  add column if not exists updated_at timestamptz;

alter table public.pos_hora_limite_vale enable row level security;

drop policy if exists pos_hora_limite_vale_anon_all on public.pos_hora_limite_vale;
create policy pos_hora_limite_vale_anon_all on public.pos_hora_limite_vale
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.pos_hora_limite_vale (id, etiqueta, minutos, updated_at)
values ('GLOBAL', '09:00', 540, now())
on conflict (id) do nothing;

comment on table public.pos_hora_limite_vale is
  'Hora límite (Sonora) para vales gasolina/herramienta/accesorios sin aprobación admin. Una sola fila GLOBAL.';
