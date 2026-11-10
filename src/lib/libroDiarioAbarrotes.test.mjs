import assert from 'node:assert/strict';
import {
  construirLibroDiario,
  semanaDeFecha,
  desplazarSemana,
  etiquetaSemana,
  nombreDia,
  dinero,
  htmlLibroDiarioImprimible,
} from './libroDiarioAbarrotes.js';

// Semana sáb–vie
assert.deepEqual(semanaDeFecha('2026-11-08'), { inicio: '2026-11-07', fin: '2026-11-13' });
assert.deepEqual(semanaDeFecha('2026-11-07'), { inicio: '2026-11-07', fin: '2026-11-13' });
assert.deepEqual(semanaDeFecha('2026-11-13'), { inicio: '2026-11-07', fin: '2026-11-13' });
assert.deepEqual(desplazarSemana('2026-11-07', -1), { inicio: '2026-10-31', fin: '2026-11-06' });
assert.deepEqual(desplazarSemana('2026-11-07', 1), { inicio: '2026-11-14', fin: '2026-11-20' });
assert.equal(nombreDia('2026-11-07'), 'Sábado');
assert.equal(nombreDia('2026-11-13'), 'Viernes');
assert.equal(etiquetaSemana('2026-10-31', '2026-11-06'), 'Sábado 31 oct al viernes 6 nov de 2026');
assert.equal(dinero(1234.5), '$1,234.50');
assert.equal(dinero(-20), '−$20.00');

const libro = construirLibroDiario({
  desde: '2026-10-31',
  hasta: '2026-11-06',
  ingresos: [
    { id: 'v1', fecha: '2026-10-31', monto: 1000, tipo_mov: 'venta_cierre', folio: 'AB-001', turno: 'Turno diurno', empleado: 'Ana', created_at: '2026-10-31T20:00:00Z' },
    { id: 'v2', fecha: '2026-10-31', monto: 500, tipo_mov: 'venta_cierre', folio: 'AB-002', created_at: '2026-10-31T23:00:00Z' },
    { id: 'v3', fecha: '2026-11-02', monto: 700, tipo_mov: 'venta_cierre', folio: 'AB-003' },
    { id: 'm1', fecha: '2026-11-02', monto: 50, tipo_mov: 'manual', comentario: 'Ingreso extra' },
    { id: 'cxc1', fecha: '2026-10-31', monto: 300, tipo_mov: 'cobro_credito', folio: 'VM-01', comentario: 'Cobro de crédito · VM-01', empleado: 'AMR' },
    { id: 'x', fecha: '2026-11-09', monto: 99, tipo_mov: 'venta_cierre' },
    { id: 'cero', fecha: '2026-11-03', monto: 0, tipo_mov: 'venta_cierre' },
  ],
  gastos: [
    { id: 'cr1', fecha: '2026-10-31', monto: 400, categoria: 'CREDITO', comentario: 'CREDITO COBRADO · VM-01 · AMR' },
    { id: 'g1', fecha: '2026-10-31', monto: 200, categoria: 'Empleado', subcategoria: 'Consumo', comentario: 'Refresco' },
    { id: 'g2', fecha: '2026-11-02', monto: 900, categoria: 'Proveedores', subcategoria: 'Bimbo' },
    { id: 'g3', fecha: '2026-11-02', monto: 100, categoria: 'Empleado' },
    { id: 'fuera', fecha: '2026-11-20', monto: 10, categoria: 'Otros' },
  ],
});

assert.equal(libro.dias.length, 7);
assert.equal(libro.dias[0].nombre, 'Sábado');
assert.equal(libro.dias[6].nombre, 'Viernes');
const d0 = libro.dias[0];
assert.equal(d0.totalVentas, 1500);
assert.equal(d0.totalOtrosIngresos, 0); // el cobro de crédito NO es ingreso
assert.equal(d0.totalGastos, 600); // 200 consumo + 400 crédito (egreso)
assert.equal(d0.resultado, 900);
assert.equal(d0.acumulado, 900);
assert.equal(d0.ventas[0].folio, 'AB-001');
assert.match(d0.ventas[0].concepto, /AB-001 · Turno diurno/);
assert.equal(d0.otrosIngresos.length, 0);
assert.ok(d0.gastos.some((x) => x.categoria === 'CREDITO'));
const d2 = libro.dias[2]; // 2 nov
assert.equal(d2.totalIngresos, 750);
assert.equal(d2.totalGastos, 1000);
assert.equal(d2.resultado, -250);
assert.equal(d2.acumulado, 650); // 900 (sáb) - 250 (lun)
assert.equal(d2.gastos[0].categoria, 'Proveedores'); // más grande primero
assert.equal(libro.dias[1].sinMovimiento, true);
assert.equal(libro.totales.ventas, 2200);
assert.equal(libro.totales.otrosIngresos, 50);
assert.equal(libro.totales.ingresos, 2250);
assert.equal(libro.totales.gastos, 1600);
assert.equal(libro.totales.resultado, 650);
assert.equal(libro.totales.diasConMovimiento, 2);
assert.equal(libro.gastosPorCategoria[0].categoria, 'Proveedores');
assert.equal(libro.gastosPorCategoria[0].total, 900);
assert.equal(libro.gastosPorCategoria[0].pctGastos, 56.25);
assert.equal(libro.gastosPorCategoria[1].total, 400);
assert.equal(libro.mejorDia.fecha, '2026-10-31');
assert.equal(libro.diaMasGasto.fecha, '2026-11-02');
assert.equal(libro.fueraDeSemana.ingresos, 1);
assert.equal(libro.fueraDeSemana.gastos, 1);

const vacio = construirLibroDiario({ desde: '2026-11-07', hasta: '2026-11-13' });
assert.equal(vacio.totales.resultado, 0);
assert.equal(vacio.mejorDia, null);
assert.equal(vacio.dias.every((d) => d.sinMovimiento), true);

const html = htmlLibroDiarioImprimible(libro, { tienda: '<3B5>', semana: 'x' });
assert.ok(html.includes('&lt;3B5&gt;'));
assert.ok(html.includes('Resultado de la semana'));
console.log('libroDiarioAbarrotes.test.mjs OK');
