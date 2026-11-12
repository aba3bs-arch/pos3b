import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contextosDesdeVentaPosMap,
  etiquetaRangoFechasCandado,
  fechasParaCandadoRecargasMp,
  resolverContextosCandadoRecargasMp,
} from './candadoRecargasMpTurno.js';

test('contextosDesdeVentaPosMap: parsea fecha|turnoId', () => {
  assert.deepEqual(
    contextosDesdeVentaPosMap({
      '2026-11-12|diurno': 1500,
      '2026-11-12|sin-turno': 10,
      basura: 1,
    }),
    [{ fecha: '2026-11-12', turnoId: 'diurno' }],
  );
});

test('resolver: usa turno_sesion del corte abierto', () => {
  const r = resolverContextosCandadoRecargasMp({
    estado: {
      turno_sesion: { id: 'diurno', nombre: 'Diurno', hora_inicio: '07:00', hora_fin: '19:00' },
      venta_pos_por_corte: { '2026-11-11|nocturno': 900 },
    },
  });
  assert.equal(r.contextos.length, 1);
  assert.equal(r.contextos[0].origen, 'turno_sesion');
  assert.equal(r.contextos[0].turno.id, 'diurno');
});

test('resolver: sin turno_sesion usa venta_pos_por_corte', () => {
  const r = resolverContextosCandadoRecargasMp({
    estado: {
      venta_pos_por_corte: {
        '2026-11-12|diurno': 2000,
        '2026-11-12|nocturno': 800,
      },
    },
  });
  assert.equal(r.contextos.length, 2);
  assert.ok(r.contextos.every((c) => c.origen === 'venta_pos'));
  assert.deepEqual(
    r.contextos.map((c) => c.fecha).sort(),
    ['2026-11-12', '2026-11-12'],
  );
  assert.deepEqual(
    r.contextos.map((c) => c.turno.id).sort(),
    ['diurno', 'nocturno'],
  );
});

test('fechas candado: en la mañana incluye ayer+hoy (caso Consultas 105)', () => {
  // 12/11/2026 08:18 Nogales = 15:18 UTC
  const now = new Date('2026-11-12T15:18:06.000Z');
  const fechas = fechasParaCandadoRecargasMp({
    estado: {},
    gastos: [],
    now,
  });
  assert.deepEqual(fechas, ['2026-11-11', '2026-11-12']);
  assert.equal(etiquetaRangoFechasCandado(fechas), '11/11/2026 – 12/11/2026');
});

test('fechas candado: venta_pos de varios días rellena el rango', () => {
  const now = new Date('2026-11-12T20:00:00.000Z'); // ~13:00 Nogales
  const fechas = fechasParaCandadoRecargasMp({
    estado: {
      venta_pos_por_corte: {
        '2026-11-11|diurno': 1000,
        '2026-11-12|diurno': 500,
      },
    },
    now,
  });
  assert.ok(fechas.includes('2026-11-11'));
  assert.ok(fechas.includes('2026-11-12'));
});
