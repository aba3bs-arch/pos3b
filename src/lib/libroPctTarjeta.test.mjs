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
