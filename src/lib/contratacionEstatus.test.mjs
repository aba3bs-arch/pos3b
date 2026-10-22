import assert from 'node:assert/strict';
import {
  construirLineaTiempo,
  etiquetaEtapaActual,
  inputDatetimeAIso,
  isoAInputDatetime,
  urlEstatusContratacion,
} from './contratacionEstatus.js';

const HOY = '2026-10-22';
const estados = (row) => construirLineaTiempo(row, { hoy: HOY }).pasos.map((p) => p.estado);

// candidato actual sin datos de estatus: se deriva de `estado`
assert.deepEqual(estados({ estado: 'nueva', tipo: 'planta' }), ['hecho', 'actual', 'pendiente', 'pendiente', 'pendiente']);
assert.deepEqual(estados({ estado: 'en_seguimiento' }), ['hecho', 'actual', 'pendiente', 'pendiente', 'pendiente']);
assert.deepEqual(estados({ estado: 'entrevista' }), ['hecho', 'hecho', 'actual', 'pendiente', 'pendiente']);
assert.deepEqual(estados({ estado: 'aceptada' }), ['hecho', 'hecho', 'hecho', 'hecho', 'actual']);

// inicio de labores: futuro = en curso, hoy o pasado = ya inició
assert.deepEqual(
  estados({ estado: 'aceptada', inicio_labores: '2026-10-30' }),
  ['hecho', 'hecho', 'hecho', 'hecho', 'actual'],
);
assert.deepEqual(
  estados({ estado: 'aceptada', inicio_labores: '2026-10-22' }),
  ['hecho', 'hecho', 'hecho', 'hecho', 'hecho'],
);

// rechazo: pasos previos hechos, el de corte rechazado, el resto no aplica
const rech = construirLineaTiempo(
  { estado: 'rechazada', rechazo_etapa: 'entrevista', rechazo_motivo: 'No se presentó' },
  { hoy: HOY },
);
assert.deepEqual(rech.pasos.map((p) => p.estado), ['hecho', 'hecho', 'rechazado', 'omitido', 'omitido']);
assert.equal(rech.rechazado, true);
assert.equal(rech.rechazo.etapaLabel, 'Entrevista');
assert.equal(rech.resumen.detalle, 'No se presentó');

// rechazos actuales sin etapa guardada
assert.equal(construirLineaTiempo({ estado: 'no_califica' }, { hoy: HOY }).rechazo.etapa, 'postulacion');
assert.equal(construirLineaTiempo({ estado: 'rechazada' }, { hoy: HOY }).rechazo.etapa, 'revision');
assert.equal(etiquetaEtapaActual({ estado: 'rechazada', rechazo_etapa: 'entrevista' }), 'Rechazado · Entrevista');
assert.equal(etiquetaEtapaActual({ estado: 'entrevista' }), 'Entrevista');

// detalles visibles para el candidato
const ent = construirLineaTiempo(
  { estado: 'entrevista', entrevista_fecha: '2026-10-25T16:00:00.000Z', entrevista_lugar: '3B6' },
  { hoy: HOY },
);
assert.ok(ent.pasos[2].detalles.includes('Lugar: 3B6'));
assert.ok(ent.pasos[2].fecha.length > 0);
assert.match(ent.resumen.titulo, /entrevista/i);

// mensajes: el más reciente primero, sin vacíos
const msgs = construirLineaTiempo(
  {
    estado: 'nueva',
    estatus_mensajes: [
      { id: 'a', at: '2026-10-01T10:00:00Z', texto: 'primero' },
      { id: 'b', at: '2026-10-02T10:00:00Z', texto: 'segundo' },
      { id: 'c', at: '2026-10-03T10:00:00Z', texto: '  ' },
    ],
  },
  { hoy: HOY },
).mensajes;
assert.deepEqual(msgs.map((m) => m.id), ['b', 'a']);

// hora de Nogales (UTC-7)
assert.equal(inputDatetimeAIso('2026-10-25T09:30'), '2026-10-25T16:30:00.000Z');
assert.equal(isoAInputDatetime('2026-10-25T16:30:00.000Z'), '2026-10-25T09:30');
assert.equal(inputDatetimeAIso('basura'), null);

assert.equal(
  urlEstatusContratacion('AB12', 'https://x.app/'),
  'https://x.app/?contratacion=1&estatus=1&codigo=AB12',
);

console.log('contratacionEstatus.test OK');
