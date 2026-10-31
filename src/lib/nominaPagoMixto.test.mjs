import assert from 'node:assert/strict';
import {
  repartoPagoPorCuenta,
  montoVirtualLinea,
  etiquetaPagoMixto,
  esPagoMixto,
  partesPagoLinea,
  sumarPagosPorCuenta,
  filasDesgloseCuentas,
} from './nominaPagoMixto.js';

assert.deepEqual(repartoPagoPorCuenta({ pagador_nomina: 'virtual' }, 500, 'virtual'), [{ cuenta: 'virtual', monto: 500, sufijoRef: '' }]);
assert.deepEqual(repartoPagoPorCuenta({ pagador_nomina: 'ambos' }, 500, 'abarrotes'), [{ cuenta: 'abarrotes', monto: 500, sufijoRef: '' }]);

// Luz: Virtual $200/día × 5 = $1,000. Abarrotes (sueldo) $1,500. Pago $2,500.
const luz = { pagador_nomina: 'ambos', pago_virtual: '200', dias_trabajados: 5 };
assert.equal(montoVirtualLinea(luz), 1000);
assert.deepEqual(repartoPagoPorCuenta(luz, 2500), [
  { cuenta: 'virtual', monto: 1000, sufijoRef: ':virtual' },
  { cuenta: 'abarrotes', monto: 1500, sufijoRef: '' },
]);
assert.equal(montoVirtualLinea({ pagador_nomina: 'ambos', pago_virtual: 200 }), 0);
assert.deepEqual(
  repartoPagoPorCuenta({ pagador_nomina: 'ambos', pago_virtual: 9999, dias_trabajados: 1 }, 3000),
  [{ cuenta: 'virtual', monto: 3000, sufijoRef: ':virtual' }],
);
assert.equal(montoVirtualLinea({ pagador_nomina: 'abarrotes', pago_virtual: 500, dias_trabajados: 5 }), 0);
assert.equal(esPagoMixto({ pagador_nomina: 'Ambos' }), true);
assert.equal(etiquetaPagoMixto(luz, 2500), 'Virtual $1000.00 + Abarrotes $1500.00 = $2500.00');
assert.equal(etiquetaPagoMixto({ pagador_nomina: 'ambos', pago_virtual: 200, dias_trabajados: 5 }, 0), '');
assert.deepEqual(repartoPagoPorCuenta(luz, 0), []);

const partesLuz = partesPagoLinea(luz, 2500);
assert.equal(partesLuz.virtual + partesLuz.abarrotes + partesLuz.garage, partesLuz.total);
assert.deepEqual(partesLuz, { virtual: 1000, abarrotes: 1500, garage: 0, total: 2500 });
assert.deepEqual(partesPagoLinea({ pagador_nomina: 'virtual' }, 500), { virtual: 500, abarrotes: 0, garage: 0, total: 500 });
assert.deepEqual(partesPagoLinea({ pagador_nomina: 'abarrotes' }, 400), { virtual: 0, abarrotes: 400, garage: 0, total: 400 });
assert.deepEqual(partesPagoLinea({ pagador_nomina: 'ambos', pago_virtual: 200, dias_trabajados: 5 }, 2300), {
  virtual: 1000, abarrotes: 1300, garage: 0, total: 2300,
});

const lineas = [
  { nombre: 'Luz Zazueta', pagador_nomina: 'ambos', pago_virtual: '200', dias_trabajados: 5, total: 2500 },
  { nombre: 'Ana', pagador_nomina: 'virtual', total: 500 },
  { nombre: 'Beto', pagador_nomina: 'abarrotes', total: 400 },
  { nombre: 'Gil', pagador_nomina: 'garage', total: 100 },
];
const sumas = sumarPagosPorCuenta(lineas, (l) => l.total);
assert.deepEqual(sumas, { virtual: 1500, abarrotes: 1900, garage: 100, total: 3500 });
const desglose = filasDesgloseCuentas(sumas);
assert.equal(desglose.mostrar, true);
assert.equal(desglose.filas.reduce((a, f) => a + f.monto, 0), desglose.total);
assert.equal(desglose.total, 3500);
// Una sola cuenta: no hace falta desglose; el total sigue siendo el pago.
const soloAb = filasDesgloseCuentas(sumarPagosPorCuenta([{ pagador_nomina: 'abarrotes', total: 400 }], (l) => l.total));
assert.equal(soloAb.mostrar, false);
assert.equal(soloAb.total, 400);
console.log('nominaPagoMixto: ok');
