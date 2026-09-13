import assert from 'node:assert/strict';
import {
  etiquetaTienda,
  nombreUbicacionSucursal,
  urlGoogleMapsSucursal,
  ubicacionSucursal,
} from './sucursales.js';

assert.equal(nombreUbicacionSucursal('3B2'), 'Pueblo Nuevo');
assert.equal(etiquetaTienda('3B2'), '3B2 Pueblo Nuevo');
assert.equal(etiquetaTienda('FUSION'), 'Fusión');
assert.match(urlGoogleMapsSucursal('3B2'), /maps\?q=31\.300544,-110\.923907/);
assert.equal(ubicacionSucursal('3B10')?.lat, 31.30125);
assert.equal(etiquetaTienda('3B7'), '3B7'); // sin colonia aún
assert.ok(urlGoogleMapsSucursal('3B7'));
assert.equal(urlGoogleMapsSucursal('MAIN'), null);

console.log('sucursales.ubicacion.test.mjs ok');
