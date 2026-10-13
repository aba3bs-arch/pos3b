import assert from 'node:assert/strict';
import {
  ADMIN_TESORERIA_CUENTA_ID,
  CUENTA_RT_SERVICIOS_ID,
  CUENTA_TESORERIA_ID,
  CUENTAS_ORIGEN_TESORERIA,
  CUENTAS_RT,
  CUENTAS_RT_GASTO,
  CUENTAS_RT_LEGACY,
  CUENTAS_RT_LIQUIDACION,
  CUENTAS_RT_LIQUIDACION_SERVICIOS,
  CUENTAS_RT_PANEL,
  cuentaRtMercanciaPorDefecto,
  esCuentaSoloServicios,
  puedeAdministrarTesoreria,
  resolverCuentaRtPorNombre,
} from './rtCuentas.js';
import { CUENTA_RT_FONDO_DEFAULT } from './rutaFondoServicios.js';

assert.equal(CUENTA_TESORERIA_ID, 'cheche');
assert.equal(CUENTA_RT_SERVICIOS_ID, 'servicios');
assert.equal(ADMIN_TESORERIA_CUENTA_ID, 'servicios');
assert.deepEqual(CUENTAS_ORIGEN_TESORERIA, ['servicios']);
assert.ok(CUENTAS_RT.some((c) => c.id === 'cheche'));
assert.ok(CUENTAS_RT.some((c) => c.id === 'servicios'));
assert.ok(CUENTAS_RT.some((c) => c.id === 'francisco'));
assert.ok(!CUENTAS_RT.some((c) => c.id === 'andres'));
assert.ok(!CUENTAS_RT.some((c) => c.id === 'abb'));
assert.ok(!CUENTAS_RT.some((c) => c.id === 'jlbb'));
assert.ok(CUENTAS_RT_LEGACY.some((c) => c.id === 'andres'));
assert.ok(CUENTAS_RT_LEGACY.some((c) => c.id === 'jlbb'));
assert.deepEqual(CUENTAS_RT_PANEL.map((c) => c.id).sort(), ['francisco', 'servicios']);
assert.deepEqual(CUENTAS_RT_LIQUIDACION.map((c) => c.id), ['francisco']);
assert.deepEqual(CUENTAS_RT_LIQUIDACION_SERVICIOS.map((c) => c.id), ['servicios']);
assert.deepEqual(CUENTAS_RT_GASTO.map((c) => c.id), ['francisco']);
assert.ok(!CUENTAS_RT_LIQUIDACION.some((c) => c.id === 'cheche'));
assert.equal(CUENTA_RT_FONDO_DEFAULT, 'servicios');
assert.equal(esCuentaSoloServicios('servicios'), true);
assert.equal(esCuentaSoloServicios('cheche'), true);
assert.equal(esCuentaSoloServicios('francisco'), false);

assert.equal(resolverCuentaRtPorNombre('FJBB Francisco'), 'francisco');
assert.equal(resolverCuentaRtPorNombre('Jose Luis BB'), 'jlbb');
assert.equal(resolverCuentaRtPorNombre('Cheche'), 'cheche');
assert.equal(resolverCuentaRtPorNombre('Servicios'), 'servicios');
assert.equal(resolverCuentaRtPorNombre('Luis Enrique'), null);
assert.equal(cuentaRtMercanciaPorDefecto('Andrés'), 'francisco');
assert.equal(cuentaRtMercanciaPorDefecto('Francisco'), 'francisco');

assert.equal(puedeAdministrarTesoreria({ rol: 'Administrador' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Gerente' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Cajero', nombre: 'Jose Luis' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Cajero', nombre: 'Francisco' }), true);
assert.equal(puedeAdministrarTesoreria({ rol: 'Cajero', nombre: 'Otro' }), false);

console.log('rtCuentas.tesoreria.test.mjs ok');
