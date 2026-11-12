import assert from 'node:assert/strict';
import test from 'node:test';
import {
  restarVentasDeLineasConteo,
  textoResumenAjusteVentasConteo,
} from './consolidarVentasInventario.js';

test('restar ventas del conteo: evita sobrante falso si se vendió durante el conteo', () => {
  const lineas = [
    { productoId: '41', nombre: 'Marlboro Rojo 100', contadaNum: 22, existencia: 20 },
    { productoId: '39', nombre: 'PallMall', contadaNum: 10, existencia: 10 },
  ];
  const ventas = new Map([['41', 2], ['39', 0]]);
  const adj = restarVentasDeLineasConteo(lineas, ventas);
  assert.equal(adj.piezasRestadas, 2);
  assert.equal(adj.productosAfectados, 1);
  assert.equal(adj.lineas[0].contadaNum, 20);
  assert.equal(adj.lineas[0].contadaAntesVentas, 22);
  assert.equal(adj.lineas[0].diferencia, 0); // 20 contado − 20 existencia
  assert.equal(adj.lineas[1].contadaNum, 10);
  assert.match(
    textoResumenAjusteVentasConteo(adj, { desdeIso: '2026-11-11T12:00:00.000Z', piezasPeriodo: 2 }),
    /contado 22 − venta 2 → 20/,
  );
});
