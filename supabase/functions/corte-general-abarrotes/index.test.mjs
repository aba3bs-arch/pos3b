import assert from 'node:assert/strict';
import fs from 'node:fs';

const fuente = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  .replace(/^import \{ createClient \} from 'npm:@supabase\/supabase-js@2';/m, '');

const inserts = [];
function constructor(tabla) {
  const st = { insert: null };
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k === 'then') {
        const filas = tabla === 'ventas'
          ? [{ id: 'v1', total: 250, metodo_pago: 'Efectivo', created_at: '2026-11-13T18:00:00Z', sucursal_id: '3B5', articulos: [] }]
          : [];
        return (res) => res({ data: st.insert || filas, error: null });
      }
      return (...a) => {
        if (k === 'insert') { st.insert = a[0][0]; inserts.push(a[0][0]); }
        if (k === 'single' || k === 'maybeSingle') return Promise.resolve({ data: st.insert || null, error: null });
        return p;
      };
    },
  });
  return p;
}

const FechaReal = Date;
const AHORA = new FechaReal('2026-11-14T07:10:00Z');
globalThis.Date = class extends FechaReal {
  constructor(...a) { super(...(a.length ? a : [AHORA.getTime()])); }
  static now() { return AHORA.getTime(); }
};

let handler = null;
const entorno = { CRON_SECRET: 'secreto', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const Deno = { env: { get: (k) => entorno[k] }, serve: (fn) => { handler = fn; } };
const createClient = () => ({ from: constructor });
new Function('Deno', 'createClient', fuente)(Deno, createClient);
assert.equal(typeof handler, 'function');

const llamar = (headers, body) => handler(new Request('https://x/f', { method: 'POST', headers, body }));

assert.equal((await llamar({})).status, 401, 'sin secreto');
assert.equal((await llamar({ 'x-cron-secret': 'otro' })).status, 401, 'secreto incorrecto');
assert.equal((await llamar({ 'x-cron-secret': 'secreto' }, '{no json')).status, 400);

const r = await llamar({ 'x-cron-secret': 'secreto' }, JSON.stringify({ sucursal: '3B5', desde: '2026-11-13', hasta: '2026-11-13' }));
const j = await r.json();
assert.equal(r.status, 200);
assert.equal(j.ok, true);
assert.equal(j.creados, 1);
assert.equal(j.detalle[0].folio, 'CGA-00001');
assert.equal(inserts[0].modulo, 'abarrotes');
assert.equal(inserts[0].detalle.tipo_cierre, 'cierre_diario');
assert.equal(inserts[0].detalle.fecha_negocio, '2026-11-13');
globalThis.Date = FechaReal;
console.log('supabase/functions/corte-general-abarrotes/index.test.mjs OK');
