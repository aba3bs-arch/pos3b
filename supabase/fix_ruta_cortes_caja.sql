-- =============================================================================
-- Cortes de caja de Venta en Ruta (opcional; la app también guarda en localStorage)
-- =============================================================================

create table if not exists public.ruta_cortes_caja (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid,
  carga_folio text,
  vendedor_id text,
  vendedor_nombre text,
  fecha date not null default (timezone('America/Hermosillo', now()))::date,
  tickets int not null default 0,
  total_ventas numeric(12,2) not null default 0,
  efectivo_esperado numeric(12,2) not null default 0,
  credito numeric(12,2) not null default 0,
  efectivo_contado numeric(12,2),
  diferencia numeric(12,2),
  por_metodo jsonb not null default '{}'::jsonb,
  notas text,
  usuario text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ruta_cortes_fecha on public.ruta_cortes_caja (fecha desc, created_at desc);
create index if not exists idx_ruta_cortes_carga on public.ruta_cortes_caja (carga_id);

alter table public.ruta_cortes_caja enable row level security;
drop policy if exists "ruta_cortes_caja_anon" on public.ruta_cortes_caja;
create policy "ruta_cortes_caja_anon" on public.ruta_cortes_caja for all using (true) with check (true);

comment on table public.ruta_cortes_caja is
  'Arqueo de ventas de Venta en Ruta (camión). Independiente de cortes_caja de tienda.';
