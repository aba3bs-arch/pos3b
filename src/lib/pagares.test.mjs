import assert from 'node:assert/strict';
import {
  ACREEDOR_PAGARE_LAS_3B,
  etiquetaPagarALas3b,
  puedeAbonarLiquidarPagare,
  puedeGenerarPagare,
  puedeRecolectarPagare,
  puedeRecibirPagare,
  saldoPagare,
  textoPagare,
  pagareEnTransito,
  pagareEstaAbierto,
  pagarePendienteCajero,
  pagarePendienteRecoleccion,
  nombreRecolectorPagare,
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

assert.equal(puedeRecibirPagare({ nombre: 'AMR' }), true);
assert.equal(puedeRecibirPagare({ nombre: 'ABB' }), true);
assert.equal(puedeRecibirPagare({ nombre: 'JLBB' }), true);
assert.equal(puedeRecibirPagare({ nombre: 'FJBB' }), true);
assert.equal(puedeRecibirPagare({ nombre: 'Luis Enrique Osuna Mada' }), false);

assert.equal(normalizarAreaPagare('Virtual'), 'virtual');
assert.equal(normalizarAreaPagare('GARAGE'), 'garage');
assert.equal(normalizarAreaPagare('x'), null);

const t = textoPagare(150.5, {
  sucursal: '3B5',
  encargado_nombre: 'Ana López',
  creado_por: 'JLBB',
});
assert.match(t, /Yo, Ana López \(encargado\), sucursal 3B5/);
assert.match(t, /debo y pagaré a las 3b \(JLBB\)/);
assert.match(t, /\$150\.50/);
assert.match(t, /nómina del responsable/i);

const tBlank = textoPagare(10, { sucursal: '3B2' });
assert.match(tBlank, /Yo, _{5,} \(encargado\), sucursal 3B2/);
assert.match(tBlank, /pagaré a las 3b \(_{5,}\)/);

assert.equal(etiquetaPagarALas3b({ creado_por: 'AMR' }), 'las 3b (AMR)');
assert.equal(etiquetaPagarALas3b('ABB'), 'las 3b (ABB)');
assert.equal(etiquetaPagarALas3b(null), ACREEDOR_PAGARE_LAS_3B);

assert.equal(saldoPagare({ monto: 100, saldo: 40 }), 40);
assert.equal(saldoPagare({ monto: 100 }), 100);
assert.equal(pagareEstaAbierto({ estado: 'abierto', saldo: 10 }), true);
assert.equal(pagareEstaAbierto({ estado: 'liquidado', saldo: 0 }), false);
assert.equal(pagareEstaAbierto({ estado: 'parcial', saldo: 5 }), true);
assert.equal(pagareEstaAbierto({ estado: 'en_transito', saldo: 0, rc_monto: 50 }), false);
assert.equal(pagarePendienteCajero({ estado: 'abierto', saldo: 10 }), true);
assert.equal(pagarePendienteCajero({ estado: 'por_recolectar', saldo: 10 }), false);
assert.equal(pagarePendienteRecoleccion({ estado: 'por_recolectar', saldo: 10 }), true);
assert.equal(pagarePendienteRecoleccion({ estado: 'abierto', saldo: 10 }), false);
assert.equal(pagareEnTransito({ estado: 'en_transito' }), true);
assert.equal(pagareEnTransito({ estado: 'por_recolectar' }), false);
assert.equal(nombreRecolectorPagare({ rc_recolectado_por: 'Luis' }), 'Luis');
assert.equal(nombreRecolectorPagare({ rc_recibido_por: 'Viejo' }), 'Viejo');
assert.equal(etiquetaEstadoPagare('por_recolectar'), 'Por recolectar → RC Virtual');
assert.equal(etiquetaEstadoPagare('en_transito'), 'En tránsito (recolectado)');
assert.equal(etiquetaEstadoPagare('recolectado'), 'Recibido en central');

console.log('pagares.test.mjs ok');
