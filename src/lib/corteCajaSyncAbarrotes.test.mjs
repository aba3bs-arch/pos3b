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
  estadoSinVentasYaCerradas,
  turnoVentaYaCerrado,
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

test('segundo turno con el campo alineado: sigue sumando, no se borra el diurno', () => {
  const next = aplicarVentaPosEnEstadoAbarrotes(
    {
      venta: 1500,
      venta_pos_por_corte: {
        '2026-11-25|diurno': 1500,
        '2026-11-25|nocturno': 2003,
      },
    },
    {
      fecha: '2026-11-25',
      turnoId: 'nocturno',
      turnoNombre: 'Turno nocturno',
      totalVentas: 2003,
    },
  );
  assert.equal(next.venta, 3503);
  assert.equal(next.venta_pos_por_corte['2026-11-25|diurno'], 1500);
  assert.equal(next.venta_pos_por_corte['2026-11-25|nocturno'], 2003);
});

test('venta ya capturada en el campo: guardar actualiza, no suma', () => {
  const next = aplicarVentaPosEnEstadoAbarrotes(
    {
      venta: 2003,
      tarjeta: 158,
      venta_pos_por_corte: { '2026-11-25|diurno': 1500 },
    },
    {
      fecha: '2026-11-25',
      turnoId: 'nocturno',
      turnoNombre: 'Turno nocturno',
      totalVentas: 2003,
    },
  );
  assert.equal(next.venta, 2003);
  assert.equal(next.tarjeta, 158);
  assert.equal(next.venta_pos_por_corte['2026-11-25|nocturno'], 2003);
  assert.equal(next.venta_pos_por_corte['2026-11-25|diurno'], undefined);
});

test('mismo nocturno en dos fechas: corregir reemplaza, no suma', () => {
  const next = aplicarVentaPosEnEstadoAbarrotes(
    {
      venta: 2003,
      venta_pos_por_corte: { '2026-11-26|nocturno': 2003 },
    },
    {
      fecha: '2026-11-25',
      turnoId: 'nocturno',
      turnoNombre: 'Turno nocturno',
      totalVentas: 2100,
    },
  );
  assert.equal(next.venta, 2100);
  assert.equal(next.venta_pos_por_corte['2026-11-26|nocturno'], undefined);
  assert.equal(next.venta_pos_por_corte['2026-11-25|nocturno'], 2100);
});

test('cierre temprano del mismo turno: el final lo actualiza', () => {
  const next = aplicarVentaPosEnEstadoAbarrotes(
    {
      venta: 800,
      venta_pos_por_corte: { '2026-11-25|nocturno': 800 },
    },
    {
      fecha: '2026-11-25',
      turnoId: 'nocturno',
      turnoNombre: 'Turno nocturno',
      totalVentas: 2003,
    },
  );
  assert.equal(next.venta, 2003);
  assert.equal(Object.keys(next.venta_pos_por_corte).length, 1);
});

test('reparar: el mismo turno en dos fechas no deja la venta duplicada', () => {
  const { estado, cambio } = repararVentaPosEnEstado({
    venta: 4006,
    venta_pos_por_corte: {
      '2026-11-25|nocturno': 2003,
      '2026-11-26|nocturno': 2003,
    },
  });
  assert.equal(cambio, true);
  assert.equal(estado.venta, 2003);
  assert.equal(Object.keys(estado.venta_pos_por_corte).length, 1);
});

test('3B5: el diurno ya cerrado no se suma al nocturno abierto', () => {
  const cierreDia = {
    folio: 'AB-239',
    created_at: '2026-11-27T02:12:50Z',
    turno: 'Turno nocturno',
    detalle: {
      tipo_cierre: 'cierre_operativo',
      venta_pos_por_corte: { '2026-11-26|diurno': 1554 },
    },
  };
  const corteGeneral = {
    folio: 'CGA-00014',
    created_at: '2026-11-27T06:59:59Z',
    turno: 'Corte general',
    detalle: {
      tipo_cierre: 'cierre_diario',
      venta_pos_por_corte: {
        '2026-11-26|diurno': 1554,
        '2026-11-26|nocturno': 1696,
      },
    },
  };
  const { estado, cambio } = estadoSinVentasYaCerradas(
    {
      venta: 3250,
      tarjeta: 333,
      venta_pos_por_corte: {
        '2026-11-26|diurno': 1554,
        '2026-11-26|nocturno': 1696,
      },
    },
    [corteGeneral, cierreDia],
  );
  assert.equal(cambio, true);
  assert.equal(estado.venta, 1696);
  assert.equal(estado.tarjeta, 333);
  assert.equal(estado.venta_pos_por_corte['2026-11-26|diurno'], undefined);
  assert.equal(estado.venta_pos_por_corte['2026-11-26|nocturno'], 1696);
  assert.equal(turnoVentaYaCerrado('2026-11-26|diurno', [corteGeneral, cierreDia]), true);
  assert.equal(turnoVentaYaCerrado('2026-11-26|nocturno', [corteGeneral, cierreDia]), false);
});

test('dos turnos todavía abiertos siguen sumados', () => {
  const { estado, cambio } = estadoSinVentasYaCerradas(
    {
      venta: 3250,
      venta_pos_por_corte: {
        '2026-11-26|diurno': 1554,
        '2026-11-26|nocturno': 1696,
      },
    },
    [{
      folio: 'AB-238',
      created_at: '2026-11-26T14:32:13Z',
      detalle: {
        tipo_cierre: 'cierre_operativo',
        venta_pos_por_corte: { '2026-11-25|nocturno': 2003 },
      },
    }],
  );
  assert.equal(cambio, false);
  assert.equal(estado.venta, 3250);
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
