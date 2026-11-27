import assert from 'node:assert/strict';
import { filasTiendaDesdeVentas } from './tableroCamionRc.js';

const { filas, total } = filasTiendaDesdeVentas([
  {
    id: '1',
    folio: 'VR-1-E',
    cliente_tipo: 'sucursal',
    cliente_id: '3B5',
    cliente_nombre: '3B5 Lomas Dos',
    metodo_pago: 'efectivo',
    total: 4000,
    created_at: '2026-11-17T18:00:00Z',
    articulos: [{ producto_id: '85', nombre: 'Cañón', cantidad: 10, precio: 400, importe: 4000 }],
  },
  {
    id: '2',
    folio: 'VR-2-C',
    cliente_tipo: 'sucursal',
    cliente_id: '3B5',
    cliente_nombre: '3B5 Lomas Dos',
    metodo_pago: 'credito',
    total: 500,
    estado_credito: 'pendiente',
    created_at: '2026-11-17T19:00:00Z',
    articulos: [{ producto_id: '93', nombre: 'Escupidor', cantidad: 2, precio: 250, importe: 500 }],
  },
  {
    id: '3',
    folio: 'VR-3-E',
    cliente_id: '3B5',
    metodo_pago: 'efectivo',
    total: 100,
    articulos: [{ producto_id: '1', importe: 100 }, { _recepcion_pendiente: true }],
  },
]);

assert.equal(filas.length, 1);
assert.equal(filas[0].mov, 2);
assert.equal(filas[0].efectivo, 4000);
assert.equal(filas[0].credito, 500);
assert.equal(filas[0].venta, 4500);
assert.equal(filas[0].tickets[1].metodo, 'Crédito');
assert.equal(total.venta, 4500);
assert.equal(filas[0].tickets[0].productos, 1);

console.log('tableroCamionRc.test.mjs ok');
