import assert from 'node:assert/strict';
import { armarConsultaPorTienda, completarRepartidores, recolectorInicial, totalMarcado } from './consultaPorTienda.js';

const tablero = armarConsultaPorTienda({
  repartidorId: 'rep_a',
  repartidores: [{ id: 'rep_a', nombre: 'Luis Enrique', activo: true }],
  cargas: [
    { id: 'c1', estado: 'en_ruta', vendedor_id: 'rep_a', vendedor_nombre: 'Luis Enrique', created_at: '2026-11-17T17:42:57Z' },
    { id: 'c2', estado: 'liquidada', vendedor_id: 'rep_a', created_at: '2026-11-01T10:00:00Z' },
  ],
  lineas: [
    { carga_id: 'c1', producto_id: 'p1', precio: 10, qty_cargada: 5000, qty_vendida: 2300, qty_devuelta: 0 },
    { carga_id: 'c2', producto_id: 'p1', precio: 10, qty_cargada: 99, qty_vendida: 0, qty_devuelta: 0 },
  ],
  productos: [],
  ventas: [
    { id: 'v1', carga_id: 'c1', folio: 'FUS-000145', cliente_tipo: 'sucursal', cliente_id: 'FUSION', metodo_pago: 'efectivo', total: 4000, articulos: [{ nombre: 'A', cantidad: 8, importe: 2800 }, { nombre: 'B', cantidad: 2, importe: 1200 }], created_at: '2026-11-17T18:08:24Z' },
    { id: 'v2', carga_id: 'c1', folio: 'FUS-000146', cliente_tipo: 'sucursal', cliente_id: 'FUSION', metodo_pago: 'credito', total: 2000, articulos: [{ nombre: 'C', cantidad: 5, importe: 2000 }], created_at: '2026-11-17T20:47:09Z' },
    { id: 'v3', carga_id: 'c1', folio: '3B5-1', cliente_tipo: 'sucursal', cliente_id: '3B5', metodo_pago: 'mixto', total: 4500, articulos: [{ _pago_mixto: true, efectivo: 3500, credito: 1000 }], created_at: '2026-11-17T19:00:00Z' },
    { id: 'v4', carga_id: 'c2', folio: 'VIEJO', cliente_tipo: 'sucursal', cliente_id: '3B2', metodo_pago: 'efectivo', total: 999, created_at: '2026-11-01T10:00:00Z' },
  ],
  transito: [
    { id: 't1', repartidor_id: 'rep_a', estatus: 'En Tránsito', tipo_movimiento: 'Venta Ruta', monto: 4000, sucursal_origen: 'FUSION', num_traspaso: 'FUS-000145' },
    { id: 't2', repartidor_id: 'rep_a', estatus: 'Liquidado', tipo_movimiento: 'Venta Ruta', monto: 100, sucursal_origen: 'FUSION' },
  ],
  ahora: '2026-11-18T17:27:53Z',
});

assert.equal(tablero.cargado, 50000);
assert.equal(tablero.disponible, 27000);
assert.equal(tablero.venta, 4000 + 2000 + 4500);
assert.equal(tablero.efectivo, 4000 + 3500);
assert.equal(tablero.credito, 2000 + 1000);
assert.equal(tablero.mov, 3);
assert.equal(tablero.tiendas.find((t) => t.codigo === 'FUSION').mov, 2);
assert.equal(tablero.tiendas.find((t) => t.codigo === 'FUSION').venta, 6000);
assert.equal(tablero.tiendas.find((t) => t.codigo === '3B5').efectivo, 3500);
assert.equal(tablero.tiendas.some((t) => t.codigo === '3B2'), false);
assert.equal(tablero.tiendas.every((t) => t.marcada), true);
assert.equal(tablero.tiendas.find((t) => t.codigo === 'FUSION').tickets[0].productos, 2);
assert.equal(tablero.tiendas.find((t) => t.codigo === 'FUSION').transito.length, 1);

const marcado = totalMarcado({
  tiendas: [
    { marcada: true, venta: 6000, efectivo: 4000, credito: 2000, transito: [{ tipo: 'efectivo', monto: 4000 }] },
    { marcada: false, venta: 4500, efectivo: 3500, credito: 1000, transito: [] },
  ],
});
assert.equal(marcado.venta, 6000);
assert.equal(marcado.efectivo, 4000);
assert.equal(marcado.transitoEfectivo, 4000);

const reps = completarRepartidores(
  [{ id: 'rep_a', nombre: 'Luis', activo: true }, { id: 'off', nombre: 'Baja', activo: false }],
  [{ id: 'c9', estado: 'en_ruta', vendedor_id: 'user_x', vendedor_nombre: 'Pedro' }],
);
assert.equal(reps.length, 2);
assert.equal(reps[1].nombre, 'Pedro');
assert.equal(
  recolectorInicial(reps, [{ estado: 'en_ruta', vendedor_id: 'user_x', vendedor_nombre: 'Pedro' }]),
  reps[1].id,
);
assert.equal(tablero.tiendas[0].codigo, 'FUSION');

console.log('consultaPorTienda.test.mjs ok');
