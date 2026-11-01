import assert from 'node:assert/strict';
import {
  analizarNegativos,
  filasUltimosDias,
  ymdMenosDias,
  evaluarRecoleccion,
  maximoRecolectable,
  normalizarFilasCaja,
  perfilDiario,
  perfilFuertes,
  planRecoleccion,
  redondearRecoleccion,
  esGastoCobroCredito,
  recomendarColchon,
} from './analisisCajaAbarrotes.js';

let n = 0;
const cierre = (fecha, hora, { venta, tarjeta = 0, faltante = 0, gastos = [], cajaInicio, caja, turno = 'DIURNO' }) => ({
  id: `c${++n}`,
  turno,
  folio: `AB-${n}`,
  caja_actual: caja,
  ventas: venta,
  created_at: `${fecha}T${hora}:00Z`,
  detalle: {
    tipo_cierre: 'cierre',
    venta,
    tarjeta,
    faltante,
    caja_anterior: cajaInicio,
    gastos,
    gastos_total: gastos.reduce((a, g) => a + g.monto, 0),
    fecha_negocio: fecha,
  },
});
const rec = (fecha, hora, monto, cajaDespues, extra = {}) => ({
  id: `r${++n}`,
  turno: 'RECOLECCION',
  folio: `REC-${n}`,
  caja_actual: cajaDespues,
  created_at: `${fecha}T${hora}:00Z`,
  detalle: { tipo_cierre: 'recoleccion', recoleccion: monto, fecha_negocio: fecha, gastos: [{ categoria: 'PROVEEDORES', subcategoria: 'X', monto: 999 }], gastos_total: 999, ...extra },
});
const prov = (sub, monto) => ({ categoria: 'PROVEEDORES', subcategoria: sub, monto });

// Lunes 2026-10-19 … martes 2026-10-27
const rows = [
  cierre('2026-10-19', '20:00', { venta: 3000, gastos: [prov('Bimbo', 800)], cajaInicio: 2000, caja: 4200 }),
  rec('2026-10-19', '21:00', 4000, 200),
  // Martes: pago grande a proveedor tras recolección -> negativo
  cierre('2026-10-20', '20:00', { venta: 2500, tarjeta: 300, gastos: [prov('Sabritas', 2600), { categoria: 'LUZ', monto: 100 }], cajaInicio: 200, caja: -100 }),
  cierre('2026-10-21', '20:00', { venta: 2800, gastos: [prov('Bimbo', 500)], cajaInicio: 0, caja: 2300 }),
  cierre('2026-10-22', '20:00', { venta: 2600, gastos: [prov('Coca', 700)], cajaInicio: 2300, caja: 4200 }),
  cierre('2026-10-23', '20:00', { venta: 2700, gastos: [prov('Bimbo', 400)], cajaInicio: 4200, caja: 6500 }),
  cierre('2026-10-26', '20:00', { venta: 2900, gastos: [prov('Bimbo', 600)], cajaInicio: 6500, caja: 8800 }),
  { ...rec('2026-10-26', '21:00', 8500, 300, { bajo_colchon: true, colchon_recomendado: 3000 }) },
  cierre('2026-10-27', '20:00', { venta: 1500, gastos: [prov('Sabritas', 2000)], cajaInicio: 300, caja: -200 }),
  { ...cierre('2026-10-27', '22:00', { venta: 100, gastos: [], cajaInicio: 0, caja: -9999 }), deleted_at: '2026-10-28T00:00:00Z' },
];

const filas = normalizarFilasCaja(rows);
assert.equal(filas.length, 9);
assert.equal(filas[0].tipo, 'cierre');
assert.equal(filas.find((f) => f.tipo === 'recoleccion').monto, 4000);

