import assert from 'node:assert/strict';
import { fusionarLineasNomina, debeConservarDiasManual, recalcularLineaNomina } from './nominaCalculos.js';
import { calcularDiasDesdeAsistencias } from './nominaAsistencias.js';

// Caso de la captura: asist 6 · ret 5 → el checador paga 5 días, no 1.
const empleado = { id: 'u1', nombre: 'Angel', turno_id: 'mat' };
const turnos = [{ id: 'mat', hora_inicio: '08:00', hora_fin: '16:00' }];
const entradas = [
  { fecha: '2026-09-26', created_at: '2026-09-26T14:10:00.000Z' }, // tarde
  { fecha: '2026-09-27', created_at: '2026-09-27T14:20:00.000Z' },
  { fecha: '2026-09-28', created_at: '2026-09-28T14:15:00.000Z' },
  { fecha: '2026-09-29', created_at: '2026-09-29T14:30:00.000Z' },
  { fecha: '2026-09-30', created_at: '2026-09-30T14:05:00.000Z' },
  { fecha: '2026-10-01', created_at: '2026-10-01T13:00:00.000Z' }, // a tiempo (UTC ~08 local approx — use local hours)
];

// Usar horas locales explícitas para el test de retardo
const entradasLocal = [
  { fecha: '2026-09-26', created_at: new Date(2026, 8, 26, 8, 20).toISOString() }, // retardo
  { fecha: '2026-09-27', created_at: new Date(2026, 8, 27, 8, 20).toISOString() },
  { fecha: '2026-09-28', created_at: new Date(2026, 8, 28, 8, 20).toISOString() },
  { fecha: '2026-09-29', created_at: new Date(2026, 8, 29, 8, 20).toISOString() },
  { fecha: '2026-09-30', created_at: new Date(2026, 8, 30, 8, 20).toISOString() }, // 5º retardo: no cuenta
  { fecha: '2026-10-01', created_at: new Date(2026, 9, 1, 7, 55).toISOString() }, // a tiempo
];
const calc = calcularDiasDesdeAsistencias(empleado, entradasLocal, { turnos });
assert.equal(calc.asistencias, 6);
assert.equal(calc.retardos, 5);
assert.equal(calc.diasTrabajados, 5, '4 retardos pagan + 1 a tiempo = 5');

// Bug: dias_manual=1 congelado + asist refresca a 6
const ant = {
  usuario_id: 'u1',
  dias_manual: true,
  dias_trabajados: 1,
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
  asistencias_periodo: 6,
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
assert.equal(fusion[0].dias_trabajados, 5, 'checador manda sobre dias_manual obsoleto');
assert.equal(fusion[0].asistencias_periodo, 6);
assert.equal(fusion[0].retardos_periodo, 5);
assert.equal(fusion[0].dias_manual, false);
assert.equal(recalcularLineaNomina(fusion[0]).sueldo_base, 2000);

// Medio día: misma base checador → se conserva
const antMedio = {
  ...ant,
  dias_trabajados: 5.5,
  asistencias_periodo: 6,
  retardos_periodo: 5,
};
assert.equal(debeConservarDiasManual(antMedio, nueva), true);
const fusionMedio = fusionarLineasNomina([antMedio], [nueva]);
assert.equal(fusionMedio[0].dias_trabajados, 5.5);
assert.equal(fusionMedio[0].dias_manual, true);

// Override absurdo con misma base (días=1, asist=6): NO conservar
const antAbsurdo = {
  ...ant,
  dias_trabajados: 1,
  asistencias_periodo: 6,
  retardos_periodo: 5,
};
assert.equal(debeConservarDiasManual(antAbsurdo, nueva), false);
const fusionAbsurdo = fusionarLineasNomina([antAbsurdo], [nueva]);
assert.equal(fusionAbsurdo[0].dias_trabajados, 5);

console.log('nomina.diasChecador.test.mjs ok');
