/**
 * Genera supabase/functions/corte-general-abarrotes/index.ts con la MISMA lógica del POS
 * (src/lib/corteAbarrotesDiario.js) empaquetada en un solo archivo para Deno.
 *
 *   node scripts/build-edge-corte-general.mjs
 *
 * Vuelve a ejecutarlo y a desplegar la función cada vez que cambie corteAbarrotesDiario.js
 * (o cualquier archivo que importe).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = path.join(RAIZ, 'src/lib/corteAbarrotesDiario.js');
const SALIDA = path.join(RAIZ, 'supabase/functions/corte-general-abarrotes/index.ts');

const r = await build({
  entryPoints: [ENTRADA],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'corteGeneral',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  define: { 'import.meta.env': '{}' },
  target: 'es2022',
  logLevel: 'error',
});
const bundle = r.outputFiles[0].text;

const cabecera = `// @ts-nocheck
/**
 * Edge Function: corte de caja general de Abarrotes (CGA-00001…) a medianoche, sin depender de la app.
 *
 * ARCHIVO GENERADO por scripts/build-edge-corte-general.mjs. No lo edites a mano:
 * cambia src/lib/corteAbarrotesDiario.js y vuelve a generar.
 *
 * La invoca pg_cron (supabase/cron_corte_general_abarrotes.sql) con el header x-cron-secret.
 * Secrets en Supabase → Edge Functions → Secrets:
 *   CRON_SECRET   (el mismo valor que guardas en Vault; ver el SQL)
 *   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (automáticos en hosted)
 *
 * Es idempotente: si el corte de un día ya existe, no hace nada. Se puede invocar a mano con
 * body JSON opcional { "sucursal": "3B5", "desde": "2026-11-13", "hasta": "2026-11-20" }.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

`;

const handler = `

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const esperado = Deno.env.get('CRON_SECRET') || '';
  if (!esperado || req.headers.get('x-cron-secret') !== esperado) {
    return json({ ok: false, error: 'No autorizado.' }, 401);
  }
  const url = Deno.env.get('SUPABASE_URL') || '';
  const llave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !llave) return json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' }, 500);

  let opciones = {};
  try {
    const texto = await req.text();
    if (texto) opciones = JSON.parse(texto) || {};
  } catch {
    return json({ ok: false, error: 'Body JSON inválido.' }, 400);
  }

  const supabase = createClient(url, llave, { auth: { persistSession: false } });
  try {
    const r = await corteGeneral.asegurarCortesDiariosAbarrotes(supabase, {
      sucursal: opciones.sucursal || null,
      desde: opciones.desde || null,
      hasta: opciones.hasta || null,
      now: new Date(),
    });
    const resultados = r.resultados || [];
    const creados = resultados.filter((x) => x.created).map((x) => ({ sucursal: x.sucursal, fecha: x.fecha, folio: x.data?.folio }));
    const errores = resultados.filter((x) => x.ok === false).map((x) => ({ sucursal: x.sucursal, fecha: x.fecha, error: x.error }));
    const ok = r.ok !== false && errores.length === 0;
    return json({ ok, creados: creados.length, revisados: r.revisados || 0, detalle: creados, errores }, ok ? 200 : 500);
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
});
`;

fs.writeFileSync(SALIDA, cabecera + bundle + handler);
console.log(`Generado: ${path.relative(RAIZ, SALIDA)} (${(fs.statSync(SALIDA).size / 1024).toFixed(0)} KB)`);
