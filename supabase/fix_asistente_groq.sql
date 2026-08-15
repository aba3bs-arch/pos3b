-- Asistente Groq (Ayuda → Asistente).
-- Supabase → SQL Editor → pega TODO esto → Run.
-- Si sale una fila (id = global), ya quedó. Luego Configuración → Asistente Groq.

create table if not exists public.pos_asistente (
  id text primary key default 'global',
  groq_api_key text,
  updated_at timestamptz not null default now()
);

alter table public.pos_asistente enable row level security;

drop policy if exists pos_asistente_anon_all on public.pos_asistente;
create policy pos_asistente_anon_all on public.pos_asistente
  for all to anon, authenticated
  using (true)
  with check (true);

grant all on table public.pos_asistente to anon, authenticated, service_role;

insert into public.pos_asistente (id, groq_api_key)
values ('global', null)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

select id, (groq_api_key is not null) as tiene_clave, updated_at
from public.pos_asistente
where id = 'global';
