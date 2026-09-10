import assert from 'node:assert/strict';
import { puedeEliminarRechazarRcVirtual } from './contabilidadConstants.js';
import { puedeEliminarPagare } from './pagares.js';

assert.equal(puedeEliminarRechazarRcVirtual('AMR'), true);
assert.equal(puedeEliminarRechazarRcVirtual({ nombre: 'ABB Antonio' }), true);
assert.equal(puedeEliminarRechazarRcVirtual('JLBB'), true);
assert.equal(puedeEliminarRechazarRcVirtual('FJBB Francisco'), true);
assert.equal(puedeEliminarRechazarRcVirtual('Luis Enrique Osuna Mada'), false);
assert.equal(puedeEliminarRechazarRcVirtual('Cajero Juan'), false);
assert.equal(puedeEliminarPagare('AMR'), true);
assert.equal(puedeEliminarPagare('Luis Enrique'), false);
console.log('rcVirtualEliminar.test.mjs ok');
