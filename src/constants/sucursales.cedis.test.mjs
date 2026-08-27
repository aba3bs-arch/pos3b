import assert from 'node:assert/strict';
import {
  ALMACEN_CENTRAL,
  esAlmacenCentral,
  etiquetaTienda,
  normalizarCodigoTienda,
  codigoTiendaValido,
  agregarSucursalExtra,
} from './sucursales.js';

assert.equal(ALMACEN_CENTRAL, 'MAIN');
assert.equal(normalizarCodigoTienda('CEDIS'), 'MAIN');
assert.equal(normalizarCodigoTienda('cedis'), 'MAIN');
assert.equal(normalizarCodigoTienda('CEDIS_CENTRAL'), 'MAIN');
assert.equal(normalizarCodigoTienda('MAIN'), 'MAIN');
assert.equal(esAlmacenCentral('CEDIS'), true);
assert.equal(esAlmacenCentral('MAIN'), true);
assert.equal(esAlmacenCentral('3B5'), false);
assert.equal(etiquetaTienda('MAIN'), 'CEDIS · almacén central (MAIN)');
assert.equal(etiquetaTienda('CEDIS'), 'CEDIS · almacén central (MAIN)');
assert.equal(codigoTiendaValido('CEDIS'), true);
assert.equal(codigoTiendaValido('MAIN'), true);

const dup = agregarSucursalExtra('CEDIS');
assert.equal(dup.ok, false);
assert.match(String(dup.error || ''), /CEDIS|MAIN/i);

console.log('sucursales.cedis.test.mjs ok');
