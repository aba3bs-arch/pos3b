import assert from 'node:assert/strict';
import { partirGastosAcumuladosPorTurno } from './calc.js';

const gasto = (id, monto) => ({ id, monto, categoria: 'EMPLEADO', subcategoria: 'CONSUMO' });

const cierre = (id, created_at, tipo, gastos) => ({
  id,
  created_at,
  ventas: 100,
  detalle: { tipo_cierre: tipo, gastos, gastos_total: gastos.reduce((a, g) => a + g.monto, 0) },
});

const hist = [
  cierre('rec-vieja', '2026-11-01T18:00:00Z', 'recoleccion', [gasto('z', 9)]),
  cierre('t1', '2026-11-02T08:00:00Z', 'cierre', [gasto('a', 10)]),
  cierre('t2', '2026-11-02T16:00:00Z', 'cierre', [gasto('a', 10), gasto('b', 20)]),
  cierre('tmp', '2026-11-02T20:00:00Z', 'recoleccion_temporal', [gasto('a', 10), gasto('b', 20)]),
  cierre('rec', '2026-11-03T18:00:00Z', 'recoleccion', [gasto('a', 10), gasto('b', 20)]),
  cierre('t3', '2026-11-04T08:00:00Z', 'cierre', [gasto('c', 30), gasto('d', 40)]),
  cierre('tmp2', '2026-11-04T12:00:00Z', 'recoleccion_temporal', [gasto('c', 30), gasto('d', 40)]),
  cierre('t4', '2026-11-04T16:00:00Z', 'cierre', [gasto('c', 30), gasto('d', 40), gasto('e', 5)]),
];

const partido = partirGastosAcumuladosPorTurno(hist, [gasto('c', 30), gasto('d', 40), gasto('e', 5), gasto('f', 7)]);

assert.deepEqual(partido.porCierre.t1, undefined);
assert.deepEqual(partido.porCierre.t3.map((g) => g.id), ['c', 'd']);
assert.deepEqual(partido.porCierre.t4.map((g) => g.id), ['e']);
assert.deepEqual(partido.porCierre.tmp, undefined);
assert.deepEqual(partido.porCierre.tmp2, []);
assert.deepEqual(partido.abiertosNuevos.map((g) => g.id), ['f']);

const sumaTurnos = ['t3', 't4'].reduce(
  (a, id) => a + partido.porCierre[id].reduce((s, g) => s + g.monto, 0),
  0,
);
assert.equal(sumaTurnos, 75);
assert.equal(partido.abiertosNuevos.reduce((s, g) => s + g.monto, 0), 7);

const sinRec = partirGastosAcumuladosPorTurno(
  [cierre('t1', '2026-11-02T08:00:00Z', 'cierre', [gasto('a', 10), gasto('a', 10)])],
  [gasto('a', 10)],
);
assert.deepEqual(sinRec.porCierre.t1.map((g) => g.id), ['a']);
assert.deepEqual(sinRec.abiertosNuevos, []);

console.log('partirGastosAcumuladosPorTurno ok');
