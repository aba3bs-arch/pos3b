import assert from 'node:assert/strict';
import {
  productoEsFavorito,
  parseFavoritosSucursales,
  patchToggleFavoritoSucursal,
  asegurarMapaFavoritos,
  productoDesdeDb,
  productoParaGuardar,
  favoritosPermitidosEnSucursal,
  sucursalesFavoritosPosibles,
} from './productoForm.js';

// Legado global: aplica a tiendas, no a CEDIS/MAIN
assert.equal(productoEsFavorito({ en_favoritos: true }, '3B5'), true);
assert.equal(productoEsFavorito({ en_favoritos: true }, 'CEDIS'), false);
assert.equal(productoEsFavorito({ en_favoritos: true }, 'MAIN'), false);
assert.equal(productoEsFavorito({ en_favoritos: false }, '3B5'), false);
assert.equal(productoEsFavorito({ cat: 'FAVORITOS' }, 'FUSION'), true);

// Mapa por sucursal (CEDIS en mapa legado se ignora)
const pMap = {
  en_favoritos: true,
  favoritos_sucursales: { '3B5': true, CEDIS: true, FUSION: false, RUTA: true },
};
assert.equal(productoEsFavorito(pMap, '3B5'), true);
assert.equal(productoEsFavorito(pMap, 'CEDIS'), false);
assert.equal(productoEsFavorito(pMap, 'FUSION'), false);
assert.equal(productoEsFavorito(pMap, '3B2'), false);
assert.equal(productoEsFavorito(pMap, 'RUTA'), true);
assert.deepEqual(parseFavoritosSucursales(pMap), { '3B5': true, FUSION: false, RUTA: true });

assert.equal(favoritosPermitidosEnSucursal('CEDIS'), false);
assert.equal(favoritosPermitidosEnSucursal('MAIN'), false);
assert.equal(favoritosPermitidosEnSucursal('3B5'), true);
assert.equal(favoritosPermitidosEnSucursal('RUTA'), true);
assert.ok(!sucursalesFavoritosPosibles().includes('CEDIS'));
assert.ok(sucursalesFavoritosPosibles().includes('RUTA'));

// RUTA (venta en ruta / camión)
assert.equal(productoEsFavorito({ favoritos_sucursales: { RUTA: true } }, 'RUTA'), true);
const patchRuta = patchToggleFavoritoSucursal({ id: 'R1', en_favoritos: false }, 'RUTA');
assert.equal(patchRuta.favoritos_sucursales.RUTA, true);
assert.equal(productoEsFavorito({ ...patchRuta }, 'CEDIS'), false);

// Toggle en tienda sin legado
const limpio = { id: 'X2', en_favoritos: false };
const patch3b5 = patchToggleFavoritoSucursal(limpio, '3B5');
assert.equal(patch3b5.favoritos_sucursales['3B5'], true);
assert.equal(patch3b5.en_favoritos, true);
assert.equal(productoEsFavorito({ ...limpio, ...patch3b5 }, 'RUTA'), false);
assert.equal(productoEsFavorito({ ...limpio, ...patch3b5 }, '3B5'), true);

// Legado → materializa tiendas + RUTA (no CEDIS)
const legado = { id: 'X1', en_favoritos: true, nombre: 'Prod' };
const mapa = asegurarMapaFavoritos(legado);
assert.ok(mapa['3B5']);
assert.ok(mapa.RUTA);
assert.equal(mapa.CEDIS, undefined);

const patchCedis = patchToggleFavoritoSucursal(legado, 'CEDIS');
assert.ok(!('CEDIS' in (patchCedis.favoritos_sucursales || {})));

assert.deepEqual(parseFavoritosSucursales({ favoritos_sucursales: { '3b5': 1, MAIN: true, CEDIS: true } }), { '3B5': true });

// Guardar formulario desde CEDIS no escribe favorito CEDIS
const guardadoCedis = productoParaGuardar(
  { ...productoDesdeDb({ id: 'A', nombre: 'A', en_favoritos: false }), en_favoritos: true, nombre: 'A', id: 'A' },
  { sucursal: 'CEDIS', productoDb: { id: 'A', en_favoritos: false, favoritos_sucursales: { '3B5': true } } },
);
assert.equal(guardadoCedis.favoritos_sucursales.CEDIS, undefined);
assert.equal(guardadoCedis.favoritos_sucursales['3B5'], true);

// Guardar en tienda sí escribe
const guardadoTienda = productoParaGuardar(
  { ...productoDesdeDb({ id: 'B', nombre: 'B', en_favoritos: false }), en_favoritos: true, nombre: 'B', id: 'B' },
  { sucursal: '3B5', productoDb: { id: 'B', en_favoritos: false, favoritos_sucursales: {} } },
);
assert.equal(guardadoTienda.favoritos_sucursales['3B5'], true);

console.log('productoFavoritosSucursal.test.mjs OK');
