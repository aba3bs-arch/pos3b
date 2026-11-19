import assert from 'node:assert/strict';
import { parchePrecioCompraCon, parchePrecioCompraSin, precioCompraConDeProducto } from './productoForm.js';

const lata = {
  id: '7501022014554',
  nombre: '7 UP LATA 355ML',
  precio: 19,
  impuesto: 8,
  precio_compra_sin: 10,
  precio_compra_con: 10.8,
  precio_venta_sin: 17.59,
  ganancia_pct: 75.9,
};

assert.equal(precioCompraConDeProducto(lata), 10.8);
assert.equal(precioCompraConDeProducto({ precio: 19, impuesto: 8, precio_compra_sin: 10 }), 10.8);
assert.equal(precioCompraConDeProducto({ precio: 19, impuesto: 0, precio_compra_con: 5 }), 5);

const soloCosto = parchePrecioCompraCon(lata, 12.96);
assert.deepEqual(
  { con: soloCosto.precio_compra_con, sin: soloCosto.precio_compra_sin, costo: soloCosto.costo },
  { con: 12.96, sin: 12, costo: 12.96 },
);
assert.equal(soloCosto.ganancia_pct, 46.58);

const conVenta = parchePrecioCompraCon(lata, 12.96, 20);
assert.equal(conVenta.ganancia_pct, 54.33);
assert.equal(conVenta.precio_compra_sin, 12);

assert.equal(parchePrecioCompraCon(lata, -1), null);

const captura = {
  precio: 19,
  impuesto: 8,
  precio_compra_sin: 13.12,
  precio_venta_sin: 17.59,
  ganancia_pct: 34.07,
};
const sinIva = parchePrecioCompraSin(captura, 13.12);
assert.equal(sinIva.precio_compra_sin, 13.12);
assert.equal(sinIva.precio_compra_con, 14.17);
assert.equal(sinIva.precio, undefined);

const cambiaIva = parchePrecioCompraSin(captura, 13.12, { impuesto: 0 });
assert.equal(cambiaIva.impuesto, 0);
assert.equal(cambiaIva.precio_compra_con, 13.12);
assert.equal(cambiaIva.precio, 18);
assert.equal(parchePrecioCompraSin(captura, -2), null);
