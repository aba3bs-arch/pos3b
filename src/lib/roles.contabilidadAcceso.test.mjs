import assert from 'node:assert/strict';
import {
  puedeVerModulo,
  puedeVerSeccionContabilidad,
  submodulosContabilidadVisibles,
  esRolContabilidadPorDefecto,
  MODULOS_CONTABILIDAD_SUELTOS_CAJERO,
} from './roles.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

assert.equal(esRolContabilidadPorDefecto('Administrador'), true);
assert.equal(esRolContabilidadPorDefecto('Gerente'), false);
assert.equal(esRolContabilidadPorDefecto('Auditor'), false);
assert.equal(esRolContabilidadPorDefecto('Supervisor'), false);
assert.equal(esRolContabilidadPorDefecto('Cajero'), false);
assert.equal(esRolContabilidadPorDefecto('Repartidor'), false);
assert.equal(esRolContabilidadPorDefecto('Técnico'), false);

// Solo Administrador
assert.equal(puedeVerSeccionContabilidad('Administrador'), true);
assert.equal(puedeVerModulo('Administrador', 'Nómina'), true);
assert.equal(puedeVerModulo('Administrador', 'Panel RT'), true);

for (const rol of ['Gerente', 'Auditor', 'Supervisor', 'Cajero', 'Repartidor', 'Técnico']) {
  assert.equal(puedeVerSeccionContabilidad(rol), false, `${rol} sin hub Contabilidad`);
  assert.equal(puedeVerModulo(rol, 'Nómina'), false, `${rol} sin Nómina`);
  assert.equal(puedeVerModulo(rol, 'Panel RT'), false, `${rol} sin Panel RT`);
  assert.equal(puedeVerModulo(rol, 'IE VIRTUAL'), false, `${rol} sin IE`);
}

assert.ok(MODULOS_CONTABILIDAD_SUELTOS_CAJERO.has('Cobranza'));
assert.equal(puedeVerModulo('Cajero', 'Cobranza'), true, 'Cobranza suelta para cajero');
assert.equal(submodulosContabilidadVisibles('Gerente').length, 0);
assert.equal(submodulosContabilidadVisibles('Auditor').length, 0);

// Privilegios por usuario o por rol NO abren Contabilidad
store.set('pos3b_privilegios', JSON.stringify({
  porRol: {
    Cajero: ['Inicio', 'Nómina', 'Panel RT', 'RC Virtual'],
    Gerente: ['Inicio', 'Nómina', 'Panel RT', 'IE VIRTUAL'],
    Auditor: ['Inicio', 'Panel RT', 'Conciliaciones'],
  },
  porUsuario: {
    'user-1': ['Inicio', 'Nómina', 'Panel RT', 'RC Virtual', 'IE VIRTUAL'],
  },
  acciones: {},
}));

assert.equal(puedeVerModulo('Cajero', 'Nómina', 'user-1'), false);
assert.equal(puedeVerSeccionContabilidad('Cajero', 'user-1'), false);
assert.equal(puedeVerModulo('Gerente', 'Nómina'), false);
assert.equal(puedeVerSeccionContabilidad('Gerente'), false);
assert.equal(puedeVerModulo('Auditor', 'Panel RT', 'user-1'), false);
assert.equal(puedeVerSeccionContabilidad('Administrador'), true);

console.log('roles.contabilidadAcceso.test.mjs ok');
