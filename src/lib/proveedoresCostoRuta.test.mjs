import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVEEDORES_COSTO_PRECIO_RUTA_DEFAULT,
  leerProveedoresCostoPrecioRuta,
  guardarProveedoresCostoPrecioRuta,
  proveedorUsaCostoPrecioRuta,
  precioRutaComoCostoCompra,
} from './proveedoresCostoRuta.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => {
    mem.delete(k);
  },
};

test('default incluye Smoking', () => {
  mem.clear();
  assert.deepEqual(leerProveedoresCostoPrecioRuta(), PROVEEDORES_COSTO_PRECIO_RUTA_DEFAULT);
  assert.equal(proveedorUsaCostoPrecioRuta('Smoking'), true);
  assert.equal(proveedorUsaCostoPrecioRuta('SMOKING'), true);
  assert.equal(proveedorUsaCostoPrecioRuta('Otro'), false);
});

test('guardar lista personalizada', () => {
  mem.clear();
  guardarProveedoresCostoPrecioRuta(['Smoking', 'Demo Prov']);
  assert.equal(proveedorUsaCostoPrecioRuta('demo prov'), true);
  assert.equal(proveedorUsaCostoPrecioRuta('Smoking'), true);
});

test('precioRutaComoCostoCompra', () => {
  assert.equal(precioRutaComoCostoCompra({ precio_ruta: 2.1 }), 2.1);
  assert.equal(precioRutaComoCostoCompra({ precio_ruta: 0 }), null);
  assert.equal(precioRutaComoCostoCompra({}), null);
});
