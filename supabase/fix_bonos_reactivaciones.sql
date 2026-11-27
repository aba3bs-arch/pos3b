-- =============================================================================
-- POS 3B — bonos_reactivaciones
-- Reactiva el bono de un empleado de tienda (directo) a partir de una fecha.
-- Las faltas anteriores a esa fecha dejan de bloquear. Una falta posterior
-- vuelve a aplicar el ban de 7 días.
-- Uso: Supabase → SQL Editor → pegar y Run (idempotente).
-- =============================================================================

create table if not exists public.bonos_reactivaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id text not null,
  nombre text,
  sucursal_id text not null,
  vuelve_ymd date not null,
  motivo text,
  autorizado_por text,
  autorizado_por_rol text,
  created_at timestamptz not null default now()
);

create unique index if not exists bonos_reactivaciones_usuario_uidx
  on public.bonos_reactivaciones (usuario_id);

create index if not exists bonos_reactivaciones_suc_idx
  on public.bonos_reactivaciones (sucursal_id, vuelve_ymd desc);

comment on table public.bonos_reactivaciones is
  'Reactivación de bono por empleado de tienda. Faltas anteriores a vuelve_ymd no bloquean.';

alter table public.bonos_reactivaciones enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'bonos_reactivaciones'
  loop
    execute format('drop policy if exists %I on public.bonos_reactivaciones', r.policyname);
  end loop;
end $$;

create policy bonos_reactivaciones_select_all
  on public.bonos_reactivaciones for select
  to anon, authenticated, public
  using (true);

create policy bonos_reactivaciones_insert_all
  on public.bonos_reactivaciones for insert
  to anon, authenticated, public
  with check (true);

create policy bonos_reactivaciones_update_all
  on public.bonos_reactivaciones for update
  to anon, authenticated, public
  using (true)
  with check (true);

create policy bonos_reactivaciones_delete_all
  on public.bonos_reactivaciones for delete
  to anon, authenticated, public
  using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.bonos_reactivaciones to anon, authenticated, public;
grant all on public.bonos_reactivaciones to service_role;

notify pgrst, 'reload schema';

select true as ok, to_regclass('public.bonos_reactivaciones') is not null as tabla_ok;
