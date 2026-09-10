import assert from 'node:assert/strict';
import {
  CRITERIOS_EVALUACION_CT,
  contarProblemasEvaluacion,
  formEvaluacionCtVacio,
  normalizarPayloadEvaluacionCt,
  resumenCriteriosEvaluacion,
  etiquetaCalificacionCt,
} from './cubreEvaluaciones.js';

assert.ok(CRITERIOS_EVALUACION_CT.length >= 5);
assert.ok(CRITERIOS_EVALUACION_CT.some((c) => c.id === 'consume_mucho'));
assert.ok(CRITERIOS_EVALUACION_CT.some((c) => c.id === 'faltante_cigarro'));
assert.ok(CRITERIOS_EVALUACION_CT.some((c) => c.id === 'faltante_dinero'));
assert.ok(CRITERIOS_EVALUACION_CT.some((c) => c.id === 'quejas_cliente'));

const vacio = formEvaluacionCtVacio();
assert.equal(vacio.consume_mucho, false);
assert.equal(vacio.calificacion, 4);

const norm = normalizarPayloadEvaluacionCt({
  consume_mucho: true,
  faltante_dinero: '1',
  quejas_cliente: false,
  calificacion: '5',
  comentario: '  Todo ok con clientes  ',
});
assert.equal(norm.consume_mucho, true);
assert.equal(norm.faltante_dinero, true);
assert.equal(norm.quejas_cliente, false);
assert.equal(norm.calificacion, 5);
assert.equal(norm.comentario, 'Todo ok con clientes');

assert.equal(contarProblemasEvaluacion(norm), 2);
assert.deepEqual(
  resumenCriteriosEvaluacion(norm).slice(0, 2),
  ['Consume mucho (productos / bebidas)', 'Faltante de dinero'],
);

assert.equal(normalizarPayloadEvaluacionCt({ calificacion: 9 }).calificacion, null);
assert.match(etiquetaCalificacionCt(5), /Excelente/);
assert.equal(etiquetaCalificacionCt(null), '—');

console.log('cubreEvaluaciones.test.mjs ok');
