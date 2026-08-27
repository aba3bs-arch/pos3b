import assert from 'node:assert/strict';
import {
  plantillaTurnos12x12,
  turnosDiurnoNocturnoInvertidos,
  corregirTurnosDiurnoNocturno,
  normalizarInicioPlantilla12x12,
  puntoMedioEsDiurno,
} from './turnos.js';

// Plantilla correcta con 08:00
{
  const list = plantillaTurnos12x12('08:00');
  assert.equal(list[0].id, 'diurno');
  assert.equal(list[0].hora_inicio, '08:00');
  assert.equal(list[0].hora_fin, '20:00');
  assert.equal(list[1].id, 'nocturno');
  assert.equal(list[1].hora_inicio, '20:00');
  assert.equal(list[1].hora_fin, '08:00');
  assert.equal(turnosDiurnoNocturnoInvertidos(list), false);
  assert.equal(puntoMedioEsDiurno(list[0]), true);
  assert.equal(puntoMedioEsDiurno(list[1]), false);
}

// Caso de la captura: diurno 20–08 y nocturno 08–20 → invertidos
{
  const mal = [
    { id: 'diurno', nombre: 'Turno diurno', hora_inicio: '20:00', hora_fin: '08:00' },
    { id: 'nocturno', nombre: 'Turno nocturno', hora_inicio: '08:00', hora_fin: '20:00' },
  ];
  assert.equal(turnosDiurnoNocturnoInvertidos(mal), true);
  const r = corregirTurnosDiurnoNocturno(mal);
  assert.equal(r.corregido, true);
  assert.equal(r.turnos[0].hora_inicio, '08:00');
  assert.equal(r.turnos[0].hora_fin, '20:00');
  assert.equal(r.turnos[1].hora_inicio, '20:00');
  assert.equal(r.turnos[1].hora_fin, '08:00');
  assert.equal(turnosDiurnoNocturnoInvertidos(r.turnos), false);
}

// Si ponen 20:00 como «entrada diurno», normalizar a 08:00
assert.equal(normalizarInicioPlantilla12x12('20:00'), '08:00');
assert.equal(normalizarInicioPlantilla12x12('19:00'), '07:00');
assert.equal(normalizarInicioPlantilla12x12('08:00'), '08:00');
assert.equal(normalizarInicioPlantilla12x12('07:00'), '07:00');

console.log('turnos.diurno-nocturno.test.mjs ok');
