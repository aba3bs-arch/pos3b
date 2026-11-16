import assert from 'node:assert/strict';
import {
  esCierreGeneralAbarrotes,
  gastosListaDesdeUltimaRecoleccion,
  gastosPeriodoDesdeUltimaRecoleccion,
} from './calc.js';
import {
  cajaAnteriorDesdeFilasCierre,
  filtrarHistorialCajero,
  idsGastosYaCerradosEnCierres,
  patchCierreHistorial,
} from './store.js';

const cga = {
  id: 'cga',
  folio: 'CGA-00002',
  turno: 'Corte general',
  created_at: '2026-11-15T06:59:59.000Z',
  caja_actual: 431,
  ventas: 2498,
  detalle: {
    tipo_cierre: 'cierre_diario',
    gastos_total: 900,
    gastos: [{ id: 'g-dia', monto: 900, categoria: 'EMPLEADO' }],
  },
};

const esthela = {
  id: 'ab221',
  folio: 'AB-221',
  turno: 'NOCTURNO',
  created_at: '2026-11-15T02:29:40.000Z',
  caja_actual: 1582,
  ventas: 1087,
  usuario_nombre: 'Esthela Quintero Galicia',
  detalle: {
    tipo_cierre: 'cierre_operativo',
    gastos_total: 100,
    gastos: [{ id: 'g1', monto: 100, categoria: 'OTROS' }],
    comentarios: '',
  },
};

const angel = {
  id: 'ab222',
  folio: 'AB-222',
  turno: 'DIURNO',
  created_at: '2026-11-15T15:56:51.000Z',
  caja_actual: 2808,
  ventas: 1355,
  detalle: { tipo_cierre: 'cierre_operativo', gastos_total: 50, gastos: [] },
};

assert.equal(esCierreGeneralAbarrotes(cga), true);
assert.equal(esCierreGeneralAbarrotes(esthela), false);
assert.equal(esCierreGeneralAbarrotes({ folio: 'CGA-00001', detalle: {} }), true);

assert.deepEqual(
  filtrarHistorialCajero('abarrotes', [angel, cga, esthela]).map((h) => h.folio),
  ['AB-222', 'AB-221'],
);
assert.equal(filtrarHistorialCajero('virtual', [cga]).length, 1);

// Si el corte general es el más reciente, la caja del siguiente turno sigue siendo la del cajero.
assert.equal(cajaAnteriorDesdeFilasCierre([cga, esthela]), 1582);
assert.equal(cajaAnteriorDesdeFilasCierre([angel, cga, esthela]), 2808);

// Los gastos del día ya van en los cierres del cajero; el CGA no se suma otra vez.
assert.equal(gastosPeriodoDesdeUltimaRecoleccion([angel, cga, esthela], 0), 150);
const ids = gastosListaDesdeUltimaRecoleccion([cga, esthela], []).map((g) => g.id);
assert.deepEqual(ids, ['g1']);

// El corte general copia los gastos de todo el día: no debe cerrarle al cajero
// los que todavía están en su corte abierto (solo los que ya pasaron por un cierre suyo).
const cerrados = idsGastosYaCerradosEnCierres('abarrotes', [cga, esthela]);
assert.equal(cerrados.has('g-dia'), false);
assert.equal(cerrados.has('g1'), true);
assert.equal(
  idsGastosYaCerradosEnCierres('abarrotes', [{ folio: 'CGA-00003', detalle: { gastos: [{ id: 'g-noche' }] } }]).size,
  0,
);
// Garage sigue igual: solo la recolección definitiva cierra gastos.
assert.deepEqual(
  [...idsGastosYaCerradosEnCierres('garage', [
    { detalle: { tipo_cierre: 'cierre', gastos: [{ id: 'a' }] } },
    { detalle: { tipo_cierre: 'recoleccion', gastos: [{ id: 'b' }] } },
  ])],
  ['b'],
);

const built = patchCierreHistorial(esthela, {
  caja_actual: 1582,
  ajuste_nomina: 400,
  comentarios: 'Nómina de Esthela',
});
assert.equal(built.update.caja_actual, 1182);
assert.equal(built.update.detalle.ajuste_nomina_monto, 400);
assert.equal(built.update.detalle.ajuste_nomina_sin_arrastre, true);
assert.match(built.update.detalle.comentarios, /Nómina de Esthela/);
assert.match(built.update.detalle.comentarios, /No cambia la caja del cierre siguiente/);
assert.equal(esthela.caja_actual, 1582);
assert.equal(angel.caja_actual, 2808);

const rechazado = patchCierreHistorial(cga, { ajuste_nomina: 10, caja_actual: 431 });
assert.match(rechazado.error, /corte general/i);

console.log('cierreGeneralNoAfecta.ok');
