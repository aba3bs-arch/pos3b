-- HOTFIX rapido si solo falla INSERT (RLS).
-- Mejor: pega TODO supabase/fix_pagares.sql
-- Pegar en Supabase → SQL Editor → Run (sin prompts).

alter table public.pagares enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'pagares'
  loop
    execute format('drop policy if exists %I on public.pagares', r.policyname);
  end loop;
end $$;

drop policy if exists "pagares_anon_rw" on public.pagares;
drop policy if exists "pagares_auth_rw" on public.pagares;
drop policy if exists "pagares_public_rw" on public.pagares;

create policy "pagares_anon_rw"
  on public.pagares for all to anon
  using (true) with check (true);

create policy "pagares_auth_rw"
  on public.pagares for all to authenticated
  using (true) with check (true);

create policy "pagares_public_rw"
  on public.pagares for all to public
  using (true) with check (true);

grant select, insert, update, delete on public.pagares to anon, authenticated, public;
notify pgrst, 'reload schema';

select count(*) as politicas_rls
from pg_policies
where schemaname = 'public' and tablename = 'pagares';
