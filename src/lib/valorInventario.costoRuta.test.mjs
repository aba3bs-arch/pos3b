import test from 'node:test';
import assert from 'node:assert/strict';
import {
  familiaMarcaPrecioRuta,
  precioRutaEfectivoParaCosto,
} from './proveedoresCostoRuta.js';
import {
  costoProveedorUnitario,
  importeUnitarioMovimientoInventario,
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

test('PallMall junto y separado = PALLMALL', () => {
  assert.equal(familiaMarcaPrecioRuta('PallMall Hawaii'), 'PALLMALL');
  assert.equal(familiaMarcaPrecioRuta('PallMall Alaska'), 'PALLMALL');
  assert.equal(familiaMarcaPrecioRuta('Pall Mall Tokio'), 'PALLMALL');
  assert.equal(familiaMarcaPrecioRuta('Double Fusion Ruby'), 'PALLMALL');
  assert.equal(familiaMarcaPrecioRuta('Malboro Blanco 100'), 'MARLBORO');
  assert.equal(familiaMarcaPrecioRuta('Smoking Gun Pieza'), 'SMOKING');
});

test('usa precio_ruta del SKU cuando está capturado (\$6)', () => {
  mem.clear();
  const p = { id: '42', nombre: 'PallMall Hawaii', precio_ruta: 6, precio_compra_con: 5.25 };
  assert.equal(precioRutaEfectivoParaCosto(p, []), 6);
  assert.equal(
    importeUnitarioMovimientoInventario(
      { producto_nombre: 'PallMall Hawaii', precio: 5.25, subtotal: 105, cantidad: 20 },
      p,
      { catalogo: [p] },
    ),
    6,
  );
});

test('sin precio_ruta: tarifa CEDIS fija PallMall/Marlboro \$6 y Smoking \$2.10', () => {
  mem.clear();
  assert.equal(
    precioRutaEfectivoParaCosto({ id: '39', nombre: 'PallMall Alaska', precio_ruta: 0, precio_compra_con: 5.25 }, []),
    6,
  );
  assert.equal(
    precioRutaEfectivoParaCosto({ id: '32', nombre: 'Malboro Blanco 100', precio_ruta: 0, precio_compra_con: 5.25 }, []),
    6,
  );
  assert.equal(
    precioRutaEfectivoParaCosto({ id: '30', nombre: 'Smoking Gun Pieza', precio_ruta: 0, precio_compra_con: 2.1 }, []),
    2.1,
  );
});

test('nunca usa el \$5.25 sellado del movimiento para PallMall', () => {
  mem.clear();
  const p = { id: '42', nombre: 'PallMall Hawaii', precio_ruta: 6, precio_compra_con: 5.25, precio: 8 };
  const m = {
    producto_id: '42',
    producto_nombre: 'PallMall Hawaii',
    cantidad: 20,
    precio: 5.25,
    subtotal: 105,
  };
  assert.equal(importeUnitarioMovimientoInventario(m, p, { catalogo: [p] }), 6);
  assert.equal(costoProveedorUnitario(p, { catalogo: [p] }), 6);
});
