import test from 'node:test';
import assert from 'node:assert/strict';
import {
  costoProveedorUnitario,
  importeUnitarioMovimientoInventario,
  precioVentaUnitarioProducto,
} from './valorInventario.js';

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

test('Smoking usa precio_ruta 2.10', () => {
  mem.clear();
  const p = {
    id: '30',
    precio: 5,
    precio_compra_con: 0,
    precio_compra_sin: 0,
    precio_ruta: 2.1,
    costo: 0,
  };
  assert.equal(costoProveedorUnitario(p), 2.1);
  assert.equal(precioVentaUnitarioProducto(p), 5);
  assert.equal(importeUnitarioMovimientoInventario({ cantidad: 200 }, p), 2.1);
});

test('Marlboro/Pall Mall: precio_ruta 6 gana sobre compra 5.25', () => {
  mem.clear();
  const p = {
    id: '35',
    precio: 8,
    precio_compra_con: 5.25,
    precio_compra_sin: 4.86,
    precio_ruta: 6,
    costo: 5.25,
  };
  assert.equal(costoProveedorUnitario(p), 6);
  assert.equal(importeUnitarioMovimientoInventario({ cantidad: 20, precio: 5.25, subtotal: 105 }, p), 6);
  assert.equal(precioVentaUnitarioProducto(p), 8);
});

test('sin precio_ruta usa compra', () => {
  mem.clear();
  const p = { id: '1', precio: 8, precio_compra_con: 5.25, precio_ruta: 0 };
  assert.equal(costoProveedorUnitario(p), 5.25);
});

test('precio null/0 en movimiento no tapa el catálogo', () => {
  mem.clear();
  const p = { id: '30', precio: 5, precio_ruta: 2.1, precio_compra_con: 0 };
  const m = { cantidad: 20, precio: null, subtotal: null, meta: { precio: null, subtotal: 0 } };
  assert.equal(importeUnitarioMovimientoInventario(m, p), 2.1);
});
