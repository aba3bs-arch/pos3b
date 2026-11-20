import assert from 'node:assert/strict';
import { armarReporteVentas, montosVentaReporte } from './reporteVentasRuta.js';

assert.deepEqual(montosVentaReporte({ metodo_pago: 'efectivo', total: 100 }), { efectivo: 100, credito: 0 });
assert.deepEqual(montosVentaReporte({ metodo_pago: 'credito', total: 40 }), { efectivo: 0, credito: 40 });
assert.deepEqual(
  montosVentaReporte({
    metodo_pago: 'mixto',
    total: 30,
    articulos: [{ _pago_mixto: true, efectivo: 10, credito: 20 }],
  }),
  { efectivo: 10, credito: 20 },
);

const tarjetas = armarReporteVentas({
  repartidores: [
    { id: 'rep_a', nombre: 'Luis Enrique Mada Osuna', activo: true },
    { id: 'rep_b', nombre: 'Recolector', activo: true },
  ],
  cargas: [
    { id: 'c1', estado: 'en_ruta', vendedor_id: 'rep_a', vendedor_nombre: 'Luis Enrique Mada Osuna' },
    { id: 'c2', estado: 'liquidada', vendedor_id: 'rep_a', vendedor_nombre: 'Luis Enrique Mada Osuna' },
  ],
  ventas: [
    { id: 'v1', carga_id: 'c1', folio: 'RC-1', cliente_tipo: 'sucursal', cliente_nombre: '3B5', metodo_pago: 'efectivo', total: 4730, created_at: '2026-11-20T10:00:00Z' },
    { id: 'v2', carga_id: 'c1', folio: 'RC-2', cliente_tipo: 'sucursal', cliente_nombre: '3B6', metodo_pago: 'credito', total: 1260, created_at: '2026-11-20T11:00:00Z' },
    { id: 'v3', carga_id: 'c1', folio: 'RC-3', cliente_tipo: 'externo', cliente_nombre: 'Tienda López', metodo_pago: 'efectivo', total: 2925, created_at: '2026-11-20T12:00:00Z' },
    { id: 'v4', carga_id: 'c2', folio: 'RC-VIEJA', cliente_tipo: 'sucursal', cliente_nombre: '3B2', metodo_pago: 'efectivo', total: 999, created_at: '2026-11-01T10:00:00Z' },
  ],
  transito: [
    { id: 't1', repartidor_id: 'rep_a', estatus: 'En Tránsito', tipo_movimiento: 'Cobro Crédito', monto: 1000, sucursal_origen: '3B10', num_traspaso: 'CXC-1' },
    { id: 't2', repartidor_id: 'rep_a', estatus: 'En Tránsito', tipo_movimiento: 'Cobro Servicio', monto: 50, sucursal_origen: '3B5', num_traspaso: 'SRV-1' },
    { id: 't3', repartidor_id: 'rep_a', estatus: 'En Tránsito', tipo_movimiento: 'Gasto', monto: 80 },
    { id: 't4', repartidor_id: 'rep_a', estatus: 'Liquidado', tipo_movimiento: 'Cobro Crédito', monto: 400 },
  ],
});

assert.equal(tarjetas[0].nombre, 'Luis Enrique Mada Osuna');
assert.equal(tarjetas[0].ventas.efectivo, 4730);
assert.equal(tarjetas[0].ventas.credito, 1260);
assert.equal(tarjetas[0].ventas.total, 5990);
assert.equal(tarjetas[0].ventas.count, 2);
assert.equal(tarjetas[0].externos.total, 2925);
assert.equal(tarjetas[0].externos.count, 1);
assert.equal(tarjetas[0].recuperados.total, 1000);
assert.equal(tarjetas[0].recuperados.count, 1);
assert.equal(tarjetas[0].servicios.total, 50);
assert.equal(tarjetas[0].servicios.count, 1);
assert.equal(tarjetas[0].saldo, 4730 + 1000 + 50 + 2925);
assert.equal(tarjetas[0].mov, 2 + 1 + 1 + 1);
assert.equal(tarjetas[1].nombre, 'Recolector');
assert.equal(tarjetas[1].saldo, 0);
assert.equal(tarjetas[1].mov, 0);
assert.equal(tarjetas.some((t) => t.ventas.filas.some((f) => f.folio === 'RC-VIEJA')), false);

console.log('reporteVentasRuta.test.mjs ok');
