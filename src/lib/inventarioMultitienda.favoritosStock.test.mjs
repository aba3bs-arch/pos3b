import assert from 'node:assert/strict';
import {
  claveStockSucursalCanon,
  parseStockSucursales,
  etiquetaStockLista,
  productoParaVistaTienda,
  asegurarMapaStock,
  stockVisible,
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

// CEDIS = centro de distribución: almacén primero, piso secundario
const vistaCedis = etiquetaStockLista(cigarro, 'CEDIS');
assert.equal(vistaCedis.etiquetaPrimario, 'CEDIS');
assert.equal(vistaCedis.primario, 200);
assert.equal(vistaCedis.etiquetaSecundario, 'Piso');
assert.equal(vistaCedis.secundario, 0);

const limpio = asegurarMapaStock(cigarro, '3B10');
assert.equal(limpio['3B10'].piso, 48);
assert.equal(limpio['10'], undefined);

// Negativos: dato real se conserva; UI de piso (default) los enmascara a 0
const negativo = {
  id: 'NEG1',
  stock_sucursales: { '3B10': { cedis: 0, piso: -12 } },
};
assert.equal(productoParaVistaTienda(negativo, '3B10').stock, -12, 'dato real se conserva');
assert.equal(etiquetaStockLista(negativo, '3B10').primario, 0, 'UI default oculta negativos');
assert.equal(etiquetaStockLista(negativo, '3B10', { verNegativos: false }).primario, 0);
assert.equal(etiquetaStockLista(negativo, '3B10', { verNegativos: true }).primario, -12, 'con privilegio se ve -N');
assert.equal(stockVisible(-12, false), 0);
assert.equal(stockVisible(-12, true), -12);

console.log('inventarioMultitienda.favoritosStock.test.mjs: ok');
