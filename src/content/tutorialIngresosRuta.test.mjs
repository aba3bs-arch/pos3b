import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TUTORIAL_INGRESOS_RUTA as T } from './tutorialIngresosRuta.js';
import { TUTORIALES } from './tutoriales.js';

assert.equal(T.id, 'estadisticas-ingresos-ruta');
assert.ok(TUTORIALES.includes(T), 'registrado en el módulo Tutorial');
const ids = new Set(T.secciones.map((s) => s.id));
assert.equal(ids.size, T.secciones.length, 'ids de sección únicos');
const conImg = T.secciones.filter((s) => s.imagen);
assert.ok(conImg.length >= 6);
for (const s of conImg) {
  assert.match(s.imagen, /^\/tutorial-ingresos-ruta\/.+\.jpg$/);
  assert.ok(fs.existsSync(new URL(`../../public${s.imagen}`, import.meta.url)), `falta ${s.imagen}`);
  assert.ok(s.imagenAlt);
}
const quiz = T.secciones.find((s) => s.id === 'quiz').quiz;
assert.ok(quiz.length >= 6);
assert.equal(new Set(quiz.map((q) => q.id)).size, quiz.length);
for (const q of quiz) {
  assert.ok(q.pregunta && q.explicacion);
  assert.ok(q.opciones.length >= 2);
  assert.ok(Number.isInteger(q.correcta) && q.correcta >= 0 && q.correcta < q.opciones.length);
}
console.log('tutorialIngresosRuta.test.mjs OK');
