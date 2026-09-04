import assert from 'node:assert/strict';
import {
  ACCIONES_PRODUCTOS_PRIVILEGIO,
  tieneAccionProducto,
  puedeVerNegativosProductos,
} from './productosAcciones.js';
import { puedeVerStockNegativo } from './roles.js';

assert.ok(ACCIONES_PRODUCTOS_PRIVILEGIO.some((a) => a.id === 'prod_negativos'));
assert.equal(ACCIONES_PRODUCTOS_PRIVILEGIO.length, 14);

assert.equal(puedeVerStockNegativo('Administrador'), true);
assert.equal(puedeVerStockNegativo('Auditor'), true);
assert.equal(puedeVerStockNegativo('Cajero'), false);
assert.equal(puedeVerStockNegativo('Gerente'), false);
assert.equal(puedeVerStockNegativo('Repartidor'), false);

assert.equal(tieneAccionProducto('prod_negativos', 'Auditor'), true);
assert.equal(tieneAccionProducto('prod_negativos', 'Cajero'), false);
assert.equal(tieneAccionProducto('prod_ajuste', 'Cajero'), true);
assert.equal(tieneAccionProducto('prod_alta', 'Cajero'), false);
assert.equal(tieneAccionProducto('prod_alta', 'Auditor'), true);
assert.equal(tieneAccionProducto('prod_vaciar', 'Auditor'), false);
assert.equal(tieneAccionProducto('prod_vaciar', 'Gerente'), true);
assert.equal(tieneAccionProducto('prod_eliminar', 'Repartidor'), true);

const denegarAuditor = {
  acciones: { prod_negativos: { porRol: { Auditor: false }, porUsuario: {} } },
};
assert.equal(tieneAccionProducto('prod_negativos', 'Auditor', null, denegarAuditor), false);
assert.equal(puedeVerNegativosProductos('Auditor', null, denegarAuditor), false);

const otorgarCajero = {
  acciones: { prod_negativos: { porRol: { Cajero: true }, porUsuario: {} } },
};
assert.equal(tieneAccionProducto('prod_negativos', 'Cajero', null, otorgarCajero), true);

const porUsuario = {
  acciones: { prod_negativos: { porRol: {}, porUsuario: { u1: true } } },
};
assert.equal(tieneAccionProducto('prod_negativos', 'Cajero', 'u1', porUsuario), true);
assert.equal(tieneAccionProducto('prod_negativos', 'Cajero', 'u2', porUsuario), false);

assert.equal(tieneAccionProducto('prod_alta', 'Administrador', null, denegarAuditor), true);

console.log('productosAcciones.test.mjs OK');
