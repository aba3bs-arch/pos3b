import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const { sincronizarColaVentasOffline, LS_COLA_VENTAS_OFFLINE } = await import('./ventasOffline.js');

const base = { vendedor: 'Ana', usuario_id: 'u1', sucursal_id: '3B5', total: 50, metodo_pago: 'Efectivo', articulos: [], turno_id: 'diurno', turno_nombre: 'Turno diurno' };
store.set(LS_COLA_VENTAS_OFFLINE, JSON.stringify([
  { ...base, id: 'off-1', estado: 'pendiente', created_at: '2026-11-13T19:00:00.000Z' },
  { ...base, id: 'off-2', estado: 'pendiente', created_at: '2026-11-13T19:05:00.000Z' },
]));

const insertados = [];
const yaEnNube = new Set(['2026-11-13T19:00:00.000Z']);
const supabase = {
  from(tabla) {
    const f = {};
    const q = {
      select() { return q; },
      eq(col, val) { f[col] = val; return q; },
      limit() { return Promise.resolve({ data: tabla === 'ventas' && yaEnNube.has(f.created_at) ? [{ id: 'nube-1' }] : [], error: null }); },
      insert(rows) { insertados.push(rows[0]); return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'nuevo' }, error: null }) }) }; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    };
    return q;
  },
};
// sondarConexionSupabase hace select('id').limit(1) sobre productos.
const r = await sincronizarColaVentasOffline(supabase, {});
assert.equal(r.synced, 2);
assert.equal(insertados.length, 1, 'la venta que ya estaba en la nube no se vuelve a insertar');
assert.equal(insertados[0].created_at, '2026-11-13T19:05:00.000Z');
assert.equal(JSON.parse(store.get(LS_COLA_VENTAS_OFFLINE)).length, 0, 'la cola queda vacía');
console.log('ventasOffline.sinDuplicar.test.mjs OK');
