import assert from 'node:assert/strict';
import {
  LS_VENTA_RUTA_CLAVES,
  TABLAS_VENTA_RUTA_PURGA,
  borrarDatosVentaEnRuta,
} from './purgaVentaEnRuta.js';

assert.ok(LS_VENTA_RUTA_CLAVES.includes('pos3b_ruta_cargas'));
assert.ok(LS_VENTA_RUTA_CLAVES.includes('pos3b_ruta_ventas'));
assert.ok(TABLAS_VENTA_RUTA_PURGA.indexOf('ruta_ventas') < TABLAS_VENTA_RUTA_PURGA.indexOf('ruta_cargas'));
assert.ok(TABLAS_VENTA_RUTA_PURGA.includes('ruta_camiones'));
assert.ok(TABLAS_VENTA_RUTA_PURGA.includes('ruta_clientes'));

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
};

mem.set('pos3b_ruta_cargas', '[]');
mem.set('pos3b_ruta_ventas', '[]');
mem.set('pos3b_carrito_pos_ruta_u1', '{"carrito":[]}');
mem.set('pos3b_otra_cosa', 'x');

const deleted = [];
const fakeSb = {
  from(tabla) {
    return {
      delete() {
        return {
          neq: async () => {
            deleted.push(tabla);
            return { error: null };
          },
          not: async () => ({ error: null }),
          gte: async () => ({ error: null }),
          eq: async (col, val) => {
            deleted.push(`${tabla}:${col}=${val}`);
            return { error: null };
          },
        };
      },
    };
  },
};

const r = await borrarDatosVentaEnRuta(fakeSb);
assert.equal(r.ok, true);
assert.ok(deleted.includes('ruta_ventas'));
assert.ok(deleted.includes('ruta_cargas'));
assert.ok(deleted.some((x) => String(x).includes('Venta Ruta')));
assert.equal(localStorage.getItem('pos3b_ruta_cargas'), null);
assert.equal(localStorage.getItem('pos3b_ruta_ventas'), null);
assert.equal(localStorage.getItem('pos3b_otra_cosa'), 'x');

const sinSb = await borrarDatosVentaEnRuta(null);
assert.equal(sinSb.ok, false);

console.log('purgaVentaEnRuta.test.mjs ok');
