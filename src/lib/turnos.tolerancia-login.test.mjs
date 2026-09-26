/**
 * Tests tolerancia login (fin inclusive) y ventana.
 * node --test src/lib/turnos.tolerancia-login.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { horaEnVentanaLogin, turnoConTolerancia } from './turnos.js';

const diurno = { id: 'diurno', nombre: 'Diurno', hora_inicio: '07:00', hora_fin: '19:00' };
const tol30 = { minutos_antes: 30, minutos_despues_fin: 30 };

function fechaNogales(ymd, hh, mm) {
  // Hermosillo = UTC−7: hora local → UTC sumando 7 h.
  let utcH = hh + 7;
  let day = ymd;
  if (utcH >= 24) {
    utcH -= 24;
    const d = new Date(`${ymd}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    day = d.toISOString().slice(0, 10);
  }
  return new Date(`${day}T${String(utcH).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`);
}

describe('tolerancia despues del cierre', () => {
  it('expande ventana a 06:30–19:30', () => {
    const t = turnoConTolerancia(diurno, tol30);
    assert.equal(t.hora_inicio, '06:30');
    assert.equal(t.hora_fin, '19:30');
  });

  it('permite login a las 19:30 (fin inclusive)', () => {
    const d = fechaNogales('2026-09-22', 19, 30);
    assert.equal(horaEnVentanaLogin(diurno, d, tol30), true);
  });

  it('bloquea a las 19:31', () => {
    const d = fechaNogales('2026-09-22', 19, 31);
    assert.equal(horaEnVentanaLogin(diurno, d, tol30), false);
  });

  it('con 45 min despues permite 19:45', () => {
    const d = fechaNogales('2026-09-22', 19, 45);
    assert.equal(horaEnVentanaLogin(diurno, d, { minutos_antes: 45, minutos_despues_fin: 45 }), true);
  });

  it('con 45 min despues bloquea 19:46', () => {
    const d = fechaNogales('2026-09-22', 19, 46);
    assert.equal(horaEnVentanaLogin(diurno, d, { minutos_antes: 45, minutos_despues_fin: 45 }), false);
  });
});
