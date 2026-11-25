import assert from 'node:assert/strict';
import {
  MINIMO_VISTO_BUENO,
  calificarEvaluacionPrestamo,
  leerEvaluacionPrestamo,
} from './evaluacionPrestamo.js';

assert.equal(MINIMO_VISTO_BUENO, 85);

const vacia = calificarEvaluacionPrestamo({});
assert.equal(vacia.completo, false);
assert.equal(vacia.aprobado, false);
assert.equal(vacia.porcentaje, 0);

const todasExcelente = calificarEvaluacionPrestamo({
  puntualidad: 'excelente',
  atencion: 'excelente',
  operacion: 'excelente',
  valores: 'excelente',
  inventarios: 'excelente',
});
assert.equal(todasExcelente.porcentaje, 100);
assert.equal(todasExcelente.aprobado, true);

const todasBuenas = calificarEvaluacionPrestamo({
  puntualidad: 'buena',
  atencion: 'buena',
  operacion: 'buena',
  valores: 'buena',
  inventarios: 'buena',
});
assert.equal(todasBuenas.porcentaje, 80);
assert.equal(todasBuenas.aprobado, false);

const justo = calificarEvaluacionPrestamo({
  puntualidad: 'excelente',
  atencion: 'excelente',
  operacion: 'buena',
  valores: 'buena',
  inventarios: 'buena',
});
assert.equal(justo.porcentaje, 88);
assert.equal(justo.aprobado, true);

const bajo = calificarEvaluacionPrestamo({
  puntualidad: 'excelente',
  atencion: 'buena',
  operacion: 'buena',
  valores: 'buena',
  inventarios: 'buena',
});
assert.equal(bajo.porcentaje, 84);
assert.equal(bajo.aprobado, false);

const conDeficiente = calificarEvaluacionPrestamo({
  puntualidad: 'excelente',
  atencion: 'excelente',
  operacion: 'excelente',
  valores: 'excelente',
  inventarios: 'deficiente',
});
assert.equal(conDeficiente.porcentaje, 88);
assert.equal(conDeficiente.aprobado, true);

const opcionAjena = calificarEvaluacionPrestamo({
  puntualidad: 'por_mejorar',
  atencion: 'excelente',
  operacion: 'excelente',
  valores: 'excelente',
  inventarios: 'excelente',
});
assert.equal(opcionAjena.completo, false);
assert.equal(opcionAjena.aprobado, false);

const leida = leerEvaluacionPrestamo(JSON.stringify({
  factores: justo.factores,
  porcentaje: justo.porcentaje,
}));
assert.equal(leida.aprobado, true);
assert.equal(leida.porcentaje, 88);

console.log('evaluacionPrestamo.test.mjs ok');
