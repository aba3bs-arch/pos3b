import assert from 'node:assert/strict';
import {
  armarTableroTiendas,
  idsMovimientosMarcados,
  incorporarVentasCredito,
  montoCreditoDeVenta,
  nombreCortoCamion,
  totalesMarcados,
  totalLiquidable,
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

const ventaCredito = {
  id: 'v10',
  folio: 'VR-10',
  metodo_pago: 'credito',
  total: 1000,
  cliente_id: '3B10',
  created_at: '2026-11-18T18:00:00Z',
  articulos: [{ nombre: 'Frijol', cantidad: 4, precio: 250, importe: 1000 }],
};
const conAbono = incorporarVentasCredito(
  { filas: [], totales: { count: 0, efectivo: 0, credito: 0, abono: 0, total: 0 } },
  [ventaCredito],
  [
    { id: 'c10', tipo: 'cargo', venta_id: 'v10', folio_venta: 'VR-10-C', monto: 800, estatus: 'pendiente' },
    { id: 'a10', tipo: 'abono', cargo_id: 'c10', venta_id: 'v10', folio_venta: 'VR-10-C', monto: 200 },
  ],
);
assert.equal(conAbono.filas.length, 1);
assert.equal(conAbono.filas[0].tienda, '3B10');
assert.equal(conAbono.filas[0].credito, 1000);
assert.equal(conAbono.filas[0].abono, 200);
assert.equal(conAbono.filas[0].tickets[0].saldo, 800);
assert.equal(conAbono.totales.total, 1000);
assert.equal(totalLiquidable(conAbono.filas, {}), 0);
assert.deepEqual(idsMovimientosMarcados(conAbono.filas, {}), []);

const yaCobrado = incorporarVentasCredito(
  armarTableroTiendas([
    { id: 'm9', sucursal_origen: '3B10', tipo_movimiento: 'Cobro Crédito', monto: 1000, num_traspaso: 'VR-10-C' },
  ], [ventaCredito]),
  [ventaCredito],
  [{ id: 'c11', tipo: 'cargo', venta_id: 'v10', folio_venta: 'VR-10-C', monto: 1000, estatus: 'pagado', pagado_at: '2026-11-18T20:00:00Z' }],
);
assert.equal(yaCobrado.filas[0].credito, 1000);
assert.equal(yaCobrado.filas[0].abono, 1000);
assert.equal(yaCobrado.filas[0].count, 1);
assert.equal(totalLiquidable(yaCobrado.filas, {}), 1000);

const mixto = {
  id: 'vm',
  folio: 'VR-M',
  metodo_pago: 'mixto',
  total: 1500,
  cliente_id: 'FUSION',
  articulos: [{ _pago_mixto: true, efectivo: 500, credito: 1000 }],
};
assert.equal(montoCreditoDeVenta(mixto), 1000);
const tabMix = incorporarVentasCredito({ filas: [], totales: {} }, [mixto], []);
assert.equal(tabMix.filas[0].credito, 1000);
assert.equal(tabMix.filas[0].abono, 0);
assert.equal(tabMix.filas[0].tickets[0].productos, 0);

console.log('tableroCamionPreinventario.test.mjs OK');
