import assert from 'node:assert/strict';
import {
  claveStockSucursalCanon,
  parseStockSucursales,
  etiquetaStockLista,
  productoParaVistaTienda,
  asegurarMapaStock,
} from './inventarioMultitienda.js';

assert.equal(claveStockSucursalCanon('10'), '3B10');
assert.equal(claveStockSucursalCanon('3B10'), '3B10');
assert.equal(claveStockSucursalCanon('5'), '3B5');
assert.equal(claveStockSucursalCanon('FUSION'), 'FUSION');

// Clave huérfana de folio → stock visible en favoritos de 3B10
const cigarro = {
  id: 'MARL',
  nombre: 'Marlboro',
  stock: 0,
  stock_cedis: 0,
  stock_sucursales: {
    10: { cedis: 0, piso: 48 },
    CEDIS: { cedis: 200, piso: 0 },
  },
};

const mapa = parseStockSucursales(cigarro);
assert.deepEqual(mapa['3B10'], { cedis: 0, piso: 48 });
assert.equal(mapa['10'], undefined);

const vista = productoParaVistaTienda(cigarro, '3B10');
assert.equal(vista.stock, 48);
assert.equal(etiquetaStockLista(cigarro, '3B10').primario, 48);
assert.equal(etiquetaStockLista(vista, '3B10').primario, 48);

// Si existen ambas claves, no duplicar
const ambos = {
  stock_sucursales: {
    10: { cedis: 0, piso: 48 },
    '3B10': { cedis: 0, piso: 48 },
  },
};
assert.equal(parseStockSucursales(ambos)['3B10'].piso, 48);
assert.equal(etiquetaStockLista(ambos, '3B10').primario, 48);

// Tras ingreso con clave canónica, favoritos muestran el nuevo stock
const ingresado = {
  id: 'SMOK',
  stock: 0,
  stock_sucursales: {
    '3B10': { cedis: 0, piso: 120 },
    '3B5': { cedis: 0, piso: 10 },
  },
};
assert.equal(etiquetaStockLista(ingresado, '3B10').primario, 120);
assert.equal(etiquetaStockLista(ingresado, '3B5').primario, 10);
assert.equal(etiquetaStockLista(ingresado, '3B2').primario, 0);

// CEDIS funciona como sucursal en favoritos: PZA (piso) primero, almacén secundario
const vistaCedis = etiquetaStockLista(cigarro, 'CEDIS');
assert.equal(vistaCedis.etiquetaPrimario, 'PZA');
assert.equal(vistaCedis.primario, 0);
assert.equal(vistaCedis.etiquetaSecundario, 'CEDIS');
assert.equal(vistaCedis.secundario, 200);

const limpio = asegurarMapaStock(cigarro, '3B10');
assert.equal(limpio['3B10'].piso, 48);
assert.equal(limpio['10'], undefined);

console.log('inventarioMultitienda.favoritosStock.test.mjs: ok');
