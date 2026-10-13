import assert from 'node:assert/strict';
import {
  CUENTAS_RT_PURGA_SERVICIOS,
  LS_VENTA_RUTA_CLAVES,
  TABLAS_CONSULTAS_VENTA_RUTA,
  TABLAS_FONDO_SERVICIOS_PURGA,
  TABLAS_VENTA_RUTA_PURGA,
  borrarDatosPruebaFondoTesoreria,
  borrarDatosVentaEnRuta,
} from './purgaVentaEnRuta.js';

assert.ok(LS_VENTA_RUTA_CLAVES.includes('pos3b_ruta_cargas'));
assert.ok(LS_VENTA_RUTA_CLAVES.includes('pos3b_ruta_ventas'));
assert.ok(TABLAS_VENTA_RUTA_PURGA.indexOf('ruta_ventas') < TABLAS_VENTA_RUTA_PURGA.indexOf('ruta_cargas'));
assert.ok(TABLAS_VENTA_RUTA_PURGA.indexOf('ruta_carga_eventos') < TABLAS_VENTA_RUTA_PURGA.indexOf('ruta_cargas'));
assert.ok(TABLAS_VENTA_RUTA_PURGA.includes('ruta_camiones'));
assert.ok(TABLAS_VENTA_RUTA_PURGA.includes('ruta_clientes'));
assert.ok(LS_VENTA_RUTA_CLAVES.includes('pos3b_ruta_carga_eventos'));

assert.ok(TABLAS_CONSULTAS_VENTA_RUTA.includes('ruta_carga_eventos'));
assert.ok(TABLAS_CONSULTAS_VENTA_RUTA.includes('ruta_ventas'));
assert.ok(TABLAS_CONSULTAS_VENTA_RUTA.includes('ruta_cxc_movimientos'));
assert.deepEqual(TABLAS_FONDO_SERVICIOS_PURGA, [
  'ruta_fondo_movimientos',
  'ruta_fondo_solicitudes',
]);
assert.deepEqual([...CUENTAS_RT_PURGA_SERVICIOS].sort(), ['cheche', 'servicios']);
assert.ok(!CUENTAS_RT_PURGA_SERVICIOS.includes('francisco'));

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
          in: async (col, vals) => {
            deleted.push(`${tabla}:${col} in ${[...vals].join(',')}`);
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

const deleted2 = [];
const fakeSb2 = {
  from(tabla) {
    return {
      delete() {
        return {
          neq: async () => {
            deleted2.push(tabla);
            return { error: null };
          },
          not: async () => ({ error: null }),
          gte: async () => ({ error: null }),
          in: async (col, vals) => {
            deleted2.push(`${tabla}:${col} in ${[...vals].sort().join(',')}`);
            return { error: null };
          },
        };
      },
    };
  },
};
const rFondo = await borrarDatosPruebaFondoTesoreria(fakeSb2);
assert.equal(rFondo.ok, true);
assert.ok(deleted2.includes('ruta_fondo_movimientos'));
assert.ok(deleted2.includes('ruta_fondo_solicitudes'));
assert.ok(deleted2.some((x) => String(x).includes('cuenta_id in cheche,servicios') || String(x).includes('cuenta_id in servicios,cheche')));

console.log('purgaVentaEnRuta.test.mjs ok');