const an = analizarNegativos(filas);
assert.equal(an.resumen.negativos, 2);
assert.equal(an.resumen.cierres, 7);
assert.equal(an.resumen.recolecciones, 2);
assert.equal(an.resumen.recSeguidasNegativo, 2);
assert.equal(an.resumen.recBajoColchon, 1);
assert.equal(an.resumen.peorCaja, -200);
const martes = an.eventos.find((e) => e.fecha === '2026-10-20');
assert.equal(martes.dia, 'Martes');
assert.equal(martes.faltaron, 100);
assert.ok(martes.causas.includes('proveedores'));
assert.ok(martes.causas.includes('gasto_mayor_venta'));
assert.ok(martes.causas.includes('recoleccion_previa'));
assert.equal(martes.recoleccionPrevia.monto, 4000);
assert.equal(martes.recoleccionPrevia.cajaDespues, 200);
assert.equal(martes.topGastos[0].nombre, 'Proveedor Sabritas');
assert.equal(an.resumen.porDia[2].eventos, 2);
assert.equal(an.resumen.gastosEnNegativos[0].nombre, 'Proveedor Sabritas');
assert.equal(an.resumen.gastosEnNegativos[0].monto, 4600);

// Sin recolecciones los gastos de filas RECOLECCION no cuentan
const perfil = perfilDiario(filas);
assert.equal(perfil.global.n, 7);
assert.equal(perfil.porDow[1].n, 2);
assert.equal(perfil.porDow[1].gastoProm, 700);

// Colchón: pocos datos => null
assert.equal(recomendarColchon(perfilDiario(filas.slice(0, 3)), { hoyYmd: '2026-10-27' }), null);
const col = recomendarColchon(perfil, { hoyYmd: '2026-10-27', dias: 2, margen: 0 });
assert.ok(col && col.colchon > 0);
assert.equal(col.detalle.length, 2);
assert.equal(col.detalle[0].dia, 'Miércoles');
const col3 = recomendarColchon(perfil, { hoyYmd: '2026-10-27', dias: 3, margen: 0.2 });
assert.ok(col3.colchon >= col.colchon);

assert.deepEqual(evaluarRecoleccion({ cajaDespues: -50, colchon: 1000 }), { nivel: 'negativo', faltante: 1050, sobrante: 0 });
assert.deepEqual(evaluarRecoleccion({ cajaDespues: 300, colchon: 1000 }), { nivel: 'bajo', faltante: 700, sobrante: 0 });
assert.deepEqual(evaluarRecoleccion({ cajaDespues: 1500, colchon: 1000 }), { nivel: 'ok', faltante: 0, sobrante: 500 });
assert.equal(evaluarRecoleccion({ cajaDespues: 10, colchon: null }).nivel, 'sin_datos');
assert.equal(maximoRecolectable({ cajaAntes: 5000, colchon: 1200 }), 3800);
assert.equal(maximoRecolectable({ cajaAntes: 500, colchon: 1200 }), 0);
assert.equal(maximoRecolectable({ cajaAntes: 500, colchon: null }), null);

// Ventana semanal: solo cuentan los últimos 7 días de negocio y se usa el global de la ventana.
assert.equal(ymdMenosDias('2026-10-27', 6), '2026-10-21');
assert.equal(ymdMenosDias('2026-03-01', 1), '2026-02-28');
const semana = filasUltimosDias(filas, '2026-10-27', 7);
assert.ok(semana.every((f) => f.fecha >= '2026-10-21'));
assert.equal(semana.filter((f) => f.tipo === 'cierre').length, 5);
const perfilSem = perfilDiario(semana);
assert.equal(perfilSem.global.n, 5);
const colSem = recomendarColchon(perfilSem, { hoyYmd: '2026-10-27', dias: 2, margen: 0, minDias: 3, ventana: 7 });
assert.ok(colSem && colSem.ventana === 7);
assert.equal(colSem.detalle[0].gasto, colSem.detalle[1].gasto);
assert.equal(recomendarColchon(perfilSem, { hoyYmd: '2026-10-27', minDias: 6 }), null);
const negSem = analizarNegativos(semana);
assert.equal(negSem.resumen.negativos, 1);

