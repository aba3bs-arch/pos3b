import assert from 'node:assert/strict';
import {
  desgloseCapturasManualesPorSucursal,
  paretoDesdeCapturasManuales,
} from './resultadoInventario.js';

const regs = [
  {
    sucursal_id: '3B2',
    desde: '2026-09-01',
    hasta: '2026-09-07',
    valor_contado: 100000,
    valor_faltante: 5000,
    valor_faltante_neto: 4500,
    valor_bonificacion: 500,
    pct_merma: 4.5,
  },
  {
    sucursal_id: '3B5',
    desde: '2026-09-01',
    hasta: '2026-09-07',
    valor_contado: 80000,
    valor_faltante: 2000,
    valor_faltante_neto: 2000,
    valor_bonificacion: 0,
    pct_merma: 2.5,
  },
  {
    sucursal_id: '3B2',
    desde: '2026-09-08',
    hasta: '2026-09-14',
    valor_contado: 90000,
    valor_faltante: 1000,
    valor_faltante_neto: 1000,
    valor_bonificacion: 0,
    pct_merma: 1.11,
  },
];

{
  const items = paretoDesdeCapturasManuales(regs, ['FUSION', '3B2', '3B3', '3B5', '3B6']);
  assert.ok(items.length >= 5);
  assert.equal(items[0].sucursal, '3B2');
  assert.equal(items[0].total, 6000); // 5000 + 1000
  assert.equal(items[0].fuente, 'manual');
  const b3 = items.find((x) => x.sucursal === '3B3');
  assert.ok(b3);
  assert.equal(b3.total, 0);
  assert.equal(b3.fuente, 'sin_datos');
}

{
  const por = desgloseCapturasManualesPorSucursal(regs, ['3B2', '3B5', '3B6']);
  assert.equal(por.length, 3);
  const b2 = por.find((g) => g.sucursal === '3B2');
  assert.equal(b2.items.length, 2);
  assert.equal(b2.totalFaltante, 6000);
  const b6 = por.find((g) => g.sucursal === '3B6');
  assert.equal(b6.items.length, 0);
}

console.log('resultadoInventario.graficas.test.mjs OK');
