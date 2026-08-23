import assert from 'node:assert/strict';
import {
  esAdministradorPrincipal,
  nombreEsAdminPrincipal,
  normalizarNombrePersona,
} from './adminPrincipal.js';
import {
  encontrarReservadoAdmin,
  validarTextoSinReservadoAdmin,
} from './reservadoAdminPrincipal.js';

assert.equal(normalizarNombrePersona('Andrés'), 'andres');
assert.ok(nombreEsAdminPrincipal('AMR'));
assert.ok(nombreEsAdminPrincipal('Andrés Marrero'));
assert.ok(nombreEsAdminPrincipal('andres'));
assert.equal(nombreEsAdminPrincipal('Francisco'), false);

assert.ok(esAdministradorPrincipal({ rol: 'Administrador', nombre: 'AMR' }));
assert.ok(esAdministradorPrincipal({ rol: 'Administrador', nombre: 'Andrés' }));
assert.equal(esAdministradorPrincipal({ rol: 'Gerente', nombre: 'AMR' }), false);
assert.equal(esAdministradorPrincipal({ rol: 'Administrador', nombre: 'Francisco' }), false);

assert.equal(encontrarReservadoAdmin('pago a AMR'), 'amr');
assert.equal(encontrarReservadoAdmin('gasto Andrés'), 'andres');

assert.equal(validarTextoSinReservadoAdmin('AMR autorizó', { rol: 'Administrador', nombre: 'AMR' }).ok, true);
assert.equal(validarTextoSinReservadoAdmin('AMR autorizó', { rol: 'Administrador', nombre: 'Francisco' }).ok, true);
assert.equal(validarTextoSinReservadoAdmin('gasto Andrés Marrero', { rol: 'Administrador', nombre: 'Ana' }).ok, true);
assert.equal(validarTextoSinReservadoAdmin('AMR autorizó', { rol: 'Gerente', nombre: 'Luis' }).ok, false);
assert.equal(validarTextoSinReservadoAdmin('AMR autorizó', { rol: 'Cajero', nombre: 'Juan' }).ok, false);
assert.equal(validarTextoSinReservadoAdmin('AMR autorizó', { rol: 'Cajero', nombre: 'Juan' }).requierePin, true);

console.log('adminPrincipal.test.mjs ok');
