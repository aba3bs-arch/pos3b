import assert from 'node:assert/strict';
import {
  etiquetaTienda,
  equivalentesCodigoTienda,
  nombreUbicacionSucursal,
  normalizarCodigoTienda,
  urlGoogleMapsSucursal,
  ubicacionSucursal,
} from './sucursales.js';

assert.equal(nombreUbicacionSucursal('3B2'), 'Pueblo Nuevo');
assert.equal(etiquetaTienda('3B2'), '3B2 Pueblo Nuevo');
assert.equal(etiquetaTienda('FUSION'), 'Fusión');
assert.equal(etiquetaTienda('3B3'), '3B3 Petróleos');
assert.equal(nombreUbicacionSucursal('3B3'), 'Petróleos');
assert.equal(etiquetaTienda('3B5'), '3B5 Lomas Dos');
assert.equal(etiquetaTienda('3B6'), '3B6 Solidaridad');
assert.equal(etiquetaTienda('3B7'), '3B7 Del Valle');
assert.equal(etiquetaTienda('3B9'), '3B9 Buenos Aires');
assert.equal(etiquetaTienda('3B10'), '3B10 El Mezquite');
assert.match(urlGoogleMapsSucursal('3B2'), /maps\?q=31\.300544,-110\.923907/);
assert.equal(ubicacionSucursal('3B10')?.lat, 31.30125);
assert.ok(urlGoogleMapsSucursal('3B7'));
assert.equal(urlGoogleMapsSucursal('MAIN'), null);

assert.equal(normalizarCodigoTienda('Del Valle'), '3B7');
assert.equal(normalizarCodigoTienda('DEL_VALLE'), '3B7');
assert.equal(normalizarCodigoTienda('3B7 Del Valle'), '3B7');
assert.equal(normalizarCodigoTienda('3B7_DEL_VALLE'), '3B7');
assert.ok(equivalentesCodigoTienda('3B7').includes('Del Valle'));

console.log('sucursales.ubicacion.test.mjs ok');
