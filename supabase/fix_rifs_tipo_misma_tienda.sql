-- =============================================================================
-- POS 3B — RIF: tipo misma tienda (compra de mercancía)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- intertienda (default): fondo entre tiendas distintas
-- misma_tienda_mercancia: requisición de fondo para comprar mercancía en la misma tienda

alter table public.rifs
  add column if not exists tipo text not null default 'intertienda';

comment on column public.rifs.tipo is
  'intertienda | misma_tienda_mercancia';

create index if not exists idx_rifs_tipo_estado
  on public.rifs (tipo, estado, created_at desc);
