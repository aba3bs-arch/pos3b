-- =============================================================================
-- POS 3B — Vincular PIN de cajero/repartidor al primer equipo de tienda fijada
-- Seguro re-ejecutar.
-- =============================================================================

alter table public.usuarios add column if not exists dispositivo_id text;
alter table public.usuarios add column if not exists dispositivo_vinculado_at timestamptz;

create index if not exists idx_usuarios_dispositivo on public.usuarios (dispositivo_id) where dispositivo_id is not null;
