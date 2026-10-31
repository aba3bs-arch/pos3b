import assert from 'node:assert/strict';
import { repartoPagoPorCuenta, montoVirtualLinea, etiquetaPagoMixto, esPagoMixto } from './nominaPagoMixto.js';

assert.deepEqual(repartoPagoPorCuenta({ pagador_nomina: 'virtual' }, 500, 'virtual'), [{ cuenta: 'virtual', monto: 500, sufijoRef: '' }]);
assert.deepEqual(repartoPagoPorCuenta({ pagador_nomina: 'ambos' }, 500, 'abarrotes'), [{ cuenta: 'abarrotes', monto: 500, sufijoRef: '' }]);

const luz = { pagador_nomina: 'ambos', pago_virtual: '1200' };
assert.deepEqual(repartoPagoPorCuenta(luz, 3000), [
  { cuenta: 'virtual', monto: 1200, sufijoRef: ':virtual' },
  { cuenta: 'abarrotes', monto: 1800, sufijoRef: '' },
]);
assert.equal(montoVirtualLinea({ pagador_nomina: 'ambos', pago_virtual: 9999 }, 3000), 3000);
assert.deepEqual(repartoPagoPorCuenta({ pagador_nomina: 'ambos', pago_virtual: 9999 }, 3000), [{ cuenta: 'virtual', monto: 3000, sufijoRef: ':virtual' }]);
assert.equal(montoVirtualLinea({ pagador_nomina: 'abarrotes', pago_virtual: 500 }, 3000), 0);
assert.equal(esPagoMixto({ pagador_nomina: 'Ambos' }), true);
assert.equal(etiquetaPagoMixto(luz, 3000), 'Virtual $1200.00 · Abarrotes $1800.00');
assert.equal(etiquetaPagoMixto({ pagador_nomina: 'ambos' }, 3000), '');
assert.deepEqual(repartoPagoPorCuenta(luz, 0), []);
console.log('nominaPagoMixto: ok');
