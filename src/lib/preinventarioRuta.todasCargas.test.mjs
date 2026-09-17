import assert from 'node:assert/strict';
import {
  disponibleEnLineaCarga,
  inventarioCamionDesdeLineas,
} from './ventaEnRuta.js';

assert.equal(disponibleEnLineaCarga({ qty_cargada: 10, qty_vendida: 3, qty_devuelta: 1 }), 6);
assert.equal(disponibleEnLineaCarga({ qty_cargada: 2, qty_vendida: 5, qty_devuelta: 0 }), 0);

const lineas = [
  { producto_id: 'A', producto_nombre: 'Prod A', qty_cargada: 10, qty_vendida: 2, qty_devuelta: 0 },
  { producto_id: 'A', producto_nombre: 'Prod A', qty_cargada: 5, qty_vendida: 1, qty_devuelta: 0 },
  { producto_id: 'B', producto_nombre: 'Prod B', qty_cargada: 4, qty_vendida: 0, qty_devuelta: 1 },
];

const inv = inventarioCamionDesdeLineas(lineas, {
  inventario: [{ id: 'A', nombre: 'Prod A', cat: 'CIGARROS' }],
});

assert.equal(inv.length, 2);
const a = inv.find((p) => p.id === 'A');
const b = inv.find((p) => p.id === 'B');
assert.equal(a._disp_camion, 12); // (10-2) + (5-1)
assert.equal(a._qty_cargada, 15);
assert.equal(a._num_cargas, 2);
assert.equal(a.cat, 'CIGARROS');
assert.equal(b._disp_camion, 3);
assert.equal(b._num_cargas, 1);

console.log('preinventarioRuta.todasCargas.test.mjs OK');
