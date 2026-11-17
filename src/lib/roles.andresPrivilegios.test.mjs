import assert from 'node:assert/strict';
import {
  esAndresMarrero,
  fijarSesionPrivilegios,
  modulosParaSidebar,
  puedeGestionarUsuarios,
  puedeVerModulo,
  puedeVerSeccionContabilidad,
  submodulosContabilidadVisibles,
  SUBMODULOS_CONTABILIDAD,
} from './roles.js';
import { permisosCorteContabilidad } from './corteContabilidad/permisos.js';

const ANDRES = {
  id: 'andres-1',
  nombre: 'Andrés Marrero',
  rol: 'Gerente',
};

assert.equal(esAndresMarrero(ANDRES), true);
assert.equal(esAndresMarrero({ nombre: 'AMR', rol: 'Gerente' }), true);
assert.equal(esAndresMarrero({ nombre: 'Marrero', rol: 'Gerente' }), true);
assert.equal(esAndresMarrero({ nombre: 'Juan Pérez', rol: 'Gerente' }), false);
assert.equal(esAndresMarrero({ nombre: 'Andrés Marrero', es_admin_principal: true }), true);

fijarSesionPrivilegios(null);
assert.equal(puedeVerSeccionContabilidad('Gerente'), false);
assert.equal(puedeVerModulo('Gerente', 'Nómina'), false);
assert.equal(puedeGestionarUsuarios('Gerente'), false);

fijarSesionPrivilegios(ANDRES);
assert.equal(puedeVerModulo('Gerente', 'Nómina', ANDRES.id), true);
assert.equal(puedeVerModulo('Gerente', 'IE VIRTUAL', ANDRES.id), true);
assert.equal(puedeVerModulo('Gerente', 'Auditoría', ANDRES.id), true);
assert.equal(puedeVerModulo('Gerente', 'Usuarios', ANDRES.id), true);
assert.equal(puedeVerSeccionContabilidad('Gerente', ANDRES.id), true);
assert.equal(submodulosContabilidadVisibles('Gerente', ANDRES.id).length, SUBMODULOS_CONTABILIDAD.length);
assert.equal(puedeGestionarUsuarios('Gerente'), true);

const menu = modulosParaSidebar('Gerente', ANDRES.id);
assert.ok(menu.includes('Usuarios'));
assert.ok(menu.includes('Configuracion') || menu.includes('Configuración'));
assert.ok(menu.includes('Auditoría'));

const corte = permisosCorteContabilidad('Gerente', ANDRES.id);
assert.equal(corte.editarTodo, true);
assert.equal(corte.moneda_inicial, true);

assert.equal(puedeVerModulo('Gerente', 'Nómina', 'otro-gerente'), false);
assert.equal(puedeVerModulo('Cajero', 'Nómina'), false);
assert.equal(puedeVerSeccionContabilidad('Cajero'), false);

fijarSesionPrivilegios({ ...ANDRES, es_admin_principal: true });
assert.equal(puedeVerModulo('Gerente', 'Nómina', ANDRES.id), true);
assert.equal(puedeVerSeccionContabilidad('Gerente', ANDRES.id), true);

fijarSesionPrivilegios(null);
assert.equal(puedeVerModulo('Gerente', 'Nómina'), false);

console.log('roles.andresPrivilegios.test.mjs ok');
