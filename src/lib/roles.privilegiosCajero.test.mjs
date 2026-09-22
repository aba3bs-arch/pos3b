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

// Default cajero: sin Nómina / RC
assert.equal(puedeVerModulo('Cajero', 'Nómina'), false);
assert.equal(puedeVerModulo('Cajero', 'Ventas'), true);
assert.equal(puedeVerModulo('Cajero', 'Cobranza'), true);
assert.equal(puedeVerSeccionContabilidad('Cajero'), false, 'solo Cobranza → sin hub Contabilidad');

// Con privilegio personalizado por rol: sí puede ver Nómina / Contabilidad
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

assert.equal(puedeVerModulo('Cajero', 'Nómina'), true, 'privilegio asignado abre Nómina');
assert.equal(puedeVerModulo('Cajero', 'RC Virtual'), true);
assert.equal(puedeVerModulo('Cajero', 'Estadísticas Abarrotes'), true);
assert.equal(puedeVerModulo('Cajero', 'Usuarios'), false, 'Usuarios sigue bloqueado');
assert.equal(puedeVerSeccionContabilidad('Cajero'), true, 'con Nómina sí hay hub');
assert.ok(submodulosContabilidadVisibles('Cajero').includes('Nómina'));
assert.ok(submodulosContabilidadVisibles('Cajero').includes('RC Virtual'));

console.log('roles.privilegiosCajero.test.mjs ok');
