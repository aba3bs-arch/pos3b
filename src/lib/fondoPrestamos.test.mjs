import assert from 'node:assert/strict';
import {
  etiquetaMovimientoFondo,
  prestamoEstaRecordado,
  puedeAutorizarPrestamoAbbFjbb,
  puedeDarVistoBuenoPrestamo,
  puedeDesembolsarPrestamo,
  recordarPrestamo,
  resumenFondoPrestamos,
} from './fondoPrestamos.js';

const gerente = { nombre: 'Andrés Marrero', rol: 'Gerente' };
const principal = { nombre: 'Administrador principal', rol: 'Administrador', es_admin_principal: true };
const abb = { nombre: 'Antonio', rol: 'Administrador' };
const fjbb = { nombre: 'Francisco', rol: 'Administrador' };
const jlbb = { nombre: 'José Luis', rol: 'Administrador' };
const cajero = { nombre: 'Juan', rol: 'Cajero' };

assert.equal(puedeDarVistoBuenoPrestamo(gerente), true);
assert.equal(puedeDarVistoBuenoPrestamo(principal), true);
assert.equal(puedeDarVistoBuenoPrestamo(abb), false);
assert.equal(puedeDarVistoBuenoPrestamo(cajero), false);

assert.equal(puedeAutorizarPrestamoAbbFjbb(abb), true);
assert.equal(puedeAutorizarPrestamoAbbFjbb(fjbb), true);
assert.equal(puedeAutorizarPrestamoAbbFjbb(jlbb), false);
assert.equal(puedeDesembolsarPrestamo(jlbb), true);
assert.equal(puedeDesembolsarPrestamo(abb), false);
assert.equal(puedeDesembolsarPrestamo(gerente), true);
assert.equal(puedeDesembolsarPrestamo(principal), true);

const fondo = resumenFondoPrestamos([
  { tipo: 'capital', monto: 10000 },
  { tipo: 'desembolso', monto: 2000 },
  { tipo: 'reingreso_nomina', monto: 500 },
]);
assert.equal(fondo.capitalAportado, 10000);
assert.equal(fondo.desembolsado, 2000);
assert.equal(fondo.reingresado, 500);
assert.equal(fondo.capital, 8500);

const fondoCobro = resumenFondoPrestamos([
  { tipo: 'capital', monto: 10000 },
  { tipo: 'desembolso', monto: 2000 },
  { tipo: 'reingreso_nomina', monto: 500 },
  { tipo: 'reingreso_cobro', monto: 300 },
]);
assert.equal(fondoCobro.reingresado, 800);
assert.equal(fondoCobro.capital, 8800);
assert.equal(etiquetaMovimientoFondo('reingreso_cobro'), 'Cobro JLBB');
assert.equal(etiquetaMovimientoFondo('reingreso_nomina'), 'Reingreso de nómina');

assert.equal(resumenFondoPrestamos([]).capital, 0);

const mem = {
  valor: '',
  getItem() { return this.valor; },
  setItem(_k, v) { this.valor = v; },
};
const ahora = 1_700_000_000_000;
recordarPrestamo('u1', 'p1', 15, ahora, mem);
assert.equal(prestamoEstaRecordado('u1', 'p1', ahora + 14 * 60 * 1000, mem), true);
assert.equal(prestamoEstaRecordado('u1', 'p1', ahora + 16 * 60 * 1000, mem), false);
assert.equal(prestamoEstaRecordado('u2', 'p1', ahora + 1000, mem), false);

console.log('fondoPrestamos.test.mjs ok');
