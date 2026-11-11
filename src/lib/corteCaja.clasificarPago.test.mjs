import assert from 'node:assert/strict';
import test from 'node:test';
import { clasificarPago, resumirVentas } from './corteCaja.js';

test('clasificarPago: efectivo / tarjeta / transfer / qr', () => {
  assert.equal(clasificarPago('Efectivo MXN'), 'efectivo');
  assert.equal(clasificarPago('Tarjeta débito'), 'tarjeta');
  assert.equal(clasificarPago('Transferencia SPEI'), 'transferencia');
  assert.equal(clasificarPago('QR Mercado Pago'), 'qr');
  assert.equal(clasificarPago('Vale'), 'otros');
});

test('clasificarPago: Recarga Mercado Pago cuenta como efectivo', () => {
  assert.equal(clasificarPago('Recarga Mercado Pago'), 'efectivo');
  assert.equal(clasificarPago('Recarga MP'), 'efectivo');
  assert.equal(clasificarPago('Recarga Telcel'), 'efectivo');
  assert.equal(clasificarPago('Tiempo aire'), 'efectivo');
  assert.equal(clasificarPago('TAE 100'), 'efectivo');
});

test('resumirVentas: recargas suman a efectivo neto, no a electrónico', () => {
  const r = resumirVentas([
    { metodo_pago: 'Efectivo MXN', total: 388 },
    { metodo_pago: 'Recarga Mercado Pago', total: 80 },
  ]);
  assert.equal(r.grupos.efectivo, 468);
  assert.equal(r.grupos.otros, 0);
  assert.equal(r.efectivoEsperado, 468);
  assert.equal(r.electronico, 0);
  assert.equal(r.total, 468);
});
