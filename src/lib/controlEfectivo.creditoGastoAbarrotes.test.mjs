import assert from 'node:assert/strict';
import {
  payloadGastoCreditoCobradoAbarrotes,
  esCobroCreditoMovimiento,
  TIPO_COBRO_CREDITO,
  reporteGeneralPorTienda,
  movimientosMercancia,
  construirDatosTraspaso,
} from './controlEfectivo.js';

const p = payloadGastoCreditoCobradoAbarrotes(
  {
    sucursal_origen: '3B2',
    num_traspaso: '843',
    monto: 810,
    cajero_nombre: 'lyver',
  },
  { cajero: 'cajero cobro' },
);

assert.equal(p.modulo, 'abarrotes');
assert.equal(p.categoria, 'CREDITO');
assert.equal(p.subcategoria, 'COBRADO');
assert.equal(p.sucursal_id, '3B2');
assert.equal(p.monto, 810);
assert.equal(p.cerrado, false);
assert.equal(p.descontado_nomina, false);
assert.match(p.comentario, /CREDITO COBRADO/);
assert.match(p.comentario, /843/);
assert.match(p.comentario, /CAJERO COBRO/);

const p2 = payloadGastoCreditoCobradoAbarrotes({
  sucursal_origen: 'FUSION',
  num_traspaso: '886',
  monto: 1506,
});
assert.equal(p2.sucursal_id, 'FUSION');
assert.equal(p2.monto, 1506);

// Entrega a crédito sigue siendo Entrega Crédito / Por Cobrar (nunca venta).
const entrega = construirDatosTraspaso({
  tienda: '3B2',
  repartidorId: 'r1',
  cajero: 'Ana',
  folio: '900',
  monto: 500,
  esEfectivo: false,
});
assert.equal(entrega.tipo_movimiento, 'Entrega Crédito');
assert.equal(entrega.estatus, 'Por Cobrar');

const efectivo = construirDatosTraspaso({
  tienda: '3B2',
  repartidorId: 'r1',
  cajero: 'Ana',
  folio: '901',
  monto: 500,
  esEfectivo: true,
});
assert.equal(efectivo.tipo_movimiento, 'Recolección');
assert.equal(efectivo.estatus, 'En Tránsito');

assert.equal(TIPO_COBRO_CREDITO, 'Cobro Crédito');
assert.equal(esCobroCreditoMovimiento({ tipo_movimiento: TIPO_COBRO_CREDITO }), true);
assert.equal(esCobroCreditoMovimiento({ tipo_movimiento: 'Recolección' }), false);
assert.equal(
  esCobroCreditoMovimiento({
    tipo_movimiento: 'Recolección',
    foto_url: 'Crédito cobrado. Desglose: 843: $810.00',
  }),
  true,
);
assert.equal(esCobroCreditoMovimiento({ tipo_movimiento: 'Entrega Crédito' }), false);

const merc = movimientosMercancia([
  { tipo_movimiento: 'Recolección', monto: 100 },
  { tipo_movimiento: 'Entrega Crédito', monto: 200 },
  { tipo_movimiento: TIPO_COBRO_CREDITO, monto: 300 },
  { tipo_movimiento: 'Cobro Servicio', monto: 50 },
]);
assert.equal(merc.length, 3);
assert.equal(merc.reduce((a, m) => a + m.monto, 0), 600);

// Cobro Crédito cuenta en crédito del reporte, NUNCA en recolección (venta/cobro Smoking).
const rep = reporteGeneralPorTienda([
  { sucursal_origen: '3B2', tipo_movimiento: 'Recolección', estatus: 'En Tránsito', monto: 1000 },
  { sucursal_origen: '3B2', tipo_movimiento: TIPO_COBRO_CREDITO, estatus: 'En Tránsito', monto: 810 },
  { sucursal_origen: '3B2', tipo_movimiento: 'Entrega Crédito', estatus: 'Por Cobrar', monto: 200 },
]);
const fila = rep.filas.find((f) => f.tienda === '3B2');
assert.ok(fila);
assert.equal(fila.recoleccion, 1000);
assert.equal(fila.credito, 1010);
assert.equal(fila.movCredito, 2);
assert.equal(fila.movRecoleccion, 1);

console.log('controlEfectivo.creditoGastoAbarrotes.test.mjs OK');
