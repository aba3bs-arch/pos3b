import assert from 'node:assert/strict';
import { armarCaratulaRcServicios } from './caratulaRcServicios.js';

const reps = [
  { id: 'rep_a', nombre: 'Luis Enrique Mada Osuna' },
  { id: 'rep_b', nombre: 'Recolector' },
];

const movs = [
  { repartidor_id: 'rep_a', tipo_movimiento: 'Venta Ruta', sucursal_origen: '3B6', monto: 4730, estatus: 'En Tránsito' },
  { repartidor_id: 'rep_a', tipo_movimiento: 'Cobro Crédito', sucursal_origen: '3B6', monto: 1000, estatus: 'En Tránsito' },
  { repartidor_id: 'rep_a', tipo_movimiento: 'Venta Ruta', sucursal_origen: 'CEDIS', monto: 2925, estatus: 'En Tránsito' },
  { repartidor_id: 'rep_a', tipo_movimiento: 'Gasto', sucursal_origen: '3B6', monto: 80, estatus: 'En Tránsito' },
  { repartidor_id: 'rep_a', tipo_movimiento: 'Recolección', sucursal_origen: '3B10', monto: 50, estatus: 'Liquidado' },
];

const creditos = [
  { id: 'c1', tipo: 'cargo', estatus: 'pendiente', monto: 1260, usuario_nombre: 'Luis Enrique Mada Osuna' },
  { id: 'c2', tipo: 'cargo', estatus: 'pagado', pagado_at: '2026-11-18', monto: 400, usuario_nombre: 'Luis Enrique Mada Osuna' },
];

const [luis, otro] = armarCaratulaRcServicios(reps, movs, creditos);

assert.equal(luis.nombre, 'Luis Enrique Mada Osuna');
assert.equal(luis.ventas.efectivo, 4730);
assert.equal(luis.ventas.creditoNuevo, 1260);
assert.equal(luis.ventas.total, 5990);
assert.equal(luis.ventas.count, 2);
assert.equal(luis.recuperados.total, 1000);
assert.equal(luis.recuperados.count, 1);
assert.equal(luis.servicios.total, 0);
assert.equal(luis.externos.total, 2925);
assert.equal(luis.externos.count, 1);
assert.equal(luis.saldo, 9915);
assert.equal(luis.transito, 3);
assert.equal(luis.rc, 3);
assert.equal(otro.saldo, 0);
assert.equal(otro.transito, 0);

const suelto = armarCaratulaRcServicios([], [
  { repartidor_id: 'rep_x', repartidores: { nombre: 'Ana Ruiz' }, tipo_movimiento: 'Cobro Servicio', sucursal_origen: '3B9', monto: 50, estatus: 'En Tránsito' },
], []);
assert.equal(suelto[0].nombre, 'Ana Ruiz');
assert.equal(suelto[0].servicios.total, 50);
assert.equal(suelto[0].saldo, 50);

const legado = armarCaratulaRcServicios(
  [{ id: 'rep_c', nombre: 'Misael' }],
  [
    { repartidor_id: 'rep_c', tipo_movimiento: 'Recolección', sucursal_origen: '3B6', monto: 80, foto_url: 'crédito cobrado', estatus: 'En Tránsito' },
    { repartidor_id: 'rep_c', tipo_movimiento: 'Entrega Crédito', sucursal_origen: '3B6', monto: 300, estatus: 'En Tránsito' },
  ],
  [],
);
assert.equal(legado[0].recuperados.total, 80);
assert.equal(legado[0].ventas.efectivo, 0);
assert.equal(legado[0].saldo, 80);
assert.equal(legado[0].transito, 2);
assert.equal(legado[0].rc, 1);

console.log('caratulaRcServicios.test.mjs ok');
