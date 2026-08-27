import assert from 'node:assert/strict';
import {
  ALMACEN_CENTRAL,
  CENTRAL_ADMIN,
  esAlmacenCentral,
  esCentralAdmin,
  esSucursalNoVenta,
  etiquetaTienda,
  normalizarCodigoTienda,
  codigoTiendaValido,
  listarSucursales,
  listarSucursalesOperativas,
  agregarSucursalExtra,
} from './sucursales.js';
import {
  normalizarMapaStockCedisUnico,
  stockAlmacenCentral,
  asegurarMapaStock,
} from '../lib/inventarioMultitienda.js';

assert.equal(CENTRAL_ADMIN, 'MAIN');
assert.equal(ALMACEN_CENTRAL, 'CEDIS');
assert.equal(normalizarCodigoTienda('CEDIS'), 'CEDIS');
assert.equal(normalizarCodigoTienda('MAIN'), 'MAIN');
assert.equal(normalizarCodigoTienda('ALMACEN'), 'CEDIS');
assert.equal(esCentralAdmin('MAIN'), true);
assert.equal(esCentralAdmin('CEDIS'), false);
assert.equal(esAlmacenCentral('CEDIS'), true);
assert.equal(esAlmacenCentral('MAIN'), false);
assert.equal(esSucursalNoVenta('MAIN'), true);
assert.equal(esSucursalNoVenta('CEDIS'), true);
assert.equal(esSucursalNoVenta('3B5'), false);
assert.equal(etiquetaTienda('MAIN'), 'Central de administración (MAIN)');
assert.equal(etiquetaTienda('CEDIS'), 'CEDIS · almacén central');
assert.ok(listarSucursales().includes('CEDIS'));
assert.ok(listarSucursales().includes('MAIN'));
assert.ok(!listarSucursalesOperativas().includes('MAIN'));
assert.ok(!listarSucursalesOperativas().includes('CEDIS'));
assert.equal(codigoTiendaValido('CEDIS'), true);

const dup = agregarSucursalExtra('CEDIS');
assert.equal(dup.ok, false);

// Migración lazy MAIN.cedis → CEDIS.cedis
{
  const map = normalizarMapaStockCedisUnico({
    MAIN: { cedis: 40, piso: 2 },
    '3B5': { cedis: 5, piso: 10 },
  });
  assert.equal(map.CEDIS.cedis, 45);
  assert.equal(map.MAIN.cedis, 0);
  assert.equal(map.MAIN.piso, 2);
  assert.equal(map['3B5'].cedis, 0);
  assert.equal(map['3B5'].piso, 10);
}

{
  const p = {
    stock_sucursales: { MAIN: { cedis: 12, piso: 0 } },
    stock_cedis: 12,
    stock: 0,
  };
  assert.equal(stockAlmacenCentral(p), 12);
  const map = asegurarMapaStock(p, 'CEDIS');
  assert.equal(map.CEDIS.cedis, 12);
  assert.equal(map.MAIN.cedis, 0);
}

console.log('sucursales.cedis.test.mjs ok');
