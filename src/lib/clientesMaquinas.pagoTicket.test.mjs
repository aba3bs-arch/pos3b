/**
 * Ticket Socio 3B — desglose pago.
 * Virtual: rec → −15% → 40/60 (IE solo 60%)
 * Garage: rec → 40/60 sin −15% (IE solo 60%)
 * Ejecutar: node --test src/lib/clientesMaquinas.pagoTicket.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularPagoClienteRecoleccion,
  htmlBloquePagoClienteTicket,
  patchDetalleIeSoloGanancia60,
  registrarPagoClienteRecoleccionIe,
} from './clientesMaquinas.js';

describe('calcularPagoClienteRecoleccion · Virtual', () => {
  it('3000 → −15% = 2550 → socio 1020 · ganancia 1530 (IE)', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'virtual',
      recoleccion: 3000,
    });
    assert.equal(p.base, 3000);
    assert.equal(p.descuento_monto, 450);
    assert.equal(p.tras_descuento, 2550);
    assert.equal(p.gastos, 0);
    assert.equal(p.pago_cliente, 1020);
    assert.equal(p.ganancia_empresa, 1530);
    assert.equal(p.ie_solo_ganancia_60, true);
  });
});

describe('calcularPagoClienteRecoleccion · Garage', () => {
  it('sin −15%: 3000 → socio 1200 · ganancia 1800 (IE)', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 3000,
    });
    assert.equal(p.descuento_monto, 0);
    assert.equal(p.pago_cliente, 1200);
    assert.equal(p.ganancia_empresa, 1800);
  });

  it('suma anterior sin gastos en el reparto', () => {
    const p = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 2000,
      recoleccionAnterior: 1000,
    });
    assert.equal(p.base, 3000);
    assert.equal(p.pago_cliente, 1200);
    assert.equal(p.ganancia_empresa, 1800);
  });
});

describe('IE solo ganancia 60%', () => {
  it('patchDetalleIeSoloGanancia60 fija recoleccion_contabilidad = ganancia', () => {
    const p = calcularPagoClienteRecoleccion({ modulo: 'virtual', recoleccion: 3000 });
    const patch = patchDetalleIeSoloGanancia60(p);
    assert.equal(patch.recoleccion_contabilidad, 1530);
    assert.equal(patch.formula_recoleccion_ie, 'socio_3b_ganancia_60');
    assert.equal(patch.ie_ingreso_solo_ganancia_60, true);
  });

  it('registrarPagoClienteRecoleccionIe no crea egreso del 40%', async () => {
    const p = calcularPagoClienteRecoleccion({ modulo: 'virtual', recoleccion: 3000 });
    const res = await registrarPagoClienteRecoleccionIe(null, { pago: p });
    assert.equal(res.ok, true);
    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'ie_solo_ganancia_60');
    assert.equal(res.ganancia_ie, 1530);
  });
});

describe('htmlBloquePagoClienteTicket', () => {
  it('virtual marca que solo 60% va a IE', () => {
    const p = calcularPagoClienteRecoleccion({ modulo: 'virtual', recoleccion: 3000 });
    const html = htmlBloquePagoClienteTicket(p);
    assert.match(html, /Descuento 15%/);
    assert.match(html, /Ganancia 60% → IE/);
    assert.match(html, /no va a IE/);
    assert.doesNotMatch(html, /Gastos del periodo/);
  });

  it('garage sin descuento 15%', () => {
    const p = calcularPagoClienteRecoleccion({ modulo: 'garage', recoleccion: 3000 });
    const html = htmlBloquePagoClienteTicket(p);
    assert.doesNotMatch(html, /Descuento 15%/);
    assert.match(html, /Ganancia 60% → IE/);
  });
});
