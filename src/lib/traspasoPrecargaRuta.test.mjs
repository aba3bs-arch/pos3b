import assert from 'node:assert/strict';
import { normalizarLineasTraspasoIniciales } from './traspasosInventario.js';

const cat = [
  { id: 'P1', nombre: 'Agua cat', precio: 10, costo: 5 },
  { id: 'P2', nombre: 'Pan', precio: 8, costo: 2 },
];

const out = normalizarLineasTraspasoIniciales(
  [
    { productoId: 'P1', nombre: 'Agua', cantidad: 3, precio: 12 },
    { producto_id: 'P2', cantidad: 2 },
    { producto_id: 'P1', cantidad: 9 }, // duplicado: se ignora
    { producto_id: 'PX', cantidad: 0 }, // qty 0
    { producto_id: '', cantidad: 1 },
  ],
  cat,
);

assert.equal(out.length, 2);
assert.equal(out[0].producto_id, 'P1');
assert.equal(out[0].cantidad, 3);
assert.equal(out[0].precio, 12);
assert.equal(out[0].costo, 5);
assert.equal(out[1].producto_id, 'P2');
assert.equal(out[1].nombre, 'Pan');
assert.equal(out[1].precio, 8);
assert.equal(out[1].costo, 2);

assert.deepEqual(normalizarLineasTraspasoIniciales(null), []);
assert.deepEqual(normalizarLineasTraspasoIniciales([]), []);

console.log('traspasoPrecargaRuta.test.mjs OK');
