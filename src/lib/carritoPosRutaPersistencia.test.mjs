import assert from 'node:assert/strict';
import {
  claveCarritoPosRuta,
  guardarCarritoPosRuta,
  leerCarritoPosRuta,
  limpiarCarritoPosRuta,
  limpiarTodosCarritosPosRuta,
  LS_CARRITO_POS_RUTA_PREFIX,
} from './carritoPosRutaPersistencia.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
};

const vendedor = { id: 'rt:abc', nombre: 'Luis' };
assert.equal(claveCarritoPosRuta(vendedor), `${LS_CARRITO_POS_RUTA_PREFIX}rt:abc`);
assert.deepEqual(leerCarritoPosRuta(vendedor), { clienteKey: '', carrito: [] });

guardarCarritoPosRuta(vendedor, {
  clienteKey: 'sucursal:3B10',
  carrito: [
    { productoId: 1, nombre: 'Agua', precio: 10, cantidad: 2, disponible: 5 },
    { productoId: null, nombre: 'basura' },
  ],
});

const leido = leerCarritoPosRuta(vendedor);
assert.equal(leido.clienteKey, 'sucursal:3B10');
assert.equal(leido.carrito.length, 1);
assert.equal(leido.carrito[0].productoId, 1);
assert.equal(leido.carrito[0].cantidad, 2);

limpiarCarritoPosRuta(vendedor);
assert.deepEqual(leerCarritoPosRuta(vendedor), { clienteKey: '', carrito: [] });

guardarCarritoPosRuta({ id: 'u1' }, { clienteKey: 'x', carrito: [{ productoId: 9, nombre: 'X', precio: 1, cantidad: 1 }] });
guardarCarritoPosRuta({ id: 'u2' }, { clienteKey: 'y', carrito: [{ productoId: 8, nombre: 'Y', precio: 2, cantidad: 3 }] });
limpiarTodosCarritosPosRuta();
assert.deepEqual(leerCarritoPosRuta({ id: 'u1' }), { clienteKey: '', carrito: [] });
assert.deepEqual(leerCarritoPosRuta({ id: 'u2' }), { clienteKey: '', carrito: [] });

console.log('carritoPosRutaPersistencia.test.mjs ok');
