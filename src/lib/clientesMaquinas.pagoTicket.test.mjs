/**
 * Ticket Socio 3B — desglose: rec → −15% → −gastos → 40/60.
 * Ejecutar: node --test src/lib/clientesMaquinas.pagoTicket.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularPagoClienteRecoleccion,
  htmlBloquePagoClienteTicket,
} from './clientesMaquinas.js';

describe('calcularPagoClienteRecoleccion · Virtual', () => {
  it('sin gastos: 3000 → −15% = 2550 → socio 1020 · ganancia 1530', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'virtual',
      recoleccion: 3000,
    });
    assert.equal(p.base, 3000);
    assert.equal(p.descuento_monto, 450);
    assert.equal(p.tras_descuento, 2550);
    assert.equal(p.gastos, 0);
    assert.equal(p.tras_gastos, 2550);
    assert.equal(p.pago_cliente, 1020);
    assert.equal(p.ganancia_empresa, 1530);
    assert.equal(p.ie_destino, 'IE VIRTUAL');
  });

  it('con gastos: 3000 → −15% = 2550 − 550 = 2000 → socio 800 · ganancia 1200', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'virtual',
      recoleccion: 3000,
      gastos: 550,
    });
    assert.equal(p.tras_descuento, 2550);
    assert.equal(p.gastos, 550);
    assert.equal(p.tras_gastos, 2000);
    assert.equal(p.pago_cliente, 800);
    assert.equal(p.ganancia_empresa, 1200);
  });
});

describe('calcularPagoClienteRecoleccion · Garage', () => {
  it('igual que Virtual: −15% luego −gastos luego 40/60', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 3000,
      venta: 5000,
    });
    assert.equal(p.base, 3000);
    assert.equal(p.descuento_monto, 450);
    assert.equal(p.tras_descuento, 2550);
    assert.equal(p.pago_cliente, 1020);
    assert.equal(p.ganancia_empresa, 1530);
    assert.equal(p.ie_destino, 'IE VIRTUAL · Garage');
  });

  it('suma recolección anterior antes de −15% y gastos', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 2000,
      recoleccionAnterior: 1000,
      gastos: 550,
    });
    assert.equal(p.recoleccion_actual, 2000);
    assert.equal(p.recoleccion_anterior, 1000);
    assert.equal(p.base, 3000);
    assert.equal(p.tras_descuento, 2550);
    assert.equal(p.tras_gastos, 2000);
    assert.equal(p.pago_cliente, 800);
    assert.equal(p.ganancia_empresa, 1200);
  });

  it('gastos no bajan de cero la base 40/60', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 1000,
      gastos: 5000,
    });
    assert.equal(p.tras_descuento, 850);
    assert.equal(p.tras_gastos, 0);
    assert.equal(p.pago_cliente, 0);
    assert.equal(p.ganancia_empresa, 0);
  });
});

describe('htmlBloquePagoClienteTicket', () => {
  it('virtual muestra −15%, gastos y firma', () => {
    const p = calcularPagoClienteRecoleccion({ modulo: 'virtual', recoleccion: 3000, gastos: 100 });
    const html = htmlBloquePagoClienteTicket(p);
    assert.match(html, /Recolección/);
    assert.match(html, /Descuento 15%/);
    assert.match(html, /Rec con descuento/);
    assert.match(html, /Gastos del periodo/);
    assert.match(html, /Base 40\/60/);
    assert.match(html, /Socio 3B 40%/);
    assert.match(html, /Ganancia 60%/);
    assert.match(html, /IE VIRTUAL/);
    assert.match(html, /Firma del socio/);
  });

  it('garage también muestra descuento 15% y gastos', () => {
    const p = calcularPagoClienteRecoleccion({ modulo: 'garage', recoleccion: 3000, gastos: 50 });
    const html = htmlBloquePagoClienteTicket(p);
    assert.match(html, /Descuento 15%/);
    assert.match(html, /Gastos del periodo/);
    assert.match(html, /Socio 3B 40%/);
    assert.match(html, /IE VIRTUAL · Garage/);
    assert.match(html, /Firma del socio/);
  });

  it('garage con anterior muestra suma en el ticket', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 2000,
      recoleccionAnterior: 1000,
    });
    const html = htmlBloquePagoClienteTicket(p);
    assert.match(html, /Recolección \(turno\)/);
    assert.match(html, /Recolección anterior/);
    assert.match(html, /Total recolección/);
    assert.match(html, /Socio 3B 40%/);
  });
});
