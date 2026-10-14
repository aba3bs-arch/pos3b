-- =============================================================================
-- POS 3B — Cancelación / devolución de ventas en ruta
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- Solicitud → notificación PIN admin → revierte camión, CxC, tránsito RC/VentaRuta, compra
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ruta_cancelaciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado              TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'cancelado')),
  venta_id            UUID,
  folio_venta         TEXT NOT NULL,
  carga_id            TEXT,
  cliente_tipo        TEXT,
  cliente_id          TEXT,
  cliente_nombre      TEXT,
  metodo_pago         TEXT,
  total               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  monto_efectivo      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  monto_credito       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  articulos           JSONB,
  transito_id         TEXT,
  compra_id           TEXT,
  vendedor_nombre     TEXT,
  sucursal_id         TEXT NOT NULL DEFAULT 'MAIN',
  motivo              TEXT,
  solicitado_por      TEXT,
  solicitado_por_id   TEXT,
  admin_id            TEXT,
  admin_nombre        TEXT,
  aprobado_at         TIMESTAMPTZ,
  motivo_rechazo      TEXT,
  resultado           JSONB,
  meta                JSONB
);

CREATE INDEX IF NOT EXISTS idx_ruta_cancel_estado
  ON public.ruta_cancelaciones (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ruta_cancel_folio
  ON public.ruta_cancelaciones (folio_venta);
CREATE INDEX IF NOT EXISTS idx_ruta_cancel_venta
  ON public.ruta_cancelaciones (venta_id);

ALTER TABLE public.ruta_ventas
  ADD COLUMN IF NOT EXISTS estado TEXT;

CREATE INDEX IF NOT EXISTS idx_ruta_ventas_estado
  ON public.ruta_ventas (estado);

ALTER TABLE public.ruta_cancelaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ruta_cancel_anon" ON public.ruta_cancelaciones;
DROP POLICY IF EXISTS "ruta_cancel_auth" ON public.ruta_cancelaciones;

CREATE POLICY "ruta_cancel_anon" ON public.ruta_cancelaciones
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ruta_cancel_auth" ON public.ruta_cancelaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
