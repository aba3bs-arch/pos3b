import assert from 'node:assert/strict';
import {
  guardarFavoritosSucursalesLocal,
  leerFavoritosSucursalesLocal,
  mergeFavoritosSucursales,
  marcarFavoritosSucursalesColumnaAusente,
  marcarFavoritosSucursalesColumnaOk,
  favoritosSucursalesColumnaAusente,
  esErrorColumnaFavoritosSucursales,
  LS_FAVORITOS_SUCURSALES,
  LS_FAV_COLUMNA_AUSENTE,
} from './favoritosSucursalesPersistencia.js';
import { parseFavoritosSucursales, productoEsFavorito, patchToggleFavoritoSucursal } from './productoForm.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
};

mem.clear();
assert.equal(favoritosSucursalesColumnaAusente(), false);
marcarFavoritosSucursalesColumnaAusente();
assert.equal(favoritosSucursalesColumnaAusente(), true);
assert.equal(mem.get(LS_FAV_COLUMNA_AUSENTE), '1');

guardarFavoritosSucursalesLocal('P1', { '3B5': true, CEDIS: true, RUTA: true });
assert.deepEqual(leerFavoritosSucursalesLocal('P1'), { '3B5': true });

const merged = mergeFavoritosSucursales('P1', { FUSION: true });
assert.equal(merged['3B5'], true);
assert.equal(merged.FUSION, true);

assert.ok(esErrorColumnaFavoritosSucursales({ message: 'Could not find the favoritos_sucursales column' }));

const prod = { id: 'P1', en_favoritos: false, favoritos_sucursales: {} };
assert.equal(productoEsFavorito(prod, '3B5'), true); // desde local

const patch = patchToggleFavoritoSucursal(prod, '3B5');
assert.equal(patch.favoritos_sucursales['3B5'], false); // toggle off

marcarFavoritosSucursalesColumnaOk();
assert.equal(favoritosSucursalesColumnaAusente(), false);

console.log('favoritosSucursalesPersistencia.test.mjs ok');
