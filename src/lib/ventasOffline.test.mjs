/**
 * node --test src/lib/ventasOffline.test.mjs
 */
import assert from 'node:assert/strict';
import {
  contarVentasOfflinePendientes,
  encolarVentaOffline,
  esErrorDeRed,
  esUuid,
  filaInsertVenta,
  guardarCatalogoOffline,
  insertarVentaEnSupabase,
  leerCatalogoOffline,
  leerColaVentasOffline,
  LS_COLA_VENTAS_OFFLINE,
  sincronizarColaVentasOffline,
  sondarConexionSupabase,
} from './ventasOffline.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    store.set(k, String(v));
  },
  removeItem: (k) => {
    store.delete(k);
  },
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
globalThis.window = {
  dispatchEvent() {},
};

function limpiarCola() {
  store.delete(LS_COLA_VENTAS_OFFLINE);
}

assert.equal(esErrorDeRed({ message: 'TypeError: Failed to fetch' }), true);
assert.equal(esErrorDeRed({ message: '', details: 'NetworkError when attempting to fetch resource.' }), true);
assert.equal(esErrorDeRed(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), true);
assert.equal(esErrorDeRed(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), true);
assert.equal(esErrorDeRed({ message: 'duplicate key value', code: '23505' }), false);
assert.equal(esErrorDeRed(null), false);

const venta = encolarVentaOffline({
  vendedor: 'Ana',
  usuario_id: null,
  sucursal_id: '3b10',
  total: 20,
  metodo_pago: 'Efectivo',
  articulos: [{ id: '7501', nombre: 'Agua', precio: 20, qty: 1 }],
  turno_id: 'matutino',
  turno_nombre: 'Matutino',
  created_at: '2026-10-21T08:00:00.000Z',
  venta_uuid: '11111111-1111-4111-8111-111111111111',
});
assert.equal(venta.ok, true);
assert.equal(esUuid(venta.venta_uuid), true);
const encolada = leerColaVentasOffline('3B10')[0];
assert.equal(encolada.created_at, '2026-10-21T08:00:00.000Z');
assert.equal(encolada.venta_uuid, '11111111-1111-4111-8111-111111111111');

const fila = filaInsertVenta(encolada);
assert.equal(fila.id, encolada.venta_uuid);
assert.equal(fila.created_at, '2026-10-21T08:00:00.000Z');
assert.equal(fila.sucursal_id, '3B10');

guardarCatalogoOffline('3B10', [
  {
    id: '10',
    nombre: 'Leche',
    precio: 25,
    stock: 4,
    cat: 'ABARROTES',
    en_venta: true,
    codigos_alt: ['7501234567890'],
    foto_url: 'data:image/png;base64,AAAA',
  },
]);
const cache = leerCatalogoOffline('3B10');
assert.equal(cache.length, 1);
assert.deepEqual(cache[0].codigos_alt, ['7501234567890']);
assert.equal(cache[0].foto_url, null);

function setOnLine(valor) {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value: valor,
    configurable: true,
  });
}

setOnLine(false);
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return { status: 200 };
};
const offlineNav = await sondarConexionSupabase({
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'anon',
});
assert.equal(offlineNav, false);
assert.equal(fetchCalls, 0);

setOnLine(true);
globalThis.fetch = (_url, opts) => new Promise((_, reject) => {
  opts.signal.addEventListener('abort', () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    reject(e);
  });
});
const t0 = Date.now();
const colgado = await sondarConexionSupabase(
  { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'anon' },
  { timeoutMs: 40 },
);
assert.equal(colgado, false);
assert.ok(Date.now() - t0 < 1500);

globalThis.fetch = async () => ({ status: 200 });
const online = await sondarConexionSupabase({
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'anon',
});
assert.equal(online, true);

limpiarCola();
const uuid = '22222222-2222-4222-8222-222222222222';
encolarVentaOffline({
  vendedor: 'Ana',
  sucursal_id: '3B10',
  total: 10,
  metodo_pago: 'Efectivo',
  articulos: [{ id: 'p1', nombre: 'Pan', qty: 2 }],
  created_at: '2026-10-21T09:00:00.000Z',
  venta_uuid: uuid,
});

let inserts = 0;
function clienteConRpc(rpc) {
  return {
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'anon',
    from(table) {
      const result = { data: table === 'ventas' ? null : { id: 'mov-1' }, error: null };
      const p = Promise.resolve(result);
      const b = {
        insert() {
          if (table === 'ventas') inserts += 1;
          return b;
        },
        select() {
          return b;
        },
        contains() {
          return b;
        },
        limit() {
          return b;
        },
        single() {
          return p;
        },
        abortSignal() {
          return b;
        },
        then(onF, onR) {
          return p.then(onF, onR);
        },
      };
      return b;
    },
    rpc,
  };
}
const sbRedStock = clienteConRpc(() => (
  Promise.resolve({ data: null, error: { message: 'Failed to fetch' } })
));
const sync1 = await sincronizarColaVentasOffline(sbRedStock, { sucursal: '3B10' });
assert.equal(sync1.ok, false);
assert.equal(inserts, 1);
assert.equal(contarVentasOfflinePendientes('3B10'), 1);
assert.equal(leerColaVentasOffline('3B10')[0].venta_insertada, true);

const sbStockOk = clienteConRpc(() => (
  Promise.resolve({
    data: { antes: 5, despues: 3, stock: 3, stock_cedis: 0, stock_sucursales: { '3B10': { piso: 3, cedis: 0 } } },
    error: null,
  })
));
const sync2 = await sincronizarColaVentasOffline(sbStockOk, { sucursal: '3B10' });
assert.equal(sync2.synced, 1);
assert.equal(inserts, 1);
assert.equal(contarVentasOfflinePendientes('3B10'), 0);

const lento = insertarVentaEnSupabase(
  {
    from() {
      return {
        insert() {
          return new Promise(() => {});
        },
      };
    },
  },
  {
    vendedor: 'Ana',
    sucursal_id: '3B10',
    total: 1,
    metodo_pago: 'Efectivo',
    articulos: [],
    venta_uuid: uuid,
    created_at: '2026-10-21T09:00:00.000Z',
  },
  { timeoutMs: 40 },
);
const insLento = await lento;
assert.equal(insLento.ok, false);
assert.equal(insLento.red, true);

console.log('ventasOffline.test.mjs OK');
