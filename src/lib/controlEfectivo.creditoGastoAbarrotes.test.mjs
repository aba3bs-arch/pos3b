import assert from 'node:assert/strict';
import { payloadGastoCreditoCobradoAbarrotes } from './controlEfectivo.js';

const p = payloadGastoCreditoCobradoAbarrotes(
  {
    sucursal_origen: '3B2',
    num_traspaso: '843',
    monto: 810,
    cajero_nombre: 'lyver',
  },
  { cajero: 'cajero cobro' },
);

assert.equal(p.modulo, 'abarrotes');
assert.equal(p.categoria, 'CREDITO');
assert.equal(p.subcategoria, 'COBRADO');
assert.equal(p.sucursal_id, '3B2');
assert.equal(p.monto, 810);
assert.equal(p.cerrado, false);
assert.equal(p.descontado_nomina, false);
assert.match(p.comentario, /CREDITO COBRADO/);
assert.match(p.comentario, /843/);
assert.match(p.comentario, /CAJERO COBRO/);

const p2 = payloadGastoCreditoCobradoAbarrotes({
  sucursal_origen: 'FUSION',
  num_traspaso: '886',
  monto: 1506,
});
assert.equal(p2.sucursal_id, 'FUSION');
assert.equal(p2.monto, 1506);

console.log('controlEfectivo.creditoGastoAbarrotes.test.mjs OK');
