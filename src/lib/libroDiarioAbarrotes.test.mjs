import assert from 'node:assert/strict';
import {
  construirLibroDiario,
  semanaDeFecha,
  desplazarSemana,
  etiquetaSemana,
  nombreDia,
  dinero,
  htmlLibroDiarioImprimible,
  resumenLibroPorTienda,
  periodoLibro,
  trocearPeriodo,
  fusionarDatosLibro,
  resumenPorMes,
  resumenPorSemana,
  nombreMes,
  diasEntre,
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
  cortes: [
    { id: 'c1', folio: 'AB-001', fecha: '2026-10-31', cajaAnterior: 0, ventaEfectivo: 1000, cajaActual: 400, gastos: [
      { id: 'cr1', monto: 400, categoria: 'CREDITO', comentario: 'CREDITO COBRADO · VM-01 · AMR' },
      { id: 'g1', monto: 200, categoria: 'Empleado', subcategoria: 'Consumo', comentario: 'Refresco' },
    ] },
    { id: 'c3', folio: 'AB-003', fecha: '2026-11-02', cajaAnterior: 400, ventaEfectivo: 700, cajaActual: 0, gastos: [
      { id: 'g2', monto: 900, categoria: 'Proveedores', subcategoria: 'Bimbo' },
      { id: 'g3', monto: 100, categoria: 'Empleado' },
    ] },
    { id: 'cf', folio: 'AB-099', fecha: '2026-11-20', gastos: [{ id: 'fuera', monto: 10, categoria: 'Otros' }] },
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
assert.equal(d0.cortes.length, 1);
assert.equal(d0.cortes[0].cuadra, true); // 0 + 1000 − 600 = 400

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
assert.ok(html.includes('Resultado del periodo'));
// Caso AB-210 (3B5, jueves 12 nov): el libro debe cerrar igual que el ticket.
const ab210 = construirLibroDiario({
  desde: '2026-11-07',
  hasta: '2026-11-13',
  ingresos: [
    { id: 'v210', fecha: '2026-11-12', monto: 1497, tipo_mov: 'venta_cierre', folio: 'AB-210' },
  ],
  cortes: [
    { id: 'c210', folio: 'AB-210', fecha: '2026-11-12', turno: 'Turno diurno', cajero: 'Mayra', cajaAnterior: -959, ventaEfectivo: 1497, cajaActual: 238,
      gastos: [{ id: 'cg-1', monto: 300, categoria: 'CUBRE TURNO' }] },
  ],
  enCurso: [
    { id: 'ec-1', fecha: '2026-11-12', monto: 1436, categoria: 'manual', subcategoria: 'manual-otros' },
    { id: 'ec-2', fecha: '2026-11-12', monto: 1011, categoria: 'manual', subcategoria: 'manual-otros' },
    { id: 'ec-3', fecha: '2026-11-12', monto: 150, categoria: 'manual', subcategoria: 'manual-otros' },
    { id: 'ec-4', fecha: '2026-11-12', monto: 50, categoria: 'manual', subcategoria: 'manual-otros' },
  ],
  otros: [{ id: 'o1', fecha: '2026-11-12', monto: 25, categoria: 'Vales' }],
});
const j = ab210.dias.find((d) => d.fecha === '2026-11-12');
assert.equal(j.totalGastos, 300);
assert.equal(j.resultado, 1197); // = subtotal del ticket
assert.equal(j.totalEnCurso, 2647);
assert.equal(j.totalOtrosEgresos, 25);
assert.equal(j.cortes[0].cuadra, true);
assert.equal(j.cortes[0].cajaActual, 238);
assert.equal(ab210.totales.resultado, 1197);
assert.equal(ab210.totales.enCurso, 2647);
assert.equal(ab210.totales.otrosEgresos, 25);
assert.equal(ab210.dias.find((d) => d.fecha === '2026-11-12').sinMovimiento, false);

const resumen = resumenLibroPorTienda({
  ingresos: [{ tienda: '3B5', monto: 1497, tipo_mov: 'venta_cierre' }, { tienda: '3B5', monto: 99, tipo_mov: 'cobro_credito' }],
  cortes: [{ tienda: '3B5', gastos: [{ monto: 300 }] }],
  enCurso: [{ tienda: '3B5', monto: 2647 }],
}, ['3B5', '3B6']);
assert.equal(resumen.find((f) => f.id === '3B5').resultado, 1197);
assert.equal(resumen.find((f) => f.id === '3B5').enCurso, 2647);
assert.equal(resumen.find((f) => f.id === '3B6').resultado, 0);

const conTarjeta = construirLibroDiario({
  desde: '2026-11-07',
  hasta: '2026-11-13',
  cortes: [
    { id: 'a', folio: 'AB-1', fecha: '2026-11-12', cajaAnterior: 0, ventaEfectivo: 100, cajaActual: 100, tarjeta: 500, pctAba: 300, pctVirtual: 200, gastos: [] },
    { id: 'b', folio: 'AB-2', fecha: '2026-11-12', cajaAnterior: 100, ventaEfectivo: 50, cajaActual: 150, tarjeta: 100, pctAba: 0, pctVirtual: 100, gastos: [] },
  ],
});
const dj = conTarjeta.dias.find((d) => d.fecha === '2026-11-12');
assert.equal(dj.pctAba, 300);
assert.equal(dj.pctVirtual, 300);
assert.equal(conTarjeta.totales.pctAba, 300);
assert.equal(conTarjeta.totales.pctVirtual, 300);
assert.equal(conTarjeta.totales.resultado, 0); // la tarjeta no mueve el efectivo
assert.ok(htmlLibroDiarioImprimible(conTarjeta, {}).includes('PCT VIRTUAL'));
const resTar = resumenLibroPorTienda({ cortes: [
  { tienda: '3B5', pctAba: 300, pctVirtual: 200, gastos: [] },
  { tienda: '3B5', pctAba: 0, pctVirtual: 100, gastos: [] },
] }, ['3B5']);
assert.equal(resTar[0].pctAba, 300);
assert.equal(resTar[0].pctVirtual, 300);

// Periodos: semana, mes, año y rango
const pSem = periodoLibro({ modo: 'semana', semana: { inicio: '2026-11-07', fin: '2026-11-13' } });
assert.deepEqual([pSem.desde, pSem.hasta, pSem.dias], ['2026-11-07', '2026-11-13', 7]);
const pMes = periodoLibro({ modo: 'mes', mes: { anio: 2026, mes: 11 } });
assert.deepEqual([pMes.desde, pMes.hasta, pMes.dias], ['2026-11-01', '2026-11-30', 30]);
assert.equal(pMes.etiqueta, 'Noviembre 2026');
const pFeb = periodoLibro({ modo: 'mes', mes: { anio: 2028, mes: 2 } });
assert.equal(pFeb.hasta, '2028-02-29');
// Noviembre 2026 empieza domingo (1 nov) → sábado anterior 31 oct; el 30 nov es lunes → viernes 4 dic
const pMesExt = periodoLibro({ modo: 'mes', mes: { anio: 2026, mes: 11 }, extender: true });
assert.deepEqual([pMesExt.desde, pMesExt.hasta], ['2026-10-31', '2026-12-04']);
assert.equal(nombreDia(pMesExt.desde), 'Sábado');
assert.equal(nombreDia(pMesExt.hasta), 'Viernes');
const pAnio = periodoLibro({ modo: 'anio', anio: 2026 });
assert.deepEqual([pAnio.desde, pAnio.hasta, pAnio.dias], ['2026-01-01', '2026-12-31', 365]);
const pRango = periodoLibro({ modo: 'rango', desde: '2026-11-20', hasta: '2026-11-03' });
assert.deepEqual([pRango.desde, pRango.hasta], ['2026-11-03', '2026-11-20']);
const pRangoExt = periodoLibro({ modo: 'rango', desde: '2026-11-03', hasta: '2026-11-20', extender: true });
assert.deepEqual([pRangoExt.desde, pRangoExt.hasta], ['2026-10-31', '2026-11-20']);
const pLargo = periodoLibro({ modo: 'rango', desde: '2020-01-01', hasta: '2026-01-01' });
assert.equal(pLargo.recortado, true);
assert.equal(pLargo.dias, 400);

const tramos = trocearPeriodo('2026-01-01', '2026-12-31', 31);
assert.equal(tramos[0].desde, '2026-01-01');
assert.equal(tramos[0].hasta, '2026-01-31');
assert.equal(tramos[tramos.length - 1].hasta, '2026-12-31');
assert.equal(tramos.reduce((s, t) => s + diasEntre(t.desde, t.hasta), 0), 365);
assert.equal(trocearPeriodo('2026-11-07', '2026-11-13').length, 1);

const fus = fusionarDatosLibro([
  { ingresosPorDia: [{ id: 'a' }], cortesLibro: [{ id: 'c1' }] },
  { ingresosPorDia: [{ id: 'a' }, { id: 'b' }], cortesLibro: [{ id: 'c2' }], gastosEnCurso: [{ id: 'e' }] },
]);
assert.equal(fus.ingresosPorDia.length, 2);
assert.equal(fus.cortesLibro.length, 2);
assert.equal(fus.gastosEnCurso.length, 1);

// Libro de un año completo: resumen por mes y por semana
const anio = construirLibroDiario({
  desde: '2026-01-01',
  hasta: '2026-12-31',
  ingresos: [
    { id: 'i1', fecha: '2026-01-15', monto: 100, tipo_mov: 'venta_cierre' },
    { id: 'i2', fecha: '2026-11-12', monto: 300, tipo_mov: 'venta_cierre' },
  ],
  cortes: [{ id: 'k', folio: 'AB-1', fecha: '2026-11-12', cajaAnterior: 0, ventaEfectivo: 300, cajaActual: 250, gastos: [{ id: 'g', monto: 50, categoria: 'X' }] }],
});
assert.equal(anio.dias.length, 365);
assert.equal(anio.totales.ingresos, 400);
assert.equal(anio.totales.resultado, 350);
const meses = resumenPorMes(anio.dias);
assert.equal(meses.length, 12);
assert.equal(meses[0].ventas, 100);
assert.equal(meses[10].etiqueta, 'Noviembre 2026');
assert.equal(meses[10].resultado, 250);
const semanas = resumenPorSemana(anio.dias.filter((d) => d.fecha >= '2026-11-07' && d.fecha <= '2026-11-20'));
assert.equal(semanas.length, 2);
assert.equal(semanas[0].inicio, '2026-11-07');
assert.equal(semanas[0].resultado, 250);

console.log('libroDiarioAbarrotes.test.mjs OK');
