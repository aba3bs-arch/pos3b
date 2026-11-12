import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contextosDesdeVentaPosMap,
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
