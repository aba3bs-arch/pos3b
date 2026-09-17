import assert from 'node:assert/strict';
import {
  productoEsFavorito,
  parseFavoritosSucursales,
  patchToggleFavoritoSucursal,
  asegurarMapaFavoritos,
  productoDesdeDb,
  productoParaGuardar,
} from './productoForm.js';

// Legado global
assert.equal(productoEsFavorito({ en_favoritos: true }, '3B5'), true);
assert.equal(productoEsFavorito({ en_favoritos: true }, 'CEDIS'), true);
assert.equal(productoEsFavorito({ en_favoritos: false }, '3B5'), false);
assert.equal(productoEsFavorito({ cat: 'FAVORITOS' }, 'FUSION'), true);

// Mapa por sucursal
const pMap = {
  en_favoritos: true,
  favoritos_sucursales: { '3B5': true, CEDIS: true, FUSION: false },
};
assert.equal(productoEsFavorito(pMap, '3B5'), true);
assert.equal(productoEsFavorito(pMap, 'CEDIS'), true);
assert.equal(productoEsFavorito(pMap, 'FUSION'), false);
assert.equal(productoEsFavorito(pMap, '3B2'), false);

// Toggle solo en CEDIS (legado global → materializa)
const legado = { id: 'X1', en_favoritos: true, nombre: 'Prod' };
const patchCedis = patchToggleFavoritoSucursal(legado, 'CEDIS');
assert.equal(patchCedis.favoritos_sucursales.CEDIS, false);
assert.equal(patchCedis.favoritos_sucursales['3B5'], true);
assert.equal(patchCedis.en_favoritos, true);

// Toggle en sucursal sin legado
const limpio = { id: 'X2', en_favoritos: false };
const patch3b5 = patchToggleFavoritoSucursal(limpio, '3B5');
assert.equal(patch3b5.favoritos_sucursales['3B5'], true);
assert.equal(patch3b5.en_favoritos, true);
assert.equal(productoEsFavorito({ ...limpio, ...patch3b5 }, 'CEDIS'), false);
assert.equal(productoEsFavorito({ ...limpio, ...patch3b5 }, '3B5'), true);

const mapa = asegurarMapaFavoritos(legado);
assert.ok(mapa.CEDIS);
assert.ok(mapa['3B5']);

assert.deepEqual(parseFavoritosSucursales({ favoritos_sucursales: { '3b5': 1, MAIN: true } }), { '3B5': true });

// Guardar formulario: favorito solo en sucursal actual
const guardado = productoParaGuardar(
  { ...productoDesdeDb({ id: 'A', nombre: 'A', en_favoritos: false }), en_favoritos: true, nombre: 'A', id: 'A' },
  { sucursal: 'CEDIS', productoDb: { id: 'A', en_favoritos: false, favoritos_sucursales: { '3B5': true } } },
);
assert.equal(guardado.favoritos_sucursales.CEDIS, true);
assert.equal(guardado.favoritos_sucursales['3B5'], true);
assert.equal(guardado.en_favoritos, true);

console.log('productoFavoritosSucursal.test.mjs OK');
