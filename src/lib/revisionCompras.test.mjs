/**
 * Revisión de compras — comparación ticket vs inventario.
 * Ejecutar: node --test src/lib/revisionCompras.test.mjs
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_LINEA,
  claveRevisionTicket,
  enriquecerFilaRevision,
  filtrarTicketsRevision,
  lineasComparacionRevision,
  marcarTicketRevisado,
  quitarRevisionTicket,
  resumenLineasRevision,
} from './revisionCompras.js';

// localStorage polyfill for node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

beforeEach(() => store.clear());

describe('lineasComparacionRevision', () => {
  it('detecta faltante, parcial, extra y ok', () => {
    const fila = {
      lineas_ticket: [
        { id: 'a', nombre: 'Producto A', qty: 10 },
        { id: 'b', nombre: 'Producto B', qty: 5 },
        { id: 'c', nombre: 'Producto C', qty: 2 },
      ],
      lineas_inventario: [
        { id: 'a', nombre: 'Producto A', qty: 10 },
        { id: 'b', nombre: 'Producto B', qty: 3 },
        { id: 'd', nombre: 'Producto D', qty: 1 },
      ],
    };
    const lineas = lineasComparacionRevision(fila);
    const byId = Object.fromEntries(lineas.map((l) => [l.id, l]));
    assert.equal(byId.a.estado, ESTADOS_LINEA.OK);
    assert.equal(byId.b.estado, ESTADOS_LINEA.PARCIAL);
    assert.equal(byId.b.qty_diff, -2);
    assert.equal(byId.c.estado, ESTADOS_LINEA.FALTANTE);
    assert.equal(byId.d.estado, ESTADOS_LINEA.EXTRA);
    const r = resumenLineasRevision(lineas);
    assert.equal(r.ok, 1);
    assert.equal(r.parciales, 1);
    assert.equal(r.faltantes, 1);
    assert.equal(r.extras, 1);
    assert.equal(r.con_diferencia, 3);
  });
});

describe('filtrarTicketsRevision', () => {
  it('deja compras y excluye gastos huérfanos', () => {
    const out = filtrarTicketsRevision([
      { tipo: 'compra', compra_id: '1', folio: 'CMP-1' },
      { tipo: 'gasto', origen: 'gasto_huerfano', folio: 'X' },
      { tipo: 'ingreso', lineas_ticket: [{ id: 'a', qty: 1 }], folio: 'ING-1' },
      { tipo: 'traspaso', lineas_ticket: [], folio: 'trp-1' },
    ]);
    assert.equal(out.length, 2);
    assert.ok(out.some((f) => f.compra_id === '1'));
    assert.ok(out.some((f) => f.folio === 'ING-1'));
  });
});

describe('marcar revisión', () => {
  it('guarda y limpia revisado en localStorage', () => {
    const fila = enriquecerFilaRevision({
      compra_id: 'abc',
      folio: 'CMP-1',
      sucursal_id: '3B2',
      fecha_ymd: '2026-03-20',
      lineas_ticket: [{ id: 'a', nombre: 'A', qty: 2 }],
      lineas_inventario: [{ id: 'a', nombre: 'A', qty: 2 }],
    });
    assert.equal(fila.revisado, false);
    assert.equal(fila.auto_ok, true);
    const key = claveRevisionTicket(fila);
    const r = marcarTicketRevisado(fila, { usuario: 'Tester' });
    assert.equal(r.ok, true);
    assert.equal(r.data.resultado, 'ok');
    const otra = enriquecerFilaRevision(fila);
    assert.equal(otra.revisado, true);
    quitarRevisionTicket(key);
    assert.equal(enriquecerFilaRevision(fila).revisado, false);
  });
});
