import assert from 'node:assert/strict';
import {
  puedeVerModulo,
  puedeVerSeccionContabilidad,
  MODULOS_BLOQUEADOS_MOSTRADOR,
  esRolMostradorRestringido,
} from './roles.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

assert.equal(esRolMostradorRestringido('Cajero'), true);
assert.ok(MODULOS_BLOQUEADOS_MOSTRADOR.has('Usuarios'));
assert.ok(MODULOS_BLOQUEADOS_MOSTRADOR.has('Configuracion'));

// Default cajero: sin Contabilidad; Cobranza suelta
assert.equal(puedeVerModulo('Cajero', 'Nómina'), false);
assert.equal(puedeVerModulo('Cajero', 'Ventas'), true);
assert.equal(puedeVerModulo('Cajero', 'Cobranza'), true);
assert.equal(puedeVerSeccionContabilidad('Cajero'), false);

// Ni por rol ni por usuario abre Contabilidad al cajero
store.set('pos3b_privilegios', JSON.stringify({
  porRol: {
    Cajero: [
      'Inicio',
      'Ventas',
      'Cobranza',
      'Nómina',
      'RC Virtual',
      'Estadísticas Abarrotes',
    ],
  },
  porUsuario: {
    'cajero-especial': [
      'Inicio',
      'Ventas',
      'Cobranza',
      'Nómina',
      'RC Virtual',
    ],
  },
  acciones: {},
}));

assert.equal(puedeVerModulo('Cajero', 'Nómina'), false);
assert.equal(puedeVerModulo('Cajero', 'RC Virtual'), false);
assert.equal(puedeVerModulo('Cajero', 'Nómina', 'cajero-especial'), false);
assert.equal(puedeVerSeccionContabilidad('Cajero', 'cajero-especial'), false);
assert.equal(puedeVerModulo('Cajero', 'Estadísticas Abarrotes'), true, 'Estadísticas sí por rol');
assert.equal(puedeVerModulo('Cajero', 'Cobranza'), true);
assert.equal(puedeVerModulo('Cajero', 'Usuarios'), false);

console.log('roles.privilegiosCajero.test.mjs ok');
