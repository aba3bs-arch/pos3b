import assert from 'node:assert/strict';
import { cuotaDeducibleNomina } from './nominaPrestamos.js';
import { CUOTA_SEMANAL_MINIMA } from './contabilidadConstants.js';

assert.equal(CUOTA_SEMANAL_MINIMA, 500);
assert.equal(cuotaDeducibleNomina({ saldo: 5000 }), 500);
assert.equal(cuotaDeducibleNomina({ saldo: 500 }), 500);
assert.equal(cuotaDeducibleNomina({ saldo: 350 }), 350, 'última semana: remanente');
assert.equal(cuotaDeducibleNomina({ saldo: 0 }), 0);
assert.equal(cuotaDeducibleNomina({ saldo: -10 }), 0);
assert.equal(cuotaDeducibleNomina({ saldo: 1000, cuota_semanal: 800 }), 500, 'ignora cuota custom > 500');

console.log('nominaPrestamos.test.mjs ok');
