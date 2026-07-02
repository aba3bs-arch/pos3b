-- Control de efectivo / recolecciones (compatible con control_efectivo Streamlit)
-- Ejecutar en Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS repartidores (
    id          VARCHAR(50) PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    pin         VARCHAR(4) NOT NULL,
    activo      BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS transito_efectivo (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_hora          TIMESTAMPTZ DEFAULT NOW(),
    sucursal_origen     VARCHAR(50) NOT NULL,
    repartidor_id       VARCHAR(50) REFERENCES repartidores(id),
    cajero_nombre       VARCHAR(100) NOT NULL,
    monto               NUMERIC(10, 2) NOT NULL CHECK (monto > 0),
    num_traspaso        VARCHAR(50),
    foto_url            TEXT,
    estatus             VARCHAR(30) DEFAULT 'En Tránsito',
    tipo_movimiento     VARCHAR(50),
    descripcion_gasto   VARCHAR(200),
    fecha_liquidacion   TIMESTAMPTZ,
    usuario_liquida     VARCHAR(100)
);

ALTER TABLE transito_efectivo ADD COLUMN IF NOT EXISTS num_traspaso        VARCHAR(50);
ALTER TABLE transito_efectivo ADD COLUMN IF NOT EXISTS tipo_movimiento     VARCHAR(50);
ALTER TABLE transito_efectivo ADD COLUMN IF NOT EXISTS descripcion_gasto   VARCHAR(200);
ALTER TABLE transito_efectivo ADD COLUMN IF NOT EXISTS fecha_liquidacion   TIMESTAMPTZ;
ALTER TABLE transito_efectivo ADD COLUMN IF NOT EXISTS usuario_liquida     VARCHAR(100);
ALTER TABLE transito_efectivo ADD COLUMN IF NOT EXISTS foto_url            TEXT;
ALTER TABLE transito_efectivo ADD COLUMN IF NOT EXISTS estatus             VARCHAR(30) DEFAULT 'En Tránsito';

INSERT INTO repartidores (id, nombre, pin, activo)
SELECT 'rep_misael', 'Misael Rodríguez', '1423', TRUE
WHERE NOT EXISTS (SELECT 1 FROM repartidores LIMIT 1);

ALTER TABLE repartidores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transito_efectivo ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT policyname, tablename FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('repartidores', 'transito_efectivo')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

CREATE POLICY "ce_anon_all_repartidores" ON repartidores FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ce_auth_all_repartidores" ON repartidores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ce_anon_all_transito" ON transito_efectivo FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ce_auth_all_transito" ON transito_efectivo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_transito_sucursal_estatus ON transito_efectivo (sucursal_origen, estatus);
CREATE INDEX IF NOT EXISTS idx_transito_folio ON transito_efectivo (num_traspaso);
CREATE INDEX IF NOT EXISTS idx_transito_repartidor ON transito_efectivo (repartidor_id, estatus);
