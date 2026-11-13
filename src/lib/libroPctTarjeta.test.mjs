import assert from 'node:assert/strict';
import { armarLibroCajaAbarrotes } from './contVirtualData.js';

const cierre = (id, hora, tarjeta, ventas) => ({
  id,
  folio: `AB-${id}`,
  sucursal_id: '3B5',
  turno: 'Turno',
  created_at: `2026-11-12T${hora}:00:00Z`,
  ventas,
  caja_actual: 0,
  detalle: { tarjeta, caja_anterior: 0, gastos: [], gastos_total: 0, fecha_negocio: '2026-11-12' },
});

const cierres = [cierre(2, '23', 100, 500), cierre(1, '18', 500, 2000)];
const r = armarLibroCajaAbarrotes({
  cierres,
  todosCierres: cierres,
  posTarjeta: [{ tienda: '3B5', fecha: '2026-11-12', monto: 350 }],
  desde: '2026-11-07',
});
const c1 = r.cortes.find((c) => c.id === 1);
const c2 = r.cortes.find((c) => c.id === 2);
assert.equal(c1.pctAba, 350);
assert.equal(c1.pctVirtual, 150);
assert.equal(c2.pctAba, 0);
assert.equal(c2.pctVirtual, 100);
assert.equal(c1.posDisponible, true);

const sinPos = armarLibroCajaAbarrotes({ cierres, todosCierres: cierres, posTarjeta: null, desde: '2026-11-07' });
assert.equal(sinPos.cortes[0].pctAba, sinPos.cortes[0].tarjeta);
assert.equal(sinPos.cortes[0].pctVirtual, 0);
assert.equal(sinPos.cortes[0].posDisponible, false);

console.log('libroPctTarjeta.test.mjs OK');

// Gastos sin corte: un cierre operativo del cajero (posterior al cutover) no los saca de «sin corte».
const diario = { id: 'd1', folio: 'CGA-00001', sucursal_id: '3B5', created_at: '2026-11-14T06:59:00Z', ventas: 0, caja_actual: 0, detalle: { tipo_cierre: 'cierre_diario', fecha_negocio: '2026-11-13', gastos_ids: ['g1'], gastos: [{ id: 'g1', monto: 10, categoria: 'X' }], gastos_total: 10 } };
const operativo = { id: 'o1', sucursal_id: '3B5', created_at: '2026-11-14T10:00:00Z', detalle: { tipo_cierre: 'cierre_operativo', gastos_ids: ['g2'], gastos: [{ id: 'g2', monto: 55 }] } };
const sinCorte = armarLibroCajaAbarrotes({
  cierres: [diario],
  todosCierres: [diario, operativo],
  gastosAprobados: [
    { id: 'g1', monto: 10, categoria: 'X', created_at: '2026-11-13T18:00:00Z', sucursal_id: '3B5', cerrado: true },
    { id: 'g2', monto: 55, categoria: 'EMPLEADO', created_at: '2026-11-14T15:00:00Z', sucursal_id: '3B5', cerrado: true },
    { id: 'g3', monto: 5, categoria: 'EMPLEADO', created_at: '2026-11-14T16:00:00Z', sucursal_id: '3B5' },
    { id: 'g0', monto: 99, categoria: 'VIEJO', created_at: '2026-11-10T16:00:00Z', sucursal_id: '3B5', cerrado: true },
  ],
  desde: '2026-11-07',
});
assert.deepEqual(sinCorte.enCurso.map((g) => g.id).sort(), ['ec-g2', 'ec-g3']);
console.log('libroPctTarjeta (gastos sin corte) OK');
