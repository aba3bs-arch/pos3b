import assert from 'node:assert/strict';
import {
  colorProgresoDia,
  etiquetaPeriodoDias,
  ymdDiaMes,
} from './barraDiasMes.js';

assert.equal(ymdDiaMes(2026, 7, 5), '2026-08-05');
assert.equal(ymdDiaMes(2026, 0, 1), '2026-01-01');

assert.match(etiquetaPeriodoDias(2026, 7, null), /1 – 31 agosto 2026/);
assert.equal(etiquetaPeriodoDias(2026, 7, { start: 15, end: 15 }), '15 agosto 2026');
assert.equal(etiquetaPeriodoDias(2026, 7, { start: 10, end: 18 }), '10 – 18 agosto 2026');

const c0 = colorProgresoDia(0, 31);
const cEnd = colorProgresoDia(30, 31);
assert.match(c0, /^rgb\(/);
assert.match(cEnd, /^rgb\(/);
const g0 = Number(c0.match(/rgb\((\d+),\s*(\d+)/)[2]);
const gEnd = Number(cEnd.match(/rgb\((\d+),\s*(\d+)/)[2]);
assert.ok(gEnd > g0);

console.log('barraDiasMes.test.mjs ok');
