-- Presencia de POS por sucursal (punto verde en el selector de tiendas).
-- Cada caja con sesión activa hace upsert periódico; “en línea” = last_seen reciente.
create table if not exists public.pos_presencia_sucursal (
  sucursal_id text primary key,
  last_seen timestamptz not null default now(),
  usuario_nombre text,
  dispositivo_id text
);

comment on table public.pos_presencia_sucursal is
  'Última actividad del POS por sucursal fijada. En línea si last_seen < ~2 min. MAIN no cuenta.';

-- Si quedaron latidos falsos (p. ej. al navegar tiendas desde Central), limpia:
-- update public.pos_presencia_sucursal set last_seen = timestamptz '1970-01-01+00';

alter table public.pos_presencia_sucursal enable row level security;

drop policy if exists pos_presencia_sucursal_anon_all on public.pos_presencia_sucursal;
create policy pos_presencia_sucursal_anon_all on public.pos_presencia_sucursal
  for all to anon, authenticated
  using (true)
  with check (true);
