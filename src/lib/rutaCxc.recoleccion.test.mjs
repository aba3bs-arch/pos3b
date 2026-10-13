import assert from 'node:assert/strict';
import {
  PREFIJO_CXC_RECOLECCION,
  esCargoDesdeRecoleccion,
  transitoIdDesdeCargoRecoleccion,
} from './rutaCxc.js';

assert.equal(PREFIJO_CXC_RECOLECCION, 'rec:');

assert.equal(
  transitoIdDesdeCargoRecoleccion({
    carga_id: 'rec:abc-123',
    notas: 'otro',
  }),
  'abc-123',
);

assert.equal(
  transitoIdDesdeCargoRecoleccion({
    carga_id: null,
    notas: 'Recolección · Entrega Crédito · ficha 768 · transito:deadbeef-0001-0002-0003-000000000099',
  }),
  'deadbeef-0001-0002-0003-000000000099',
);

assert.equal(transitoIdDesdeCargoRecoleccion({ notas: 'Venta 123' }), null);
assert.equal(esCargoDesdeRecoleccion({ carga_id: 'rec:x' }), true);
assert.equal(esCargoDesdeRecoleccion({ carga_id: 'carga1', notas: 'Venta' }), false);

console.log('rutaCxc.recoleccion.test.mjs ok');
