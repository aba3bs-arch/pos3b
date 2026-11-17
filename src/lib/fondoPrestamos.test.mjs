import assert from 'node:assert/strict';
import {
  puedeAutorizarPrestamoAbbFjbb,
  puedeDarVistoBuenoPrestamo,
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
assert.equal(puedeAutorizarPrestamoAbbFjbb(gerente), true);
assert.equal(puedeAutorizarPrestamoAbbFjbb(principal), true);
assert.equal(puedeAutorizarPrestamoAbbFjbb(cajero), false);

const vacio = resumenFondoPrestamos([], [
  { estado: 'activo', monto_original: 1000, abono: 500, saldo: 500 },
  { estado: 'liquidado', monto_original: 500, abono: 500, saldo: 0 },
]);
assert.equal(vacio.desembolsado, 1500);
assert.equal(vacio.reingresado, 1000);
assert.equal(vacio.saldo, -500);
assert.equal(vacio.porRecuperar, 500);

const conMovs = resumenFondoPrestamos([
  { tipo: 'desembolso', monto: 1000 },
  { tipo: 'reingreso_nomina', monto: 500 },
], [{ estado: 'activo', saldo: 500, monto_original: 9999, abono: 0 }]);
assert.equal(conMovs.desembolsado, 1000);
assert.equal(conMovs.reingresado, 500);
assert.equal(conMovs.saldo, -500);
assert.equal(conMovs.porRecuperar, 500);

console.log('fondoPrestamos.test.mjs ok');
