/**
 * Tests sync tolerancia LWW y mapeo MAIN→GLOBAL.
 * node --test src/lib/turnosSync.tolerancia.test.mjs
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => {
    mem.delete(k);
  },
  get length() {
    return mem.size;
  },
  key: (i) => [...mem.keys()][i] ?? null,
};

const {
  sucursalIdTurnosNube,
  remotoEsMasRecienteOIgual,
  normalizarTolerancia,
  normalizarPaqueteTurnosRemoto,
} = await import('./turnosSync.js');
const { turnoConTolerancia, guardarToleranciaTurnos, leerToleranciaTurnos } = await import('./turnos.js');

describe('sucursalIdTurnosNube', () => {
  it('mapea MAIN y CEDIS a GLOBAL', () => {
    assert.equal(sucursalIdTurnosNube('MAIN'), 'GLOBAL');
    assert.equal(sucursalIdTurnosNube('CEDIS'), 'GLOBAL');
    assert.equal(sucursalIdTurnosNube('3B5'), '3B5');
  });
});

describe('LWW tolerancia', () => {
  it('remoto viejo no gana a local nuevo', () => {
    assert.equal(
      remotoEsMasRecienteOIgual('2026-09-26T10:00:00.000Z', '2026-09-26T10:05:00.000Z'),
      false,
    );
  });
  it('remoto nuevo gana', () => {
    assert.equal(
      remotoEsMasRecienteOIgual('2026-09-26T10:10:00.000Z', '2026-09-26T10:05:00.000Z'),
      true,
    );
  });
  it('sin local → aplica remoto', () => {
    assert.equal(remotoEsMasRecienteOIgual('2026-09-26T10:00:00.000Z', null), true);
  });
});

describe('tolerancia no vuelve a 30 si remoto no trae campo', () => {
  it('conserva fallback local 45', () => {
    const t = normalizarTolerancia(null, {
      fallbackLocal: { minutos_antes: 45, minutos_despues_fin: 45 },
    });
    assert.equal(t.minutos_antes, 45);
    assert.equal(t.minutos_despues_fin, 45);
  });
});

describe('turnoConTolerancia con strings (UI)', () => {
  it('45 como string suma minutos, no concatena', () => {
    const diurno = { id: 'diurno', nombre: 'Diurno', hora_inicio: '07:00', hora_fin: '19:00' };
    const t = turnoConTolerancia(diurno, { minutos_antes: '45', minutos_despues_fin: '45' });
    assert.equal(t.hora_inicio, '06:15');
    assert.equal(t.hora_fin, '19:45');
  });
});

describe('guardar/leer tolerancia 45', () => {
  beforeEach(() => mem.clear());
  it('persiste 45', () => {
    guardarToleranciaTurnos({ minutos_antes: 45, minutos_despues_fin: 45 }, '3B5');
    const t = leerToleranciaTurnos('3B5');
    assert.equal(t.minutos_antes, 45);
    assert.equal(t.minutos_despues_fin, 45);
  });
});

describe('paquete remoto conserva tolerancia local si falta', () => {
  it('sin tolerancia en row usa fallback', () => {
    const p = normalizarPaqueteTurnosRemoto(
      {
        tipo_horario: '12x12',
        inicio: '07:00',
        turnos: [
          { id: 'diurno', nombre: 'Diurno', hora_inicio: '07:00', hora_fin: '19:00' },
          { id: 'nocturno', nombre: 'Nocturno', hora_inicio: '19:00', hora_fin: '07:00' },
        ],
      },
      { fallbackToleranciaLocal: { minutos_antes: 45, minutos_despues_fin: 45 } },
    );
    assert.equal(p.tolerancia.minutos_despues_fin, 45);
  });
});
