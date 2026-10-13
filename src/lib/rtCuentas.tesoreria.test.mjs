import assert from 'node:assert/strict';
import {
  ADMIN_TESORERIA_CUENTA_ID,
  CUENTA_TESORERIA_ID,
  CUENTAS_ORIGEN_TESORERIA,
  CUENTAS_RT,
  CUENTAS_RT_LIQUIDACION,
  puedeAdministrarTesoreria,
  resolverCuentaRtPorNombre,
} from './rtCuentas.js';
import { CUENTA_RT_FONDO_DEFAULT } from './rutaFondoServicios.js';

assert.equal(CUENTA_TESORERIA_ID, 'cheche');
assert.equal(ADMIN_TESORERIA_CUENTA_ID, 'jlbb');
assert.deepEqual(CUENTAS_ORIGEN_TESORERIA, ['jlbb']);
assert.ok(CUENTAS_RT.some((c) => c.id === 'cheche'));
assert.ok(!CUENTAS_RT.some((c) => c.id === 'luis-enrique'), 'Luis Enrique no es cuenta admin');
assert.ok(!CUENTAS_RT_LIQUIDACION.some((c) => c.id === 'cheche'));
assert.ok(!CUENTAS_RT_LIQUIDACION.some((c) => c.id === 'luis-enrique'));
assert.equal(CUENTA_RT_FONDO_DEFAULT, 'jlbb');

assert.equal(resolverCuentaRtPorNombre('FJBB Francisco'), 'francisco');
assert.equal(resolverCuentaRtPorNombre('Jose Luis BB'), 'jlbb');
assert.equal(resolverCuentaRtPorNombre('Cheche'), 'cheche');
assert.equal(resolverCuentaRtPorNombre('Luis Enrique'), null);

assert.equal(puedeAdministrarTesoreria({ rol: 'Administrador' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Gerente' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Cajero', nombre: 'Jose Luis' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Cajero', nombre: 'Otro' }), false);

console.log('rtCuentas.tesoreria.test.mjs ok');
