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
assert.equal(esRolContabilidadPorDefecto('Gerente'), true);
assert.equal(esRolContabilidadPorDefecto('Auditor'), false);
assert.equal(esRolContabilidadPorDefecto('Supervisor'), false);
assert.equal(esRolContabilidadPorDefecto('Cajero'), false);

// Por defecto: Admin y Gerente sí; Auditor/Supervisor/Cajero no
assert.equal(puedeVerSeccionContabilidad('Administrador'), true);
assert.equal(puedeVerSeccionContabilidad('Gerente'), true);
assert.equal(puedeVerModulo('Gerente', 'Nómina'), true);
assert.equal(puedeVerModulo('Gerente', 'Panel RT'), true);

assert.equal(puedeVerModulo('Auditor', 'Panel RT'), false, 'Auditor sin Contabilidad por defecto');
assert.equal(puedeVerModulo('Auditor', 'Conciliaciones'), false);
assert.equal(puedeVerModulo('Auditor', 'Cobranza'), false);
assert.equal(puedeVerSeccionContabilidad('Auditor'), false);
assert.equal(submodulosContabilidadVisibles('Auditor').length, 0);

assert.equal(puedeVerSeccionContabilidad('Supervisor'), false);
assert.equal(puedeVerSeccionContabilidad('Cajero'), false, 'solo Cobranza → sin hub');
assert.ok(MODULOS_CONTABILIDAD_SUELTOS_CAJERO.has('Cobranza'));
assert.equal(puedeVerModulo('Cajero', 'Cobranza'), true, 'Cobranza suelta para cajero');

// Privilegio por ROL Auditor: no abre Contabilidad
store.set('pos3b_privilegios', JSON.stringify({
  porRol: {
    Auditor: ['Inicio', 'Panel RT', 'Conciliaciones', 'Nómina'],
  },
  porUsuario: {},
  acciones: {},
}));
assert.equal(puedeVerModulo('Auditor', 'Panel RT'), false);
assert.equal(puedeVerSeccionContabilidad('Auditor'), false);

// Excepción: privilegio por usuario
store.set('pos3b_privilegios', JSON.stringify({
  porRol: {},
  porUsuario: {
    'user-auditor-1': [
      'Inicio',
      'Consultas',
      'Panel RT',
      'Conciliaciones',
      'Nómina',
    ],
  },
  acciones: {},
}));

assert.equal(puedeVerModulo('Auditor', 'Panel RT', 'user-auditor-1'), true);
assert.equal(puedeVerModulo('Auditor', 'Nómina', 'user-auditor-1'), true);
assert.equal(puedeVerSeccionContabilidad('Auditor', 'user-auditor-1'), true);
assert.ok(submodulosContabilidadVisibles('Auditor', 'user-auditor-1').includes('Panel RT'));

// Otro auditor sin privilegio personalizado sigue bloqueado
assert.equal(puedeVerModulo('Auditor', 'Panel RT', 'user-otro'), false);
assert.equal(puedeVerSeccionContabilidad('Auditor', 'user-otro'), false);

console.log('roles.contabilidadAcceso.test.mjs ok');
