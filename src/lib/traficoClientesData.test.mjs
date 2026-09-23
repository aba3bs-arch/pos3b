/**
 * Tests — tráfico de clientes (tickets POS).
 * node --test src/lib/traficoClientesData.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agregarTraficoClientes,
  etiquetaHora,
  horaNogalesDeIso,
  paretoTickets,
} from './traficoClientesData.js';

describe('horaNogalesDeIso / etiquetaHora', () => {
  it('etiqueta hora', () => {
    assert.equal(etiquetaHora(9), '09:00');
    assert.equal(etiquetaHora(17), '17:00');
  });

  it('parsea hora de ISO', () => {
    // 18:00 UTC = 11:00 Hermosillo (UTC-7)
    const h = horaNogalesDeIso('2026-09-22T18:00:00.000Z');
    assert.equal(h, 11);
  });
});

describe('agregarTraficoClientes', () => {
  const ventas = [
    { id: 1, sucursal_id: '3B5', total: 100, created_at: '2026-09-22T18:00:00.000Z' }, // 11h
    { id: 2, sucursal_id: '3B5', total: 50, created_at: '2026-09-22T20:00:00.000Z' }, // 13h
    { id: 3, sucursal_id: '3B2', total: 80, created_at: '2026-09-22T18:30:00.000Z' }, // 11h
    { id: 4, sucursal_id: '3B7', total: 20, created_at: '2026-09-23T01:00:00.000Z' }, // 18h prev day local? 01 UTC = 18:00 previous = Sep 22 18:00 Nogales
  ];

  it('cuenta tickets por tienda y totales', () => {
    const t = agregarTraficoClientes(ventas, ['3B5', '3B2', '3B7']);
    assert.equal(t.tickets, 4);
    assert.equal(t.monto, 250);
    assert.equal(t.ticket_promedio, 62.5);
    const b5 = t.por_tienda.find((x) => x.id === '3B5');
    assert.equal(b5.tickets, 2);
    assert.equal(b5.monto, 150);
  });

  it('detecta hora pico', () => {
    const t = agregarTraficoClientes(ventas, ['3B5', '3B2', '3B7']);
    assert.ok(t.hora_pico);
    assert.equal(t.hora_pico.id, 11);
    assert.equal(t.hora_pico.tickets, 2);
  });

  it('agrupa por dia Nogales', () => {
    const t = agregarTraficoClientes(ventas, ['3B5', '3B2', '3B7']);
    assert.ok(t.por_dia.length >= 1);
    const d22 = t.por_dia.find((d) => d.id === '2026-09-22');
    assert.ok(d22);
    assert.ok(d22.tickets >= 3);
  });
});

describe('paretoTickets', () => {
  it('arma pct por tickets', () => {
    const items = [
      { id: 'a', label: 'A', tickets: 70, monto: 1 },
      { id: 'b', label: 'B', tickets: 30, monto: 1 },
    ];
    const p = paretoTickets(items);
    assert.equal(p[0].id, 'a');
    assert.equal(p[0].pct, 70);
    assert.equal(p[1].pct, 30);
  });
});
