import assert from 'node:assert/strict';
import {
  esRegistroConsumo,
  evaluarCandadoCancelarConsumo,
  normalizarCandadoCancelarConsumo,
} from './candadoCancelarConsumo.js';

assert.equal(esRegistroConsumo({ categoria: 'EMPLEADO', subcategoria: 'CONSUMO' }), true);
assert.equal(esRegistroConsumo({ categoria: 'consumo', subcategoria: 'vales-consumo' }), true);
assert.equal(esRegistroConsumo({ categoria: 'EMPLEADO', subcategoria: 'FALTANTE' }), false);
assert.equal(esRegistroConsumo({ categoria: 'gasolina' }), false);
assert.equal(esRegistroConsumo({ categoria: 'PROVEEDORES', subcategoria: 'ABARROTES' }), false);

const apagadoDirectos = normalizarCandadoCancelarConsumo({ directos: false, indirectos: true });
assert.equal(evaluarCandadoCancelarConsumo(apagadoDirectos, 'directo').ok, false);
assert.equal(evaluarCandadoCancelarConsumo(apagadoDirectos, 'indirecto').ok, true);
assert.match(evaluarCandadoCancelarConsumo(apagadoDirectos, 'directo').error, /directos/);

const apagadoIndirectos = normalizarCandadoCancelarConsumo({ directos: true, indirectos: false });
assert.equal(evaluarCandadoCancelarConsumo(apagadoIndirectos, 'indirecto').ok, false);
assert.equal(evaluarCandadoCancelarConsumo(apagadoIndirectos, 'directo').ok, true);

const def = normalizarCandadoCancelarConsumo(null);
assert.equal(def.directos, true);
assert.equal(def.indirectos, true);

console.log('candadoCancelarConsumo.test.mjs ok');
