import assert from 'node:assert/strict';
import {
  armarTableroTiendas,
  idsMovimientosMarcados,
  nombreCortoCamion,
  totalesMarcados,
  valoresInventarioCamion,
} from './tableroCamionPreinventario.js';

const valores = valoresInventarioCamion(
  [
    { producto_id: 'a', qty_cargada: 10, qty_vendida: 4, qty_devuelta: 0, precio: 100 },
    { producto_id: 'b', qty_cargada: 5, qty_vendida: 1, qty_devuelta: 0, precio: 0 },
  ],
  [{ id: 'b', precio_ruta: 20 }],
);
assert.equal(valores.cargado, 1100);
assert.equal(valores.disponible, 680);
assert.equal(valores.vendido, 420);

assert.equal(nombreCortoCamion({ alias: 'HHR', codigo: 'CAM-1' }), 'HHR');
assert.equal(nombreCortoCamion({ codigo: 'HONDA' }), 'HONDA');

const tablero = armarTableroTiendas(
  [
    { id: 'm1', sucursal_origen: 'Fusión', tipo_movimiento: 'Venta Ruta', monto: 2800, num_traspaso: 'VR-1-E', fecha_hora: '2026-11-17T18:08:00Z' },
    { id: 'm2', sucursal_origen: 'FUSION', tipo_movimiento: 'Cobro Crédito', monto: 3200, num_traspaso: 'VR-2-C', fecha_hora: '2026-11-17T20:47:00Z' },
    { id: 'm3', sucursal_origen: '3B5', tipo_movimiento: 'Venta Ruta', monto: 4500, num_traspaso: 'VR-3-E' },
    { id: 'm4', sucursal_origen: '3B5', tipo_movimiento: 'Cobro Servicio', monto: 50, num_traspaso: 'SRV' },
  ],
  [
    {
      folio: 'VR-1-E',
      total: 2800,
      metodo_pago: 'efectivo',
      created_at: '2026-11-17T18:08:24Z',
      articulos: [
        { nombre: 'Aceite', cantidad: 2, precio: 40, importe: 80 },
        { nombre: 'Arroz', cantidad: 6, precio: 20, importe: 120 },
      ],
    },
  ],
);

assert.equal(tablero.filas.length, 2);
assert.equal(tablero.filas[0].tienda, 'FUSION');
assert.equal(tablero.filas[0].efectivo, 2800);
assert.equal(tablero.filas[0].credito, 3200);
assert.equal(tablero.filas[0].total, 6000);
assert.equal(tablero.filas[0].count, 2);
assert.equal(tablero.filas[0].tickets[0].folio, 'VR-2-C');
assert.equal(tablero.filas[0].tickets[1].productos, 2);
assert.equal(tablero.filas[0].tickets[1].piezas, 8);
assert.equal(tablero.filas[0].tickets[1].tipo, 'efectivo');
assert.equal(tablero.filas[1].tienda, '3B5');
assert.equal(tablero.filas[1].total, 4500);
assert.equal(tablero.totales.count, 3);
assert.equal(tablero.totales.total, 10500);

const marcas = { FUSION: false };
assert.equal(totalesMarcados(tablero.filas, marcas).total, 4500);
assert.deepEqual(idsMovimientosMarcados(tablero.filas, marcas), ['m3']);

console.log('tableroCamionPreinventario.test.mjs OK');
