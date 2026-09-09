import assert from 'node:assert/strict';
import {
  puedeAbonarLiquidarPagare,
  puedeGenerarPagare,
  puedeRecolectarPagare,
  saldoPagare,
  textoPagare,
  pagareEstaAbierto,
  pagarePendienteCajero,
  pagarePendienteRecoleccion,
  normalizarAreaPagare,
  etiquetaEstadoPagare,
} from './pagares.js';

assert.equal(puedeGenerarPagare('Administrador'), true);
assert.equal(puedeGenerarPagare('Gerente'), true);
assert.equal(puedeGenerarPagare('Repartidor'), true);
assert.equal(puedeGenerarPagare('Cajero'), false);

assert.equal(puedeAbonarLiquidarPagare('Cajero'), true);
assert.equal(puedeAbonarLiquidarPagare('Administrador'), true);
assert.equal(puedeAbonarLiquidarPagare('Repartidor'), false);

assert.equal(puedeRecolectarPagare({ nombre: 'Luis Enrique Osuna Mada' }), true);
assert.equal(puedeRecolectarPagare({ nombre: 'Luis Enrique Mada Osuna' }), true);
assert.equal(puedeRecolectarPagare({ nombre: 'AMR' }), true);
assert.equal(puedeRecolectarPagare({ nombre: 'ABB' }), true);
assert.equal(puedeRecolectarPagare({ nombre: 'JLBB' }), true);
assert.equal(puedeRecolectarPagare({ nombre: 'FBBB' }), true);
assert.equal(puedeRecolectarPagare({ nombre: 'FJBB' }), true);
assert.equal(puedeRecolectarPagare({ nombre: 'Cajero Tienda' }), false);

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
assert.equal(pagarePendienteCajero({ estado: 'abierto', saldo: 10 }), true);
assert.equal(pagarePendienteCajero({ estado: 'por_recolectar', saldo: 10 }), false);
assert.equal(pagarePendienteRecoleccion({ estado: 'por_recolectar', saldo: 10 }), true);
assert.equal(pagarePendienteRecoleccion({ estado: 'abierto', saldo: 10 }), false);
assert.equal(etiquetaEstadoPagare('por_recolectar'), 'Por recolectar → RC Virtual');

console.log('pagares.test.mjs ok');
