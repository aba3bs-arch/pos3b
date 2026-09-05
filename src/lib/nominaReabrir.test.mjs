import assert from 'node:assert/strict';
import { fusionarLineasNomina } from './nominaCalculos.js';
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
assert.equal(reabiertas[0].dias_manual, true);
assert.equal(reabiertas[0].gastos_manual, true);
assert.equal(reabiertas[0].inventario_manual, true);
assert.equal(reabiertas[0].prestamos_manual, true);
assert.equal(reabiertas[0].otros_manual, true);
assert.equal(reabiertas[0].notas_otros, 'uniforme');
assert.equal(reabiertas[0].dias_trabajados, 6);
assert.equal(reabiertas[0].deduccion_gastos, 100);

const desdeChecador = [
  {
    usuario_id: 'u1',
    salario_dia: 400,
    dias_trabajados: 5,
    pagador_nomina: 'virtual',
    deduccion_gastos: 999,
    deduccion_inventario: 0,
    deduccion_prestamos: 0,
    deducciones: 0,
  },
];
const fusion = fusionarLineasNomina(reabiertas, desdeChecador);
assert.equal(fusion[0].dias_trabajados, 6, 'la edición conserva días de la nómina cerrada');
assert.equal(fusion[0].pagador_nomina, 'abarrotes');
assert.equal(fusion[0].deduccion_gastos, 100);
assert.equal(fusion[0].deduccion_inventario, 20);
assert.equal(fusion[0].deduccion_prestamos, 30);
assert.equal(fusion[0].deducciones, 50);

console.log('nominaReabrir.test.mjs ok');
