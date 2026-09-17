import assert from 'node:assert/strict';
import {
  esMetodoTarjeta,
  normalizarDigitosBaucher,
  baucherTarjetaValido,
  tarjetaCandadoActivo,
} from './pagoTarjetaBaucher.js';

assert.equal(esMetodoTarjeta({ id: 'tarjeta', label: 'Tarjeta' }), true);
assert.equal(esMetodoTarjeta({ id: 'tarjeta_credito', label: 'Crédito' }), true);
assert.equal(esMetodoTarjeta({ id: 'efectivo', label: 'Efectivo' }), false);
assert.equal(esMetodoTarjeta({ id: 'transferencia', label: 'Transferencia' }), false);

assert.equal(normalizarDigitosBaucher('12-34'), '1234');
assert.equal(normalizarDigitosBaucher('abc98765'), '98765');
assert.equal(normalizarDigitosBaucher('123456'), '12345'); // máx 5

assert.equal(baucherTarjetaValido('1234'), true);
assert.equal(baucherTarjetaValido('12345'), true);
assert.equal(baucherTarjetaValido('123'), false);
assert.equal(baucherTarjetaValido('12-34'), true);
assert.equal(baucherTarjetaValido(''), false);

const tarj = { id: 'tarjeta', label: 'Tarjeta' };
assert.equal(tarjetaCandadoActivo(tarj, ''), true);
assert.equal(tarjetaCandadoActivo(tarj, '12'), true);
assert.equal(tarjetaCandadoActivo(tarj, '1234'), false);
assert.equal(tarjetaCandadoActivo({ id: 'efectivo' }, ''), false);

console.log('pagoTarjetaBaucher.test.mjs OK');
