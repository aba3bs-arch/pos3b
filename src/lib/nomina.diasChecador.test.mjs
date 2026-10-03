import assert from 'node:assert/strict';
import { fusionarLineasNomina, debeConservarDiasManual, recalcularLineaNomina } from './nominaCalculos.js';
import { calcularDiasDesdeAsistencias } from './nominaAsistencias.js';

const empleado = { id: 'u1', nombre: 'Frania', turno_id: 'mat' };
const turnos = [{ id: 'mat', hora_inicio: '08:00', hora_fin: '16:00' }];

/**
 * Caso Frania (checador vs nómina):
 * - 5 jornadas cerradas: 26,28,29,30/9 y 1/10
 * - 1 día solo ENTRADA (vie 2/10) → falta en checador, no cuenta
 * - Todas las entradas tarde → retardos informativos, NO restan días
 * → días pagados = 5 (igual que el resumen del checador)
 */
function marcaje(ymd, h, min, tipo) {
  const [y, m, d] = ymd.split('-').map(Number);
  return {
    tipo,
    fecha: ymd,
    created_at: new Date(y, m - 1, d, h, min, 0).toISOString(),
  };
}

const marcajesFrania = [
  marcaje('2026-09-26', 8, 20, 'ENTRADA'),
  marcaje('2026-09-26', 16, 5, 'SALIDA'),
  marcaje('2026-09-28', 8, 25, 'ENTRADA'),
  marcaje('2026-09-28', 16, 0, 'SALIDA'),
  marcaje('2026-09-29', 8, 30, 'ENTRADA'),
  marcaje('2026-09-29', 16, 2, 'SALIDA'),
  marcaje('2026-09-30', 8, 15, 'ENTRADA'),
  marcaje('2026-09-30', 16, 1, 'SALIDA'),
  marcaje('2026-10-01', 8, 40, 'ENTRADA'),
  marcaje('2026-10-01', 16, 0, 'SALIDA'),
  // Solo entrada el viernes → no es jornada cerrada (falta en checador)
  marcaje('2026-10-02', 8, 50, 'ENTRADA'),
];

const calc = calcularDiasDesdeAsistencias(empleado, marcajesFrania, {
  turnos,
  desde: '2026-09-26',
  hasta: '2026-10-02',
});
assert.equal(calc.diasTrabajados, 5, 'Frania: 5 jornadas cerradas = checador');
assert.equal(calc.asistencias, 5);
assert.equal(calc.retardos, 5, 'retardos informativos en las 5 jornadas');
assert.deepEqual(calc.diasYmd, [
  '2026-09-26',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
]);

// Solo entradas sin salidas → 0 días (no inventar días por ENTRADA suelta)
const soloEntradas = [
  marcaje('2026-09-26', 8, 0, 'ENTRADA'),
  marcaje('2026-09-27', 8, 0, 'ENTRADA'),
];
const cero = calcularDiasDesdeAsistencias(empleado, soloEntradas, {
  turnos,
  desde: '2026-09-26',
  hasta: '2026-10-02',
});
assert.equal(cero.diasTrabajados, 0);

// Fusion: dias_manual obsoleto cede al checador
const ant = {
  usuario_id: 'u1',
  dias_manual: true,
  dias_trabajados: 4,
  salario_dia: 400,
  asistencias_periodo: undefined,
  retardos_periodo: undefined,
  bonificacion: 0,
  deduccion_gastos: 0,
  deduccion_inventario: 0,
  deduccion_prestamos: 0,
  deducciones: 0,
  deduccion_faltas: 0,
  deduccion_arrastre: 0,
};
const nueva = {
  usuario_id: 'u1',
  dias_trabajados: 5,
  salario_dia: 400,
  asistencias_periodo: 5,
  retardos_periodo: 5,
  dias_manual: false,
  bonificacion: 0,
  deduccion_gastos: 0,
  deduccion_inventario: 0,
  deduccion_prestamos: 0,
  deducciones: 0,
  deduccion_faltas: 0,
  deduccion_arrastre: 0,
};
assert.equal(debeConservarDiasManual(ant, nueva), false);
const fusion = fusionarLineasNomina([ant], [nueva]);
assert.equal(fusion[0].dias_trabajados, 5);
assert.equal(recalcularLineaNomina(fusion[0]).sueldo_base, 2000);

// Medio día fino se conserva
const antMedio = { ...ant, dias_trabajados: 5.5, asistencias_periodo: 5, retardos_periodo: 5 };
assert.equal(debeConservarDiasManual(antMedio, nueva), true);
assert.equal(fusionarLineasNomina([antMedio], [nueva])[0].dias_trabajados, 5.5);

console.log('nomina.diasChecador.test.mjs ok');
