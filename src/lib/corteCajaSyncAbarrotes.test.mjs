import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claveVentaPosCorteCaja,
  aplicarVentaPosEnEstadoAbarrotes,
  aplicarAjusteRecargaMpEnVentaAbarrotes,
} from './corteCajaSyncAbarrotes.js';

test('clave estable por fecha y turno', () => {
  assert.equal(claveVentaPosCorteCaja({ fecha: '2026-11-11', turnoId: 'matutino' }), '2026-11-11|matutino');
  assert.equal(claveVentaPosCorteCaja({ fecha: '2026-11-11T08:00:00', turnoId: 't1' }), '2026-11-11|t1');
});

test('primer corte caja: venta = Total sistema', () => {
  const next = aplicarVentaPosEnEstadoAbarrotes(
    { venta: 0, tarjeta: 10 },
    { clave: '2026-11-11|mat', totalVentas: 542 },
  );
  assert.equal(next.venta, 542);
  assert.equal(next.tarjeta, 10);
  assert.equal(next.venta_pos_por_corte['2026-11-11|mat'], 542);
});

test('Total sistema incluye electrónico (no solo efectivo neto)', () => {
  const next = aplicarVentaPosEnEstadoAbarrotes(
    {},
    { clave: '2026-11-11|mat', totalVentas: 700 },
  );
  assert.equal(next.venta, 700);
});

test('corregir mismo turno: reemplaza, no duplica', () => {
  const base = aplicarVentaPosEnEstadoAbarrotes(
    {},
    { clave: '2026-11-11|mat', totalVentas: 400 },
  );
  const corr = aplicarVentaPosEnEstadoAbarrotes(
    base,
    { clave: '2026-11-11|mat', totalVentas: 542 },
  );
  assert.equal(corr.venta, 542);
  assert.equal(Object.keys(corr.venta_pos_por_corte).length, 1);
});

test('segundo turno: suma al abierto de abarrotes', () => {
  const mat = aplicarVentaPosEnEstadoAbarrotes(
    {},
    { clave: '2026-11-11|mat', totalVentas: 542 },
  );
  const ves = aplicarVentaPosEnEstadoAbarrotes(
    mat,
    { clave: '2026-11-11|ves', totalVentas: 200 },
  );
  assert.equal(ves.venta, 742);
});

test('candado opción 1: suma ajuste a venta y al mapa del turno', () => {
  const base = aplicarVentaPosEnEstadoAbarrotes(
    {},
    { clave: '2026-11-11|mat', totalVentas: 388 },
  );
  const adj = aplicarAjusteRecargaMpEnVentaAbarrotes(base, 80, {
    fecha: '2026-11-11',
    turnoId: 'mat',
  });
  assert.equal(adj.venta, 468);
  assert.equal(adj.venta_pos_por_corte['2026-11-11|mat'], 468);
});

test('candado opción 1: sin mapa, solo suma a venta', () => {
  const adj = aplicarAjusteRecargaMpEnVentaAbarrotes({ venta: 388 }, 80, {
    fecha: '2026-11-11',
    turnoId: 'mat',
  });
  assert.equal(adj.venta, 468);
});
