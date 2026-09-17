import assert from 'node:assert/strict';
import { asegurarMapaStock, stockAlmacenCentral, buildPatchStock } from './inventarioMultitienda.js';
import { ALMACEN_CENTRAL } from '../constants/sucursales.js';

// Legado: stock solo en columna stock_cedis (mapa CEDIS en 0) → UI y sync ven 200
const legado = {
  id: 'P1',
  stock_cedis: 200,
  stock_sucursales: { CEDIS: { cedis: 0, piso: 0 }, MAIN: { cedis: 0, piso: 0 } },
};
assert.equal(stockAlmacenCentral(legado), 200);
const map = asegurarMapaStock(legado, ALMACEN_CENTRAL);
assert.equal(map.CEDIS.cedis, 200);

// MAIN.cedis legado migrado al centro de distribución
const mainLegacy = {
  id: 'P2',
  stock_cedis: 0,
  stock_sucursales: { MAIN: { cedis: 80, piso: 0 } },
};
assert.equal(stockAlmacenCentral(mainLegacy), 80);

// Patch de retiro: 200 → 150
const patch = buildPatchStock(legado, ALMACEN_CENTRAL, 'cedis', 150, ALMACEN_CENTRAL);
assert.equal(patch.stock_sucursales.CEDIS.cedis, 150);
assert.equal(patch.stock_cedis, 150);

console.log('ventaEnRuta.cedisDescuento.test.mjs OK');
