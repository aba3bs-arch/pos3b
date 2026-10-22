import assert from 'node:assert/strict';
import {
  esCreditoCobrado,
  etiquetaCobroRecoleccion,
  separarCreditosYEfectivo,
} from './recoleccionTipos.js';

assert.equal(esCreditoCobrado({ tipo_movimiento: 'Cobro Crédito' }), true);
assert.equal(esCreditoCobrado({ tipo_movimiento: 'Entrega Crédito' }), true);
assert.equal(esCreditoCobrado({ tipo_movimiento: 'Venta Ruta', num_traspaso: 'CXC-55-P' }), true);
assert.equal(esCreditoCobrado({ tipo_movimiento: 'Recolección', descripcion_gasto: 'Crédito cobrado' }), true);
assert.equal(esCreditoCobrado({ tipo_movimiento: 'Venta Ruta', num_traspaso: 'VR-ABC-E', descripcion_gasto: 'Venta en ruta · efectivo en tránsito' }), false);
assert.equal(esCreditoCobrado({ tipo_movimiento: 'Recolección', num_traspaso: '123' }), false);
assert.equal(etiquetaCobroRecoleccion({ tipo_movimiento: 'Venta Ruta' }), 'Efectivo mercancía');
assert.equal(etiquetaCobroRecoleccion({ tipo_movimiento: 'Cobro Crédito' }), 'Crédito cobrado');

const r = separarCreditosYEfectivo([
  { tipo_movimiento: 'Venta Ruta', monto: 370 },
  { tipo_movimiento: 'Cobro Crédito', monto: 570.5 },
  { tipo_movimiento: 'Recolección', monto: 100 },
]);
assert.equal(r.totalCreditos, 570.5);
assert.equal(r.totalEfectivo, 470);
assert.equal(r.total, 1040.5);
assert.equal(r.creditos.length, 1);
assert.equal(r.efectivo.length, 2);

console.log('recoleccionTipos.test.mjs OK');
