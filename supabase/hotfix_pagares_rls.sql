-- HOTFIX rápido: "new row violates row-level security policy for table pagares"
-- Pegar completo en Supabase → SQL Editor → Run

alter table public.pagares enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'pagares'
  loop
    execute format('drop policy if exists %I on public.pagares', r.policyname);
  end loop;
end $$;

create policy "pagares_select_all"
  on public.pagares for select
  to anon, authenticated, public
  using (true);

create policy "pagares_insert_all"
  on public.pagares for insert
  to anon, authenticated, public
  with check (true);

create policy "pagares_update_all"
  on public.pagares for update
  to anon, authenticated, public
  using (true) with check (true);

create policy "pagares_delete_all"
  on public.pagares for delete
  to anon, authenticated, public
  using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.pagares to anon, authenticated, public;
grant all on public.pagares to service_role;

notify pgrst, 'reload schema';
