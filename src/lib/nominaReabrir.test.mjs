import assert from 'node:assert/strict';
import { fusionarLineasNomina, debeConservarDeduccionManual } from './nominaCalculos.js';
import { esPeriodoNominaMasReciente, periodoNominaMasReciente } from './nomina.js';
import { lineasReabiertasParaEdicion } from './nominaReabrir.js';

const periodos = [
  { id: 'vieja', periodo_fin: '2026-08-28', created_at: '2026-08-29T10:00:00Z' },
  { id: 'empate-vieja', periodo_fin: '2026-09-04', created_at: '2026-09-04T08:00:00Z' },
  { id: 'ultima', periodo_fin: '2026-09-04', created_at: '2026-09-05T12:00:00Z' },
];

const ultima = periodoNominaMasReciente(periodos);
assert.equal(ultima?.id, 'ultima');
assert.equal(esPeriodoNominaMasReciente(periodos, 'ultima'), true);
assert.equal(esPeriodoNominaMasReciente(periodos, 'empate-vieja'), false);
assert.equal(esPeriodoNominaMasReciente([], 'ultima'), false);
assert.equal(periodoNominaMasReciente([]), null);

const reabiertas = lineasReabiertasParaEdicion([
  {
    usuario_id: 'u1',
    nombre: 'Ana',
    sueldo_tarifa: 400,
    salario_dia: 400,
    dias_trabajados: 6,
    pagador_nomina: 'abarrotes',
    deduccion_gastos: 100,
    deduccion_inventario: 20,
    deduccion_prestamos: 30,
    deducciones: 50,
    notas: 'Otros: uniforme',
  },
]);

assert.equal(reabiertas.length, 1);
assert.equal(reabiertas[0].dias_manual, false, 'días se refrescan desde checador al recalcular');
assert.equal(reabiertas[0].gastos_manual, true);
assert.equal(reabiertas[0].inventario_manual, false, 'inventario no se congela al reabrir');
assert.equal(reabiertas[0].prestamos_manual, false, 'préstamos no se congelan al reabrir');
assert.equal(reabiertas[0].otros_manual, true);
assert.equal(reabiertas[0].notas_otros, 'uniforme');
assert.equal(reabiertas[0].dias_trabajados, 6);
assert.equal(reabiertas[0].deduccion_gastos, 100);

const desdeChecador = [
  {
    usuario_id: 'u1',
    salario_dia: 400,
    dias_trabajados: 5,
    asistencias_periodo: 6,
    retardos_periodo: 5,
    pagador_nomina: 'virtual',
    deduccion_gastos: 999,
    deduccion_inventario: 1000,
    cuota_inventario: 1000,
    faltante_inventario_tienda: 3000,
    deduccion_prestamos: 500,
    cuota_prestamos: 500,
    deducciones: 0,
    notas: 'Inventario 3B5: $3000.00 ÷ 3 = $1000.00 · Préstamos cuota $500.00 (3B5: $500.00)',
  },
];
const fusion = fusionarLineasNomina(reabiertas, desdeChecador);
assert.equal(fusion[0].dias_trabajados, 5, 'sin dias_manual, manda el checador');
assert.equal(fusion[0].asistencias_periodo, 6);
assert.equal(fusion[0].pagador_nomina, 'abarrotes');
assert.equal(fusion[0].deduccion_gastos, 100);
assert.equal(fusion[0].deduccion_inventario, 1000, 'inventario fresco (÷3) al reabrir sin flag manual');
assert.equal(fusion[0].cuota_inventario, 1000);
assert.equal(fusion[0].deduccion_prestamos, 500, 'cuota préstamo fresca al reabrir');
assert.equal(fusion[0].deducciones, 50);

// Borrador con flags manuales en $0 no debe tapar cuotas nuevas.
assert.equal(debeConservarDeduccionManual(0, 1000, true), false);
assert.equal(debeConservarDeduccionManual(200, 0, true), true);
assert.equal(debeConservarDeduccionManual(0, 500, false), false);

const fusionCeroManual = fusionarLineasNomina(
  [{
    usuario_id: 'u1',
    inventario_manual: true,
    prestamos_manual: true,
    deduccion_inventario: 0,
    deduccion_prestamos: 0,
    deduccion_gastos: 10,
    gastos_manual: true,
    salario_dia: 400,
    dias_trabajados: 6,
    notas: 'Inventario viejo · Préstamos viejo',
  }],
  [{
    usuario_id: 'u1',
    deduccion_inventario: 1166.67,
    cuota_inventario: 1166.67,
    faltante_inventario_tienda: 3500,
    deduccion_prestamos: 500,
    cuota_prestamos: 500,
    deduccion_gastos: 99,
    salario_dia: 400,
    dias_trabajados: 6,
    bonificacion: 0,
    deduccion_arrastre: 0,
    deducciones: 0,
    deduccion_faltas: 0,
    notas: 'Inventario 3B5: $3500.00 ÷ 3 = $1166.67 · Préstamos cuota $500.00 (3B5: $500.00)',
  }],
);
assert.equal(fusionCeroManual[0].deduccion_inventario, 1166.67);
assert.equal(fusionCeroManual[0].inventario_manual, false);
assert.equal(fusionCeroManual[0].deduccion_prestamos, 500);
assert.equal(fusionCeroManual[0].prestamos_manual, false);
assert.equal(fusionCeroManual[0].deduccion_gastos, 10);
assert.match(fusionCeroManual[0].notas || '', /Inventario 3B5/);
assert.match(fusionCeroManual[0].notas || '', /Préstamos cuota/);

console.log('nominaReabrir.test.mjs ok');
