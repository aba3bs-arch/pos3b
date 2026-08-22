import assert from 'node:assert/strict';
import {
  horaEnTurno,
  sugerirTurnoParaCorte,
  turnoActual,
  turnoConTolerancia,
} from './turnos.js';

const diurno = { id: 'diurno', nombre: 'Turno diurno', hora_inicio: '07:00', hora_fin: '19:00' };
const nocturno = { id: 'nocturno', nombre: 'Turno nocturno', hora_inicio: '19:00', hora_fin: '07:00' };
const list = [diurno, nocturno];

function at(h, m = 0) {
  // Fecha local fija; horaEnTurno usa America/Hermosillo (mismo offset que Sonora = UTC-7 sin DST)
  return new Date(Date.UTC(2026, 7, 22, h + 7, m, 0));
}

// Horario actual define el turno en curso
assert.equal(turnoActual(list, at(10)).id, 'diurno');
assert.equal(turnoActual(list, at(20)).id, 'nocturno');
assert.equal(turnoActual(list, at(3)).id, 'nocturno');
assert.equal(turnoActual(list, at(7)).id, 'diurno');

// Tolerancia: 30 min después del fin del nocturno (07:00) → hasta 07:30
{
  const tol = { minutos_antes: 30, minutos_despues_fin: 30 };
  const ventana = turnoConTolerancia(nocturno, tol);
  assert.equal(ventana.hora_inicio, '18:30');
  assert.equal(ventana.hora_fin, '07:30');
  assert.equal(horaEnTurno(ventana, at(7, 15)), true);
  assert.equal(horaEnTurno(ventana, at(7, 45)), false);
}

// Sugerencia: de día → diurno en curso (no el saliente por defecto)
{
  const s = sugerirTurnoParaCorte(list, at(10), {
    user: { rol: 'Cajero', turno_id: 'diurno' },
  });
  assert.equal(s.turno.id, 'diurno');
  assert.equal(s.motivo, 'actual');
}

// Cajero nocturno aún en tolerancia post-cierre → sugiere entrega (su turno)
{
  const s = sugerirTurnoParaCorte(list, at(7, 15), {
    user: { rol: 'Cajero', turno_id: 'nocturno' },
    tolerancia: { minutos_antes: 30, minutos_despues_fin: 30 },
  });
  assert.equal(s.turno.id, 'nocturno');
  assert.equal(s.motivo, 'entrega');
}

// Pasada la tolerancia: vuelve al turno en curso (diurno)
{
  const s = sugerirTurnoParaCorte(list, at(8, 0), {
    user: { rol: 'Cajero', turno_id: 'nocturno' },
    tolerancia: { minutos_antes: 30, minutos_despues_fin: 30 },
  });
  assert.equal(s.turno.id, 'diurno');
  assert.equal(s.motivo, 'actual');
}

console.log('turnos.corte.test.mjs ok');
