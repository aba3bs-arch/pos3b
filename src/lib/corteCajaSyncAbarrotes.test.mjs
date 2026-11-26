import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claveVentaPosCorteCaja,
  aplicarVentaPosEnEstadoAbarrotes,
  aplicarAjusteRecargaMpEnVentaAbarrotes,
  compactarMapaVentaPos,
  repararVentaPosEnEstado,
  mapaVentaPosDesdeCortes,
  turnoCanonVentaPos,
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

test('turno diurno y «Turno diurno» son la misma clave', () => {
  assert.equal(turnoCanonVentaPos('diurno'), 'diurno');
  assert.equal(turnoCanonVentaPos('Turno diurno', 'Turno diurno'), 'diurno');
  assert.equal(
    claveVentaPosCorteCaja({ fecha: '2026-11-25', turnoId: 'diurno' }),
    claveVentaPosCorteCaja({ fecha: '2026-11-25', turnoId: 'Turno diurno', turnoNombre: 'Turno diurno' }),
  );
});

test('corregir con alias de turno: reemplaza, no suma (Fusión / Mezquite)', () => {
  const base = aplicarVentaPosEnEstadoAbarrotes(
    {},
    { clave: '2026-11-25|diurno', totalVentas: 518 },
  );
  const corr = aplicarVentaPosEnEstadoAbarrotes(
    base,
    { clave: '2026-11-25|Turno diurno', totalVentas: 518, turnoNombre: 'Turno diurno' },
  );
  assert.equal(corr.venta, 518);
  assert.equal(Object.keys(corr.venta_pos_por_corte).length, 1);
  assert.equal(corr.venta_pos_por_corte['2026-11-25|diurno'], 518);
});

test('compactar mapa: alias del mismo turno no se suman', () => {
  const compact = compactarMapaVentaPos({
    '2026-11-25|diurno': 518,
    '2026-11-25|Turno diurno': 518,
  });
  assert.equal(Object.keys(compact).length, 1);
  assert.equal(compact['2026-11-25|diurno'], 518);
});

test('reparar estado: venta duplicada de un solo turno vuelve al Total sistema', () => {
  const { estado, cambio } = repararVentaPosEnEstado({
    venta: 1036,
    venta_pos_por_corte: {
      '2026-11-25|diurno': 518,
      '2026-11-25|Turno diurno': 518,
    },
  });
  assert.equal(cambio, true);
  assert.equal(estado.venta, 518);
  assert.equal(Object.keys(estado.venta_pos_por_corte).length, 1);
});

test('reparar estado: venta = 2× mapa de un turno (sin clave alias)', () => {
  const { estado, cambio } = repararVentaPosEnEstado({
    venta: 1036,
    venta_pos_por_corte: { '2026-11-25|diurno': 518 },
  });
  assert.equal(cambio, true);
  assert.equal(estado.venta, 518);
});

test('mapa desde cortes: dos filas del mismo turno dejan el más reciente', () => {
  const map = mapaVentaPosDesdeCortes([
    { fecha: '2026-11-25', turno_id: 'diurno', total_ventas: 518, created_at: '2026-11-25T18:00:00Z' },
    { fecha: '2026-11-25', turno_id: 'diurno', turno_nombre: 'Turno diurno', total_ventas: 518, created_at: '2026-11-25T20:00:00Z' },
  ]);
  assert.equal(map['2026-11-25|diurno'], 518);
  assert.equal(Object.keys(map).length, 1);
});

test('mapa desde cortes: diurno y nocturno sí se acumulan', () => {
  const map = mapaVentaPosDesdeCortes([
    { fecha: '2026-11-25', turno_id: 'diurno', total_ventas: 518, created_at: '2026-11-25T18:00:00Z' },
    { fecha: '2026-11-25', turno_id: 'nocturno', total_ventas: 200, created_at: '2026-11-26T02:00:00Z' },
  ]);
  assert.equal(map['2026-11-25|diurno'], 518);
  assert.equal(map['2026-11-25|nocturno'], 200);
});

test('clavesReemplazar quita la clave vieja al corregir', () => {
  const base = aplicarVentaPosEnEstadoAbarrotes(
    {},
    { clave: '2026-11-25|uuid-viejo', totalVentas: 400 },
  );
  const corr = aplicarVentaPosEnEstadoAbarrotes(
    base,
    {
      clave: '2026-11-25|diurno',
      totalVentas: 518,
      clavesReemplazar: ['2026-11-25|uuid-viejo'],
    },
  );
  assert.equal(corr.venta, 518);
  assert.equal(corr.venta_pos_por_corte['2026-11-25|uuid-viejo'], undefined);
  assert.equal(corr.venta_pos_por_corte['2026-11-25|diurno'], 518);
});
