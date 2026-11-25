import assert from 'node:assert/strict';
import { unificarEstadosAlias } from './unificarEstadoAlias.js';

const canonVacio = {
  sucursal_id: 'FUSION',
  updated_at: '2026-11-25T12:00:00Z',
  estado: { venta: 0, caja_anterior: 0, venta_pos_por_corte: {} },
};
const huerfano = {
  sucursal_id: 'Fusión',
  updated_at: '2026-11-25T18:00:00Z',
  estado: {
    venta: 540,
    caja_anterior: 800,
    venta_pos_por_corte: { '2026-11-25|diurno': 540 },
  },
};

const adoptado = unificarEstadosAlias('FUSION', [canonVacio, huerfano]);
assert.equal(adoptado.desde, 'Fusión');
assert.equal(adoptado.estado.venta, 540);
assert.equal(adoptado.estado.caja_anterior, 800);
assert.equal(adoptado.estado.venta_pos_por_corte['2026-11-25|diurno'], 540);
assert.deepEqual(adoptado.variantes, ['Fusión']);

const canonNuevo = {
  sucursal_id: 'FUSION',
  updated_at: '2026-11-25T20:00:00Z',
  estado: {
    venta: 540,
    caja_anterior: 0,
    venta_pos_por_corte: { '2026-11-25|diurno': 540 },
  },
};
const viejo = {
  sucursal_id: 'FUSIÓN',
  updated_at: '2026-11-25T08:00:00Z',
  estado: {
    venta: 540,
    caja_anterior: 800,
    venta_pos_por_corte: { '2026-11-25|otro': 540 },
  },
};
const uno = unificarEstadosAlias('FUSION', [canonNuevo, viejo, { ...huerfano, sucursal_id: 'fusion' }]);
assert.equal(uno.desde, 'FUSION');
assert.equal(uno.estado.venta, 540);
assert.equal(uno.estado.caja_anterior, 800);
assert.equal(uno.estado.venta_pos_por_corte['2026-11-25|diurno'], 540);
assert.equal(uno.estado.venta_pos_por_corte['2026-11-25|otro'], undefined);
assert.equal(uno.cajaDesde, 'fusion');

console.log('unificarEstadoAlias.test.mjs ok');