// Días fuertes: cobros de crédito del repartidor los jueves y domingos + nómina los sábados.
{
  const cred = (monto) => ({ categoria: 'CREDITO', subcategoria: 'COBRADO', monto });
  const nom = (monto) => ({ categoria: 'EMPLEADO', subcategoria: 'NOMINA EMPLEADO', monto });
  assert.equal(esGastoCobroCredito(cred(1)), true);
  assert.equal(esGastoCobroCredito(prov('X', 1)), false);
  const rowsF = [];
  // 2026-10-05 (lunes) a 2026-11-01 (domingo): 28 días.
  for (let i = 0; i < 28; i += 1) {
    const t = Date.UTC(2026, 9, 5) + i * 86400000;
    const f = new Date(t).toISOString().slice(0, 10);
    const dow = new Date(t).getUTCDay();
    const gastos = [prov('Bimbo', 500)];
    if (dow === 4) gastos.push(cred(3000));
    if (dow === 0) gastos.push(cred(2000));
    if (dow === 6) gastos.push(nom(4000));
    rowsF.push(cierre(f, '20:00', { venta: 3000, gastos, cajaInicio: 5000, caja: 5000 }));
  }
  const filasF = normalizarFilasCaja(rowsF);
  const pf = perfilFuertes(filasF);
  assert.equal(pf.porDow[4].credito, 3000);
  assert.equal(pf.porDow[0].credito, 2000);
  assert.equal(pf.porDow[6].nomina, 4000);
  assert.equal(pf.porDow[2].fuerte, false);
  const base = perfilDiario(filasUltimosDias(filasF, '2026-11-01', 7), { base: true });
  assert.equal(base.global.gastoProm, 500);

  // Hoy lunes 2 (martes 3, miércoles 4, jueves 5…): hasta el próximo día fuerte = jueves.
  const planLun = planRecoleccion({ perfilBase: base, perfilFuertes: pf, hoyYmd: '2026-11-02', dias: 0, margen: 0, minDias: 3 });
  assert.equal(planLun.proximoFuerte.dia, 'Jueves');
  assert.equal(planLun.hastaFuerte, true);
  assert.equal(planLun.dias, 3);
  assert.equal(planLun.totales.credito, 3000);
  // 3 días de gasto normal (1500) + 3000 del jueves − venta efectivo de mar y mié (6000).
  const necesidad = Math.max(500 - 0, 1000 - 3000, 1500 + 3000 - 6000, 0);
  assert.equal(planLun.colchon, Math.max(necesidad, 0));
  // Hoy es jueves y ya se registraron los 3000 de cobros: no se vuelve a reservar.
  const planJue = planRecoleccion({ perfilBase: base, perfilFuertes: pf, hoyYmd: '2026-11-05', dias: 0, margen: 0, minDias: 3, yaHoy: { credito: 3000 } });
  assert.equal(planJue.detalle[0].credito, 0);
  assert.equal(planJue.proximoFuerte.dia, 'Sábado');
  // Hoy es jueves y aún no se registran: se reservan completos.
  const planJue2 = planRecoleccion({ perfilBase: base, perfilFuertes: pf, hoyYmd: '2026-11-05', dias: 1, margen: 0, minDias: 3 });
  assert.equal(planJue2.detalle[0].credito, 3000);
  assert.ok(planJue2.colchon >= 3000);
  // Nómina capturada a mano reemplaza la del historial.
  const planNom = planRecoleccion({ perfilBase: base, perfilFuertes: pf, hoyYmd: '2026-11-05', dias: 2, margen: 0, minDias: 3, nominaManual: 7000, yaHoy: { credito: 3000 } });
  assert.equal(planNom.totales.nomina, 7000);
  // Sin historial de días fuertes: cubre 2 días.
  const planSin = planRecoleccion({ perfilBase: base, perfilFuertes: perfilFuertes([]), hoyYmd: '2026-11-02', dias: 0, margen: 0, minDias: 3 });
  assert.equal(planSin.proximoFuerte, null);
  assert.equal(planSin.dias, 2);
  assert.equal(redondearRecoleccion(3456), 3400);
  assert.equal(redondearRecoleccion(87), 80);
  assert.equal(redondearRecoleccion(-5), 0);
}
console.log('analisisCajaAbarrotes: ok');

