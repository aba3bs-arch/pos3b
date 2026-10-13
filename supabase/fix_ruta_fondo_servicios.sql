-- Fondo de servicios (CFE y otros) · Venta en Ruta / RC VentaRuta
-- Solicitud del recolector → aprobación PIN cajero → gasto en corte → ledger Fondo

CREATE TABLE IF NOT EXISTS ruta_fondo_solicitudes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'cancelado')),
  servicio_clave    TEXT NOT NULL,
  servicio_nombre   TEXT NOT NULL,
  servicio_id       INTEGER,
  monto             NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
  sucursal_id       TEXT NOT NULL,
  modulo_corte      TEXT NOT NULL DEFAULT 'abarrotes'
                    CHECK (modulo_corte IN ('abarrotes', 'virtual', 'garage')),
  repartidor_id     TEXT,
  repartidor_nombre TEXT,
  solicitado_por    TEXT,
  nota              TEXT,
  cajero_id         TEXT,
  cajero_nombre     TEXT,
  aprobado_at       TIMESTAMPTZ,
  gasto_id          TEXT,
  movimiento_fondo_id UUID,
  motivo_rechazo    TEXT
);

CREATE INDEX IF NOT EXISTS idx_ruta_fondo_sol_estado ON ruta_fondo_solicitudes (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ruta_fondo_sol_suc ON ruta_fondo_solicitudes (sucursal_id, estado);

CREATE TABLE IF NOT EXISTS ruta_fondo_movimientos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo              TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  servicio_clave    TEXT NOT NULL,
  servicio_nombre   TEXT NOT NULL,
  monto             NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
  sucursal_id       TEXT,
  modulo_corte      TEXT,
  repartidor_id     TEXT,
  repartidor_nombre TEXT,
  cajero_nombre     TEXT,
  usuario_nombre    TEXT,
  concepto          TEXT,
  solicitud_id      UUID REFERENCES ruta_fondo_solicitudes(id) ON DELETE SET NULL,
  gasto_id          TEXT,
  meta              JSONB
);

CREATE INDEX IF NOT EXISTS idx_ruta_fondo_mov_srv ON ruta_fondo_movimientos (servicio_clave, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ruta_fondo_mov_tipo ON ruta_fondo_movimientos (tipo, created_at DESC);

ALTER TABLE ruta_fondo_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruta_fondo_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ruta_fondo_sol_anon" ON ruta_fondo_solicitudes;
DROP POLICY IF EXISTS "ruta_fondo_sol_auth" ON ruta_fondo_solicitudes;
DROP POLICY IF EXISTS "ruta_fondo_mov_anon" ON ruta_fondo_movimientos;
DROP POLICY IF EXISTS "ruta_fondo_mov_auth" ON ruta_fondo_movimientos;

CREATE POLICY "ruta_fondo_sol_anon" ON ruta_fondo_solicitudes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ruta_fondo_sol_auth" ON ruta_fondo_solicitudes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ruta_fondo_mov_anon" ON ruta_fondo_movimientos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ruta_fondo_mov_auth" ON ruta_fondo_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime: la caja de sucursal escucha solicitudes nuevas (alerta PIN cajero).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemename = 'public'
      and tablename = 'ruta_fondo_solicitudes'
  ) then
    alter publication supabase_realtime add table public.ruta_fondo_solicitudes;
  end if;
exception
  when others then
    raise notice 'No se pudo agregar ruta_fondo_solicitudes a realtime: %', sqlerrm;
end $$;
