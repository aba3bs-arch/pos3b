import assert from 'node:assert/strict';
import {
  pastelPagoEfectivoTarjeta,
  sumaTarjeta,
  sumaVentas,
} from './estadisticasData.js';

// Helper mirrors ventasDesdeCierres extraction without DB
function rowFromCierre(c) {
  const d = c?.detalle || {};
  return {
    total: Number(c?.ventas ?? d.venta ?? 0) || 0,
    tarjeta: Number(d.tarjeta ?? d.pago_tarjeta ?? 0) || 0,
  };
}

const cierres = [
  { ventas: 1000, detalle: { venta: 1000, tarjeta: 250, tipo_cierre: 'cierre' } },
  { ventas: 500, detalle: { venta: 500, tarjeta: 0 } },
  { ventas: 0, detalle: { venta: 0, tarjeta: 80 } },
];
const ventas = cierres.map(rowFromCierre).filter((v) => v.total > 0 || v.tarjeta > 0);

assert.equal(sumaVentas(ventas), 1500);
assert.equal(sumaTarjeta(ventas), 330);

const pastel = pastelPagoEfectivoTarjeta(ventas);
assert.equal(pastel.length, 2);
const tar = pastel.find((p) => p.id === 'tarjeta');
const ef = pastel.find((p) => p.id === 'efectivo');
assert.equal(tar.total, 330);
assert.equal(ef.total, 1170); // 1500 - 330
assert.ok(Math.abs(tar.pct + ef.pct - 100) < 0.01);
assert.equal(typeof tar.pieStart, 'number');
assert.equal(typeof tar.pieEnd, 'number');

assert.deepEqual(pastelPagoEfectivoTarjeta([]), []);

console.log('estadisticasData.tarjeta.test.mjs ok');
