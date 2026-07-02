-- Servicios a cobrar (CFE, etc.) — ejecutar en Supabase si no existe
CREATE TABLE IF NOT EXISTS servicios_cobro (
    id              SERIAL PRIMARY KEY,
    clave           VARCHAR(30) UNIQUE NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    monto_default   NUMERIC(10, 2) NOT NULL DEFAULT 50.00 CHECK (monto_default > 0),
    tipo            VARCHAR(20) NOT NULL DEFAULT 'Fijo',
    frecuencia      VARCHAR(20) NOT NULL DEFAULT 'Diario',
    vigencia_inicio DATE,
    vigencia_fin    DATE,
    obligatorio     BOOLEAN DEFAULT TRUE,
    activo          BOOLEAN DEFAULT TRUE
);

INSERT INTO servicios_cobro (clave, nombre, monto_default, tipo, frecuencia, obligatorio, activo)
SELECT 'CFE', 'CFE Luz', 50.00, 'Fijo', 'Diario', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM servicios_cobro WHERE clave = 'CFE');

ALTER TABLE servicios_cobro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ce_anon_all_servicios_cobro" ON servicios_cobro;
DROP POLICY IF EXISTS "ce_auth_all_servicios_cobro" ON servicios_cobro;

CREATE POLICY "ce_anon_all_servicios_cobro" ON servicios_cobro FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ce_auth_all_servicios_cobro" ON servicios_cobro FOR ALL TO authenticated USING (true) WITH CHECK (true);
