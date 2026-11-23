import assert from 'node:assert/strict';
import {
  armarTableroInventarioCamion,
  dineroTablero,
  totalMarcado,
} from './tableroInventarioCamion.js';

const ventas = [
  {
    id: 'a',
    folio: 'FUS-000145',
    cliente_id: 'FUSION',
    cliente_nombre: 'Fusión',
    metodo_pago: 'efectivo',
    total: 2800,
    created_at: '2026-11-17T18:08:24Z',
    articulos: [{ producto_id: '1', nombre: 'Aceite', cantidad: 8, precio: 350, importe: 2800 }],
  },
  {
    id: 'b',
    folio: 'FUS-000146',
    cliente_id: 'Fusión',
    metodo_pago: 'credito',
    total: 3200,
    created_at: '2026-11-17T20:47:09Z',
    articulos: [
      { producto_id: '2', nombre: 'Arroz', cantidad: 5, precio: 640, importe: 3200 },
      { _recepcion_pendiente: true },
    ],
  },
  {
    id: 'c',
    folio: '3B5-000010',
    cliente_id: '3B5',
    metodo_pago: 'mixto',
    total: 4500,
    created_at: '2026-11-17T19:00:00Z',
    articulos: [
      { producto_id: '3', nombre: 'Frijol', cantidad: 3, precio: 1500, importe: 4500 },
      { _pago_mixto: true, efectivo: 4000, credito: 500 },
    ],
  },
  {
    id: 'd',
    folio: 'ANULADO',
    cliente_id: '3B6',
    metodo_pago: 'efectivo',
    total: 999,
    estado: 'cancelada',
    articulos: [{ producto_id: '9', nombre: 'X', cantidad: 1, precio: 999, importe: 999 }],
  },
];

const tablero = armarTableroInventarioCamion({ cargado: 50000, disponible: 27000, ventas });

assert.equal(tablero.cargado, 50000);
assert.equal(tablero.disponible, 27000);
assert.equal(tablero.venta.total, 10500);
assert.equal(tablero.venta.efectivo, 6800);
assert.equal(tablero.venta.credito, 3700);
assert.equal(tablero.venta.mov, 3);
assert.equal(tablero.tiendas.length, 2);
assert.equal(tablero.tiendas[0].etiqueta, 'FUSION');
assert.equal(tablero.tiendas[0].mov, 2);
assert.equal(tablero.tiendas[0].venta, 6000);
assert.equal(tablero.tiendas[0].efectivo, 2800);
assert.equal(tablero.tiendas[0].credito, 3200);
assert.equal(tablero.tiendas[0].tickets[0].piezas, 8);
assert.equal(tablero.tiendas[0].tickets[1].piezas, 5);
assert.equal(tablero.tiendas[1].efectivo, 4000);
assert.equal(tablero.tiendas[1].credito, 500);
assert.equal(dineroTablero(23000), '$23,000.00');

const parcial = totalMarcado(tablero.tiendas, { FUSION: true, '3B5': false });
assert.equal(parcial.total, 6000);
assert.equal(parcial.mov, 2);

const todo = totalMarcado(tablero.tiendas, {});
assert.equal(todo.total, 10500);

console.log('tableroInventarioCamion.test.mjs ok');
