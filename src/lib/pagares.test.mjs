import assert from 'node:assert/strict';
import {
  puedeAbonarLiquidarPagare,
  puedeGenerarPagare,
  saldoPagare,
  textoPagare,
  pagareEstaAbierto,
  normalizarAreaPagare,
} from './pagares.js';

assert.equal(puedeGenerarPagare('Administrador'), true);
assert.equal(puedeGenerarPagare('Gerente'), true);
assert.equal(puedeGenerarPagare('Repartidor'), true);
assert.equal(puedeGenerarPagare('Cajero'), false);

assert.equal(puedeAbonarLiquidarPagare('Cajero'), true);
assert.equal(puedeAbonarLiquidarPagare('Administrador'), true);
assert.equal(puedeAbonarLiquidarPagare('Repartidor'), false);

assert.equal(normalizarAreaPagare('Virtual'), 'virtual');
assert.equal(normalizarAreaPagare('GARAGE'), 'garage');
assert.equal(normalizarAreaPagare('x'), null);

const t = textoPagare(150.5);
assert.match(t, /Debo y pagaré la cantidad de: \$150\.50/);
assert.match(t, /descontada en nómina/i);

assert.equal(saldoPagare({ monto: 100, saldo: 40 }), 40);
assert.equal(saldoPagare({ monto: 100 }), 100);
assert.equal(pagareEstaAbierto({ estado: 'abierto', saldo: 10 }), true);
assert.equal(pagareEstaAbierto({ estado: 'liquidado', saldo: 0 }), false);
assert.equal(pagareEstaAbierto({ estado: 'parcial', saldo: 5 }), true);

console.log('pagares.test.mjs ok');
