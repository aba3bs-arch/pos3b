/**
 * Ticket Socio 3B — desglose recolección / descuento / 40-60.
 * Ejecutar: node --test src/lib/clientesMaquinas.pagoTicket.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularPagoClienteRecoleccion,
  htmlBloquePagoClienteTicket,
} from './clientesMaquinas.js';

describe('calcularPagoClienteRecoleccion · Virtual', () => {
  it('ejemplo 3000 → desc 450 · rec 2550 · socio 1020 · ganancia 1530', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'virtual',
      recoleccion: 3000,
    });
    assert.equal(p.base, 3000);
    assert.equal(p.descuento_monto, 450);
    assert.equal(p.tras_descuento, 2550);
    assert.equal(p.pago_cliente, 1020);
    assert.equal(p.ganancia_empresa, 1530);
    assert.equal(p.ie_destino, 'IE VIRTUAL');
  });
});

describe('calcularPagoClienteRecoleccion · Garage', () => {
  it('40% socio / 60% ganancia sobre recolección (sin −15%)', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 3000,
      venta: 5000,
    });
    assert.equal(p.base, 3000);
    assert.equal(p.descuento_monto, 0);
    assert.equal(p.pct_descuento, 0);
    assert.equal(p.pago_cliente, 1200);
    assert.equal(p.ganancia_empresa, 1800);
    assert.equal(p.ie_destino, 'IE VIRTUAL · Garage');
  });

  it('al liquidar en ceros suma recolección anterior al total 40/60', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 2000,
      recoleccionAnterior: 1000,
    });
    assert.equal(p.recoleccion_actual, 2000);
    assert.equal(p.recoleccion_anterior, 1000);
    assert.equal(p.base, 3000);
    assert.equal(p.pago_cliente, 1200);
    assert.equal(p.ganancia_empresa, 1800);
    assert.match(p.formula, /ant/);
  });

  it('sin anterior: solo la recolección actual entra al desglose', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 2500,
      recoleccionAnterior: 0,
    });
    assert.equal(p.base, 2500);
    assert.equal(p.pago_cliente, 1000);
    assert.equal(p.ganancia_empresa, 1500);
  });
});

describe('htmlBloquePagoClienteTicket', () => {
  it('virtual muestra desglose y firma del socio', () => {
    const p = calcularPagoClienteRecoleccion({ modulo: 'virtual', recoleccion: 3000 });
    const html = htmlBloquePagoClienteTicket(p);
    assert.match(html, /Recolección/);
    assert.match(html, /Descuento 15%/);
    assert.match(html, /Rec con descuento/);
    assert.match(html, /Socio 3B 40%/);
    assert.match(html, /Ganancia 60%/);
    assert.match(html, /IE VIRTUAL/);
    assert.match(html, /Firma del socio/);
    assert.match(html, /\$3,000\.00|\$3000\.00/);
  });

  it('garage no muestra descuento 15% y apunta a IE Garage', () => {
    const p = calcularPagoClienteRecoleccion({ modulo: 'garage', recoleccion: 3000 });
    const html = htmlBloquePagoClienteTicket(p);
    assert.doesNotMatch(html, /Descuento 15%/);
    assert.match(html, /Socio 3B 40%/);
    assert.match(html, /Ganancia 60%/);
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
    assert.match(html, /Total a desglose/);
    assert.match(html, /Socio 3B 40%/);
    assert.match(html, /Ganancia 60%/);
  });
});
