import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupeMovimientos,
  resumenCuadreHistorialProducto,
  ticketIdDeMovimientoVenta,
} from './consultasInventario.js';

test('PallMall Fusión: inicial −1 + entradas 80 − salidas 47 = PZA 32', () => {
  const eventos = [
    {
      id: 'ing',
      tipo: 'entrada',
      cantidad: 80,
      stock_antes: -1,
      stock_despues: 80, // saldado: delta +81
      created_at: '2026-11-02T12:00:00.000Z',
    },
    ...Array.from({ length: 47 }, (_, i) => ({
      id: `v${i}`,
      tipo: 'retiro',
      modo: 'venta',
      cantidad: 1,
      stock_antes: 80 - i,
      stock_despues: 79 - i,
      created_at: `2026-11-${String(3 + Math.floor(i / 10)).padStart(2, '0')}T12:00:00.000Z`,
    })),
  ];
  // Última venta: 80-47 = 33 si saldado dejó en 80…
  // Si el ingreso NO saldó (−1+80=79): 79-47=32.
  const sinSaldar = [
    {
      id: 'ing',
      tipo: 'entrada',
      cantidad: 80,
      stock_antes: -1,
      stock_despues: 79,
      created_at: '2026-11-02T12:00:00.000Z',
    },
    ...Array.from({ length: 47 }, (_, i) => ({
      id: `v${i}`,
      tipo: 'retiro',
      modo: 'venta',
      cantidad: 1,
      stock_antes: 79 - i,
      stock_despues: 78 - i,
      created_at: `2026-11-03T${String(10 + (i % 10)).padStart(2, '0')}:00:00.000Z`,
    })),
  ];
  const c = resumenCuadreHistorialProducto(sinSaldar, 32);
  assert.equal(c.entradas, 80);
  assert.equal(c.salidas, 47);
  assert.equal(c.stockInicial, -1);
  assert.equal(c.esperadoPorCantidad, 32);
  assert.equal(c.esperado, 32);
  assert.equal(c.descuadre, 0);
  assert.match(String(c.aviso), /teórico -1|arrancó con teórico/i);

  const conSaldado = resumenCuadreHistorialProducto(eventos, 33);
  assert.equal(conSaldado.saldadoTeorico, 1);
  assert.equal(conSaldado.esperado, 33);
});

test('ticket id une retiro y venta aunque el bucket de 2 min no coincida', () => {
  const tid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const retiro = {
    id: 'mov-1',
    cloudId: 'mov-1',
    tipo: 'retiro',
    modo: 'venta',
    producto_id: '39',
    cantidad: 1,
    stock_antes: 10,
    stock_despues: 9,
    sucursal: 'FUSION',
    created_at: '2026-11-11T15:00:00.000Z',
    origen: 'nube',
    motivo: `Venta · Efectivo MXN · ticket ${tid.slice(0, 8)}`,
    meta: { venta_id: tid },
  };
  const ticket = {
    id: `venta_${tid}_39`,
    tipo: 'retiro',
    modo: 'venta',
    producto_id: '39',
    cantidad: 1,
    subtotal: 8,
    sucursal: 'FUSION',
    created_at: '2026-11-11T18:30:00.000Z', // horas después (sync)
    origen: 'ventas',
    venta_id: tid,
    meta: { venta_id: tid },
    motivo: `Venta · Efectivo MXN · ticket ${tid.slice(0, 8)}`,
  };
  assert.equal(ticketIdDeMovimientoVenta(retiro), tid);
  assert.equal(ticketIdDeMovimientoVenta(ticket), tid);
  const merged = dedupeMovimientos([retiro, ticket]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].subtotal, 8);
  assert.equal(merged[0].stock_antes, 10);
});
