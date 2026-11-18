import assert from 'node:assert/strict';
import { esLuzElenaCuadre, puedeAjustarCuadre } from './cuadrePrivilegios.js';

const vacio = { acciones: {} };
const luz = { id: 'e27e3f84-a56b-4acb-ba21-bd9b2c0ae1c6', nombre: 'Luz  Zazueta', rol: 'Auditor' };
const cajero = { id: 'c1', nombre: 'Ana Ruiz', rol: 'Cajero' };

assert.equal(esLuzElenaCuadre(luz), true);
assert.equal(esLuzElenaCuadre({ nombre: 'Luz Elena' }), true);
assert.equal(esLuzElenaCuadre({ nombre: 'Laura Elena Lopez Rodriguez', rol: 'Cajero' }), false);
assert.equal(esLuzElenaCuadre({ nombre: 'Frania Pahola Zazueta Amparan', rol: 'Cajero' }), false);

assert.equal(puedeAjustarCuadre(luz, vacio), true);
assert.equal(puedeAjustarCuadre({ nombre: 'Administrador principal', rol: 'Administrador' }, vacio), true);
assert.equal(puedeAjustarCuadre({ nombre: 'Andres Marrero', rol: 'Gerente' }, vacio), true);
assert.equal(puedeAjustarCuadre({ es_admin_principal: true, nombre: 'Creador', rol: 'Cajero' }, vacio), true);
assert.equal(puedeAjustarCuadre(cajero, vacio), false);
assert.equal(puedeAjustarCuadre({ rol: 'Auditor' }, vacio), false);
assert.equal(puedeAjustarCuadre({ rol: 'Administrador' }, vacio), true);

const otorgado = {
  acciones: { cuadre_ajustar: { porUsuario: { c1: true }, porRol: {} } },
};
assert.equal(puedeAjustarCuadre(cajero, otorgado), true);

const quitada = {
  acciones: { cuadre_ajustar: { porUsuario: { [luz.id]: false }, porRol: { Auditor: true } } },
};
assert.equal(puedeAjustarCuadre(luz, quitada), false);
assert.equal(puedeAjustarCuadre({ id: 'a2', nombre: 'Otro Auditor', rol: 'Auditor' }, quitada), true);

console.log('cuadrePrivilegios.test.mjs ok');
