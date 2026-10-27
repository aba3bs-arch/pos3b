-- =============================================================================
-- POS 3B — Conciliación de Venta en Ruta (alertas persistentes)
-- Ejecutar en Supabase → SQL Editor. Seguro para volver a ejecutar.
-- Solo crea tablas de conciliación; no toca ventas, créditos, gastos ni inventario.
-- =============================================================================

create table if not exists public.ruta_conciliacion_alertas (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  control text not null,
  severidad text not null default 'media'
    check (severidad in ('critica', 'alta', 'media', 'baja')),
  estado text not null default 'abierta'
    check (estado in ('abierta', 'en_revision', 'justificada', 'resuelta', 'auto_resuelta')),
  mensaje text not null,
  sucursal_id text,
  tienda text,
  repartidor_id text,
  repartidor_nombre text,
  venta_id text,
  venta_folio text,
  venta_fecha timestamptz,
  carga_id text,
  compra_id text,
  esperado numeric(12,2),
  registrado numeric(12,2),
  diferencia numeric(12,2),
  unidad text,
  detalle jsonb not null default '{}'::jsonb,
  primera_vez_at timestamptz not null default now(),
  ultima_vez_at timestamptz not null default now(),
  resuelta_at timestamptz,
  resuelta_por text,
  nota_resolucion text,
  notificada_at timestamptz
);

create index if not exists idx_ruta_conc_alertas_estado
  on public.ruta_conciliacion_alertas (estado, severidad, ultima_vez_at desc);
create index if not exists idx_ruta_conc_alertas_sucursal
  on public.ruta_conciliacion_alertas (sucursal_id, estado);
create index if not exists idx_ruta_conc_alertas_venta
  on public.ruta_conciliacion_alertas (venta_id);

create table if not exists public.ruta_conciliacion_corridas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'manual',
  desde date,
  hasta date,
  completa boolean not null default true,
  ventas_revisadas integer not null default 0,
  alertas_nuevas integer not null default 0,
  alertas_resueltas integer not null default 0,
  duracion_ms integer,
  ejecutada_por text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ruta_conc_corridas_fecha
  on public.ruta_conciliacion_corridas (created_at desc);

alter table public.ruta_conciliacion_alertas enable row level security;
alter table public.ruta_conciliacion_corridas enable row level security;

drop policy if exists ruta_conc_alertas_acceso on public.ruta_conciliacion_alertas;
create policy ruta_conc_alertas_acceso on public.ruta_conciliacion_alertas
  for all to anon, authenticated using (true) with check (true);
drop policy if exists ruta_conc_corridas_acceso on public.ruta_conciliacion_corridas;
create policy ruta_conc_corridas_acceso on public.ruta_conciliacion_corridas
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update on public.ruta_conciliacion_alertas to anon, authenticated;
grant select, insert on public.ruta_conciliacion_corridas to anon, authenticated;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  raise notice 'reload schema: %', sqlerrm;
end $$;

select n.nspname as schema, c.relname as tabla
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('ruta_conciliacion_alertas', 'ruta_conciliacion_corridas')
order by c.relname;
