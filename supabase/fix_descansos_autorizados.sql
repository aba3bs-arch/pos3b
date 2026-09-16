-- =============================================================================
-- POS 3B — descansos_autorizados
-- Autoriza un día concreto como descanso (cambio de descanso / permiso).
-- Ese día NO cuenta como falta para bono por recolección.
-- Uso: Supabase → SQL Editor → pegar y Run (idempotente).
-- =============================================================================

create table if not exists public.descansos_autorizados (
  id uuid primary key default gen_random_uuid(),
  usuario_id text not null,
  nombre text,
  sucursal_id text not null,
  fecha date not null,
  motivo text,
  autorizado_por text,
  autorizado_por_rol text,
  created_at timestamptz not null default now()
);

create unique index if not exists descansos_autorizados_uidx
  on public.descansos_autorizados (usuario_id, fecha);

create index if not exists descansos_autorizados_suc_fecha_idx
  on public.descansos_autorizados (sucursal_id, fecha desc);

create index if not exists descansos_autorizados_fecha_idx
  on public.descansos_autorizados (fecha desc);

comment on table public.descansos_autorizados is
  'Descanso autorizado por fecha (cambio de día de descanso). No cuenta como falta en bono.';

alter table public.descansos_autorizados enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'descansos_autorizados'
  loop
    execute format('drop policy if exists %I on public.descansos_autorizados', r.policyname);
  end loop;
end $$;

create policy descansos_autorizados_select_all
  on public.descansos_autorizados for select
  to anon, authenticated, public
  using (true);

create policy descansos_autorizados_insert_all
  on public.descansos_autorizados for insert
  to anon, authenticated, public
  with check (true);

create policy descansos_autorizados_update_all
  on public.descansos_autorizados for update
  to anon, authenticated, public
  using (true)
  with check (true);

create policy descansos_autorizados_delete_all
  on public.descansos_autorizados for delete
  to anon, authenticated, public
  using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.descansos_autorizados to anon, authenticated, public;
grant all on public.descansos_autorizados to service_role;

notify pgrst, 'reload schema';

select true as ok, to_regclass('public.descansos_autorizados') is not null as tabla_ok;
