import assert from 'node:assert/strict';
import {
  ADMIN_TESORERIA_CUENTA_ID,
  CUENTA_TESORERIA_ID,
  CUENTAS_ORIGEN_TESORERIA,
  CUENTAS_RT,
  puedeAdministrarTesoreria,
  resolverCuentaRtPorNombre,
} from './rtCuentas.js';

assert.equal(CUENTA_TESORERIA_ID, 'cheche');
assert.equal(ADMIN_TESORERIA_CUENTA_ID, 'jlbb');
assert.deepEqual(CUENTAS_ORIGEN_TESORERIA, ['francisco', 'abb', 'jlbb']);
assert.ok(CUENTAS_RT.some((c) => c.id === 'cheche'));

assert.equal(resolverCuentaRtPorNombre('FJBB Francisco'), 'francisco');
assert.equal(resolverCuentaRtPorNombre('Jose Luis BB'), 'jlbb');
assert.equal(resolverCuentaRtPorNombre('Cheche'), 'cheche');

assert.equal(puedeAdministrarTesoreria({ rol: 'Administrador' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Gerente' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Cajero', nombre: 'Jose Luis' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Cajero', nombre: 'Otro' }), false);

console.log('rtCuentas.tesoreria.test.mjs ok');
