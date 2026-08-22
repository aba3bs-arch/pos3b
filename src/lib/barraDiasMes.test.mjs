import assert from 'node:assert/strict';
import {
  colorEstadoPanorama,
  colorProgresoDia,
  diasEnMes,
  etiquetaPeriodoDias,
  normalizarSeleccionDias,
  pctProgresoMes,
  ymdDiaMes,
} from './barraDiasMes.js';

assert.equal(ymdDiaMes(2026, 7, 5), '2026-08-05');
assert.equal(ymdDiaMes(2026, 0, 1), '2026-01-01');
assert.equal(diasEnMes(2026, 7), 31);

assert.match(etiquetaPeriodoDias(2026, 7, null), /1 – 31 agosto 2026/);
assert.equal(etiquetaPeriodoDias(2026, 7, { start: 15, end: 15 }), '15 agosto 2026');
assert.equal(etiquetaPeriodoDias(2026, 7, { start: 10, end: 18 }), '10 – 18 agosto 2026');

assert.deepEqual(normalizarSeleccionDias(18, 10, 31), { start: 10, end: 18 });
assert.deepEqual(normalizarSeleccionDias(0, 99, 31), { start: 1, end: 31 });

const neg = colorEstadoPanorama(-100);
const pos = colorEstadoPanorama(500);
const cero = colorEstadoPanorama(0);
assert.equal(neg.label, 'En negativo');
assert.equal(pos.label, 'En positivo');
assert.equal(cero.label, 'En equilibrio');
assert.match(neg.fill, /gradient/);
assert.match(pos.fill, /gradient/);

assert.equal(pctProgresoMes(2026, 7, 2026, 8, 15), Math.round((15 / 31) * 1000) / 10);
assert.equal(pctProgresoMes(2026, 5, 2026, 8, 15), 100);
assert.equal(pctProgresoMes(2026, 10, 2026, 8, 15), 0);

const c0 = colorProgresoDia(0, 31);
const cEnd = colorProgresoDia(30, 31);
assert.match(c0, /^rgb\(/);
assert.match(cEnd, /^rgb\(/);

console.log('barraDiasMes.test.mjs ok');
