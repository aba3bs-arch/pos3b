import assert from 'node:assert/strict';
import {
  puedeVerModulo,
  puedeVerSeccionContabilidad,
  submodulosContabilidadVisibles,
  MODULOS_BLOQUEADOS_MOSTRADOR,
  esRolMostradorRestringido,
} from './roles.js';

// Stub localStorage for privilegios
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

assert.equal(esRolMostradorRestringido('Cajero'), true);
assert.ok(MODULOS_BLOQUEADOS_MOSTRADOR.has('Usuarios'));
assert.ok(MODULOS_BLOQUEADOS_MOSTRADOR.has('Configuracion'));
assert.ok(!MODULOS_BLOQUEADOS_MOSTRADOR.has('Nómina'), 'Nómina ya no es bloqueo duro');
assert.ok(!MODULOS_BLOQUEADOS_MOSTRADOR.has('RC Virtual'));
assert.ok(!MODULOS_BLOQUEADOS_MOSTRADOR.has('Estadísticas Abarrotes'));

// Default cajero: sin Nómina / RC; Cobranza suelta sin hub Contabilidad
assert.equal(puedeVerModulo('Cajero', 'Nómina'), false);
assert.equal(puedeVerModulo('Cajero', 'Ventas'), true);
assert.equal(puedeVerModulo('Cajero', 'Cobranza'), true);
assert.equal(puedeVerSeccionContabilidad('Cajero'), false, 'solo Cobranza → sin hub Contabilidad');

// Privilegio por ROL Cajero con Contabilidad: NO abre Contabilidad (solo Admin/Gerente o por usuario)
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
  porUsuario: {},
  acciones: {},
}));

assert.equal(puedeVerModulo('Cajero', 'Nómina'), false, 'Contabilidad por rol Cajero no aplica');
assert.equal(puedeVerModulo('Cajero', 'RC Virtual'), false);
assert.equal(puedeVerModulo('Cajero', 'Estadísticas Abarrotes'), true, 'Estadísticas sí por rol');
assert.equal(puedeVerModulo('Cajero', 'Usuarios'), false, 'Usuarios sigue bloqueado');
assert.equal(puedeVerSeccionContabilidad('Cajero'), false, 'privilegio por rol no abre Contabilidad');
assert.equal(puedeVerModulo('Cajero', 'Cobranza'), true, 'Cobranza suelta se mantiene');

// Privilegio por USUARIO: sí abre Contabilidad
store.set('pos3b_privilegios', JSON.stringify({
  porRol: {
    Cajero: [
      'Inicio',
      'Ventas',
      'Cobranza',
      'Nómina',
      'RC Virtual',
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

assert.equal(puedeVerModulo('Cajero', 'Nómina', 'cajero-especial'), true);
assert.equal(puedeVerModulo('Cajero', 'RC Virtual', 'cajero-especial'), true);
assert.equal(puedeVerSeccionContabilidad('Cajero', 'cajero-especial'), true);
assert.ok(submodulosContabilidadVisibles('Cajero', 'cajero-especial').includes('Nómina'));
assert.equal(puedeVerSeccionContabilidad('Cajero', 'otro-cajero'), false);

console.log('roles.privilegiosCajero.test.mjs ok');
