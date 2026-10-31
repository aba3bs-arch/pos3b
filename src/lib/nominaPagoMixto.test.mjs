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

const luz = { pagador_nomina: 'ambos', pago_virtual: '1200' };
assert.deepEqual(repartoPagoPorCuenta(luz, 3000), [
  { cuenta: 'virtual', monto: 1200, sufijoRef: ':virtual' },
  { cuenta: 'abarrotes', monto: 1800, sufijoRef: '' },
]);
assert.equal(montoVirtualLinea({ pagador_nomina: 'ambos', pago_virtual: 1000 }, 2500), 1000);
assert.equal(montoVirtualLinea({ pagador_nomina: 'ambos', pago_virtual: 9999 }, 3000), 9999);
assert.deepEqual(repartoPagoPorCuenta({ pagador_nomina: 'ambos', pago_virtual: 9999 }, 3000), [{ cuenta: 'virtual', monto: 3000, sufijoRef: ':virtual' }]);
assert.equal(montoVirtualLinea({ pagador_nomina: 'abarrotes', pago_virtual: 500 }, 3000), 0);
assert.equal(esPagoMixto({ pagador_nomina: 'Ambos' }), true);
assert.equal(etiquetaPagoMixto(luz, 3000), 'Virtual $1200.00 + Abarrotes $1800.00 = $3000.00');
assert.equal(etiquetaPagoMixto({ pagador_nomina: 'ambos' }, 3000), '');
assert.deepEqual(repartoPagoPorCuenta(luz, 0), []);

const partesLuz = partesPagoLinea(luz, 3000);
assert.equal(partesLuz.virtual + partesLuz.abarrotes + partesLuz.garage, partesLuz.total);
assert.deepEqual(partesLuz, { virtual: 1200, abarrotes: 1800, garage: 0, total: 3000 });
assert.deepEqual(partesPagoLinea({ pagador_nomina: 'virtual' }, 500), { virtual: 500, abarrotes: 0, garage: 0, total: 500 });
assert.deepEqual(partesPagoLinea({ pagador_nomina: 'abarrotes' }, 400), { virtual: 0, abarrotes: 400, garage: 0, total: 400 });
// Pago negativo en mixto: la deuda queda en Abarrotes y sigue sumando el neto.
assert.deepEqual(partesPagoLinea({ pagador_nomina: 'ambos', pago_virtual: '1000' }, 2500), {
  virtual: 1000, abarrotes: 1500, garage: 0, total: 2500,
});
assert.equal(
  partesPagoLinea({ pagador_nomina: 'ambos', pago_virtual: '1000' }, 2500).virtual
    + partesPagoLinea({ pagador_nomina: 'ambos', pago_virtual: '1000' }, 2500).abarrotes,
  2500,
);
assert.deepEqual(partesPagoLinea({ pagador_nomina: 'ambos', pago_virtual: 1200 }, 1050), {
  virtual: 1200, abarrotes: -150, garage: 0, total: 1050,
});

const lineas = [
  { nombre: 'Luz Zazueta', pagador_nomina: 'ambos', pago_virtual: '1200', total: 3000 },
  { nombre: 'Ana', pagador_nomina: 'virtual', total: 500 },
  { nombre: 'Beto', pagador_nomina: 'abarrotes', total: 400 },
  { nombre: 'Gil', pagador_nomina: 'garage', total: 100 },
];
const sumas = sumarPagosPorCuenta(lineas, (l) => l.total);
assert.deepEqual(sumas, { virtual: 1700, abarrotes: 2200, garage: 100, total: 4000 });
const desglose = filasDesgloseCuentas(sumas);
assert.equal(desglose.mostrar, true);
assert.equal(desglose.filas.reduce((a, f) => a + f.monto, 0), desglose.total);
assert.equal(desglose.total, 4000);
// Una sola cuenta: no hace falta desglose; el total sigue siendo el pago.
const soloAb = filasDesgloseCuentas(sumarPagosPorCuenta([{ pagador_nomina: 'abarrotes', total: 400 }], (l) => l.total));
assert.equal(soloAb.mostrar, false);
assert.equal(soloAb.total, 400);
console.log('nominaPagoMixto: ok');
