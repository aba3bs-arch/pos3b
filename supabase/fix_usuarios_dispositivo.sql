-- =============================================================================
-- POS 3B — Dispositivos por usuario
-- Cajero: hasta 2. Repartidor / Técnico / Auditor: 1 (2.º con autorización admin).
-- Seguro re-ejecutar.
-- =============================================================================
alter table public.usuarios add column if not exists dispositivo_id text;
alter table public.usuarios add column if not exists dispositivo_id_2 text;
alter table public.usuarios add column if not exists dispositivo_vinculado_at timestamptz;

create index if not exists idx_usuarios_dispositivo on public.usuarios (dispositivo_id) where dispositivo_id is not null;
create index if not exists idx_usuarios_dispositivo_2 on public.usuarios (dispositivo_id_2) where dispositivo_id_2 is not null;
