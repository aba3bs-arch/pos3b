import test from 'node:test';
import assert from 'node:assert/strict';
import {
  familiaMarcaPrecioRuta,
  precioRutaEfectivoParaCosto,
} from './proveedoresCostoRuta.js';
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

const catalogo = [
  { id: '33', nombre: 'Malboro Vista 100', precio: 8, precio_compra_con: 5.25, precio_ruta: 6 },
  { id: '32', nombre: 'Malboro Blanco 100', precio: 8, precio_compra_con: 5.25, precio_ruta: 0 },
  { id: '34', nombre: 'Double Fusion Ruby', precio: 8, precio_compra_con: 5.25, precio_ruta: 0 },
  { id: '30', nombre: 'Smoking Gun Pieza', precio: 5, precio_compra_con: 2.1, precio_ruta: 2.1 },
];

test('familias de marca', () => {
  assert.equal(familiaMarcaPrecioRuta('Malboro Blanco 100'), 'MARLBORO');
  assert.equal(familiaMarcaPrecioRuta('Marlboro Vista 100'), 'MARLBORO');
  assert.equal(familiaMarcaPrecioRuta('Double Fusion Ruby'), 'PALLMALL');
  assert.equal(familiaMarcaPrecioRuta('Smoking Gun Pieza'), 'SMOKING');
});

test('Blanco hereda $6 de Vista; Double Fusion también $6; Smoking $2.10', () => {
  mem.clear();
  assert.equal(precioRutaEfectivoParaCosto(catalogo[0], catalogo), 6);
  assert.equal(precioRutaEfectivoParaCosto(catalogo[1], catalogo), 6);
  assert.equal(precioRutaEfectivoParaCosto(catalogo[2], catalogo), 6);
  assert.equal(precioRutaEfectivoParaCosto(catalogo[3], catalogo), 2.1);
});

test('Consultas: sello $5.25 no pisa precio ruta heredado', () => {
  mem.clear();
  const blanco = catalogo[1];
  const m = {
    producto_id: '32',
    producto_nombre: 'Malboro Blanco 100',
    cantidad: 20,
    precio: 5.25,
    subtotal: 105,
  };
  assert.equal(
    importeUnitarioMovimientoInventario(m, blanco, { catalogo }),
    6,
  );
  assert.equal(
    importeUnitarioMovimientoInventario(
      { ...m, producto_id: '34', producto_nombre: 'Double Fusion Ruby', precio: 5.25 },
      catalogo[2],
      { catalogo },
    ),
    6,
  );
  assert.equal(costoProveedorUnitario(blanco, { catalogo }), 6);
  assert.equal(precioVentaUnitarioProducto(blanco), 8);
});

test('Smoking propio $2.10', () => {
  mem.clear();
  assert.equal(costoProveedorUnitario(catalogo[3], { catalogo }), 2.1);
});
