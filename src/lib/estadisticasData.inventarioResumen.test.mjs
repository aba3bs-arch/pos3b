import assert from 'node:assert/strict';
import { inventarioResumen } from './estadisticasData.js';

// Piezas en 3B2 con precio de venta pero SIN costo de compra → antes salía $0.
const catalogo = [
  {
    id: 'MARU',
    nombre: 'Maruchan',
    precio: 22,
    precio_compra_sin: 0,
    stock: 0,
    stock_sucursales: {
      '3B2': { piso: 100, cedis: 0 },
      '3B5': { piso: 10, cedis: 0 },
      CEDIS: { cedis: 50, piso: 0 },
    },
  },
];

const filas = inventarioResumen(catalogo, ['3B2', '3B5', 'FUSION']);
const b2 = filas.find((f) => f.id === '3B2');
const b5 = filas.find((f) => f.id === '3B5');
const fus = filas.find((f) => f.id === 'FUSION');

assert.ok(b2, '3B2 en resumen');
assert.equal(b2.unidades, 100);
assert.equal(b2.skus, 1);
assert.equal(b2.total, 2200, '3B2 debe valorizar a precio venta, no $0 por falta de costo');
assert.equal(b5.total, 220);
assert.equal(fus.total, 0);
assert.equal(fus.unidades, 0);

console.log('estadisticasData.inventarioResumen.test.mjs ok');
