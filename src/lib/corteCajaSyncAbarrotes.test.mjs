import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claveVentaPosCorteCaja,
  aplicarVentaPosEnEstadoAbarrotes,
} from './corteCajaSyncAbarrotes.js';

test('clave estable por fecha y turno', () => {
  assert.equal(claveVentaPosCorteCaja({ fecha: '2026-11-11', turnoId: 'matutino' }), '2026-11-11|matutino');
  assert.equal(claveVentaPosCorteCaja({ fecha: '2026-11-11T08:00:00', turnoId: 't1' }), '2026-11-11|t1');
});

test('primer corte caja: venta = efectivo neto', () => {
  const next = aplicarVentaPosEnEstadoAbarrotes(
    { venta: 0, tarjeta: 10 },
    { clave: '2026-11-11|mat', efectivoEsperado: 468 },
  );
  assert.equal(next.venta, 468);
  assert.equal(next.tarjeta, 10);
  assert.equal(next.venta_pos_por_corte['2026-11-11|mat'], 468);
});

test('corregir mismo turno: reemplaza, no duplica', () => {
  const base = aplicarVentaPosEnEstadoAbarrotes(
    {},
    { clave: '2026-11-11|mat', efectivoEsperado: 400 },
  );
  const corr = aplicarVentaPosEnEstadoAbarrotes(
    base,
    { clave: '2026-11-11|mat', efectivoEsperado: 468 },
  );
  assert.equal(corr.venta, 468);
  assert.equal(Object.keys(corr.venta_pos_por_corte).length, 1);
});

test('segundo turno: suma al abierto de abarrotes', () => {
  const mat = aplicarVentaPosEnEstadoAbarrotes(
    {},
    { clave: '2026-11-11|mat', efectivoEsperado: 468 },
  );
  const ves = aplicarVentaPosEnEstadoAbarrotes(
    mat,
    { clave: '2026-11-11|ves', efectivoEsperado: 200 },
  );
  assert.equal(ves.venta, 668);
});
