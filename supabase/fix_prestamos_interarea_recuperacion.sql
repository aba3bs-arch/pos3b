-- =============================================================================
-- POS 3B — Préstamos interárea: estados de recuperación automática
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Estados de negocio (texto libre; la app los escribe):
--   recuperar       → deuda abierta; área de origen en negativo / por recuperar con ventas
--   por_recolectar  → se recolectó Virtual (u origen) con saldo aún pendiente
--   recuperado      → saldo 0 (auto al salir del negativo, o liquidación manual)
-- Compatibilidad: 'activo' se trata como recuperar; 'liquidado' como recuperado.
-- =============================================================================

comment on column public.prestamos_interarea.estado is
  'recuperar | por_recolectar | recuperado | activo | liquidado | cancelado';

-- Índice para sincronizar recuperación por origen + estado abierto
create index if not exists idx_prestamos_interarea_origen_estado
  on public.prestamos_interarea (sucursal_id, origen, estado);
