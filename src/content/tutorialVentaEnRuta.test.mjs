import assert from 'node:assert/strict';
import { calificarTutorialQuiz } from '../lib/tutorialQuiz.js';
import { TUTORIAL_VENTA_EN_RUTA } from './tutorialVentaEnRuta.js';

assert.equal(TUTORIAL_VENTA_EN_RUTA.id, 'venta-en-ruta');
assert.ok(TUTORIAL_VENTA_EN_RUTA.secciones.length >= 10);
const quizSec = TUTORIAL_VENTA_EN_RUTA.secciones.find((s) => s.id === 'quiz');
assert.ok(quizSec?.quiz?.length >= 6);
for (const q of quizSec.quiz) {
  assert.ok(q.pregunta);
  assert.ok(Array.isArray(q.opciones) && q.opciones.length >= 2);
  assert.ok(Number.isInteger(q.correcta) && q.correcta >= 0 && q.correcta < q.opciones.length);
}

const a = calificarTutorialQuiz(8, 8);
assert.equal(a.letra, 'A');
assert.equal(a.aprueba, true);
assert.equal(a.pct, 100);

const c = calificarTutorialQuiz(6, 8);
assert.equal(c.letra, 'C');
assert.equal(c.aprueba, true);
assert.equal(c.pct, 75);

const f = calificarTutorialQuiz(2, 8);
assert.equal(f.letra, 'F');
assert.equal(f.aprueba, false);

console.log('tutorialVentaEnRuta.test.mjs OK');
