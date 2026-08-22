import assert from 'node:assert/strict';
import {
  claveCarritoVenta,
  guardarCarritoVenta,
  leerCarritoVenta,
  limpiarCarritoVenta,
  limpiarTodosCarritosVenta,
  LS_CARRITO_VENTA_PREFIX,
} from './carritoVentaPersistencia.js';

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

assert.equal(claveCarritoVenta('3b10'), `${LS_CARRITO_VENTA_PREFIX}3B10`);

guardarCarritoVenta('3B10', [
  { id: 'a1', nombre: 'Coca', precio: 18.5, qty: 2, foto_url: null },
  { id: null, nombre: 'basura' },
]);
const leido = leerCarritoVenta('3B10');
assert.equal(leido.length, 1);
assert.equal(leido[0].id, 'a1');
assert.equal(leido[0].qty, 2);
assert.equal(leido[0].precio, 18.5);

// Sobrevive “cambio de módulo”: leer de nuevo
assert.equal(leerCarritoVenta('3B10').length, 1);

limpiarCarritoVenta('3B10');
assert.deepEqual(leerCarritoVenta('3B10'), []);

guardarCarritoVenta('FUSION', [{ id: 1, nombre: 'X', precio: 1, qty: 1 }]);
guardarCarritoVenta('3B5', [{ id: 2, nombre: 'Y', precio: 2, qty: 3 }]);
limpiarTodosCarritosVenta();
assert.deepEqual(leerCarritoVenta('FUSION'), []);
assert.deepEqual(leerCarritoVenta('3B5'), []);

console.log('carritoVentaPersistencia.test.mjs ok');
