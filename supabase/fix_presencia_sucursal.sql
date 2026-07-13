-- Presencia de POS por sucursal (punto verde en el selector de tiendas).
-- Cada caja con sesión activa hace upsert periódico; “en línea” = last_seen reciente.
create table if not exists public.pos_presencia_sucursal (
  sucursal_id text primary key,
  last_seen timestamptz not null default now(),
  usuario_nombre text,
  dispositivo_id text
);

comment on table public.pos_presencia_sucursal is
  'Última actividad del POS por sucursal. En línea si last_seen < ~2.5 min.';

alter table public.pos_presencia_sucursal enable row level security;

drop policy if exists pos_presencia_sucursal_anon_all on public.pos_presencia_sucursal;
create policy pos_presencia_sucursal_anon_all on public.pos_presencia_sucursal
  for all to anon, authenticated
  using (true)
  with check (true);
