import assert from 'node:assert/strict';
import {
  agruparLiquidaciones,
  enriquecerConSaldoCxc,
  saldoCxcEn,
} from './historialLiquidaciones.js';

const T1 = '2026-10-10T20:00:00.000Z';
const T2 = '2026-10-20T20:00:00.000Z';
const base = { repartidor_id: 'r1', repartidores: { nombre: 'Luis' } };
const rows = [
  { ...base, id: '1', tipo_movimiento: 'Cobro Crédito', monto: 5000, sucursal_origen: '3B6', fecha_liquidacion: T1, usuario_liquida: 'AMR' },
  { ...base, id: '2', tipo_movimiento: 'Venta Ruta', monto: 5000, sucursal_origen: '3B6', fecha_liquidacion: T1, usuario_liquida: 'AMR' },
  { ...base, id: '3', tipo_movimiento: 'Gasto', monto: 200, sucursal_origen: '3B6', fecha_liquidacion: T1 },
  { ...base, id: '4', tipo_movimiento: 'Cobro Servicio', monto: 999, fecha_liquidacion: T1 },
  { ...base, id: '5', tipo_movimiento: 'Venta Ruta', monto: 300, sucursal_origen: '3B2', fecha_liquidacion: T2, usuario_liquida: 'AMR' },
  { ...base, id: '6', tipo_movimiento: 'Venta Ruta', monto: 10, fecha_liquidacion: null },
];

const liqs = agruparLiquidaciones(rows);
assert.equal(liqs.length, 2);
assert.equal(liqs[0].fecha, T2);
assert.equal(liqs[1].totalCreditos, 5000);
assert.equal(liqs[1].totalEfectivo, 5000);
assert.equal(liqs[1].totalGastos, 200);
assert.equal(liqs[1].bruto, 10000);
assert.equal(liqs[1].neto, 9800);
assert.equal(liqs[1].adminNombre, 'AMR');
assert.equal(liqs[1].repartidorNombre, 'Luis');

const cxc = [
  { tipo: 'cargo', monto: 30000, created_at: '2026-10-01T10:00:00Z' },
  { tipo: 'abono', monto: 5000, created_at: '2026-10-09T10:00:00Z' },
  { tipo: 'cargo', monto: 1000, created_at: '2026-10-15T10:00:00Z' },
];
assert.equal(saldoCxcEn(cxc, T1), 25000);
assert.equal(saldoCxcEn(cxc), 26000);
const enr = enriquecerConSaldoCxc(liqs, cxc);
assert.equal(enr[1].creditoQuedan, 25000);
assert.equal(enr[1].creditoTotal, 30000);
assert.equal(enriquecerConSaldoCxc(liqs, null)[0].creditoQuedan, null);

console.log('historialLiquidaciones.test.mjs OK');
