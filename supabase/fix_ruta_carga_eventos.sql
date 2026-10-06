-- =============================================================================
-- POS 3B — Eventos de carga al camión (ticket / aclaraciones)
-- Cada vez que se aplica mercancía CEDIS → camión se guarda un registro
-- append-only con las líneas de ESA aplicación (no el acumulado de la carga).
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).
-- =============================================================================

create table if not exists public.ruta_carga_eventos (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  carga_id uuid references public.ruta_cargas(id) on delete set null,
  carga_folio text,
  camion_id text,
  camion_etiqueta text,
  vendedor_id text,
  vendedor_nombre text,
  usuario_id text,
  usuario_nombre text,
  reusada boolean not null default false,
  carga_cerrada_por_vacia boolean not null default false,
  piezas numeric(14,3) not null default 0,
  total numeric(12,2) not null default 0,
  lineas jsonb not null default '[]'::jsonb,
  notas text,
  created_at timestamptz not null default now()
);

comment on table public.ruta_carga_eventos is
  'Registro por aplicación de carga al camión (ticket CEDIS→ruta) para aclaraciones.';

create unique index if not exists idx_ruta_carga_eventos_folio
  on public.ruta_carga_eventos (folio);

create index if not exists idx_ruta_carga_eventos_created
  on public.ruta_carga_eventos (created_at desc);

create index if not exists idx_ruta_carga_eventos_carga
  on public.ruta_carga_eventos (carga_id, created_at desc);

create index if not exists idx_ruta_carga_eventos_camion
  on public.ruta_carga_eventos (camion_id, created_at desc)
  where camion_id is not null;

alter table public.ruta_carga_eventos enable row level security;

drop policy if exists ruta_carga_eventos_anon_all on public.ruta_carga_eventos;
drop policy if exists ruta_carga_eventos_select on public.ruta_carga_eventos;
drop policy if exists ruta_carga_eventos_insert on public.ruta_carga_eventos;

create policy ruta_carga_eventos_select on public.ruta_carga_eventos
  for select to anon, authenticated
  using (true);

create policy ruta_carga_eventos_insert on public.ruta_carga_eventos
  for insert to anon, authenticated
  with check (true);

-- Append-only: sin update/delete
revoke update, delete on public.ruta_carga_eventos from anon, authenticated;
grant select, insert on public.ruta_carga_eventos to anon, authenticated;
