import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TUTORIAL_BONOS as T } from './tutorialBonos.js';
import { TUTORIALES } from './tutoriales.js';

assert.equal(T.id, 'bonos-recoleccion');
assert.ok(TUTORIALES.includes(T), 'registrado en el módulo Tutorial');
assert.equal(new Set(TUTORIALES.map((t) => t.id)).size, TUTORIALES.length, 'ids de tutorial únicos');
assert.equal(new Set(T.secciones.map((s) => s.id)).size, T.secciones.length, 'ids de sección únicos');
assert.ok(T.secciones.length >= 6);

for (const s of T.secciones) {
  assert.match(s.imagen, /^\/tutorial-bonos\/bonos-\d{2}-.+\.jpg$/);
  assert.ok(fs.existsSync(new URL(`../../public${s.imagen}`, import.meta.url)), `falta ${s.imagen}`);
  assert.ok(s.imagenAlt);
  assert.ok(s.cuerpo.length >= 3);
}

const quiz = T.secciones.find((s) => s.id === 'resumen').quiz;
assert.ok(quiz.length >= 6);
assert.equal(new Set(quiz.map((q) => q.id)).size, quiz.length);
for (const q of quiz) {
  assert.ok(q.pregunta && q.explicacion);
  assert.ok(q.opciones.length >= 2);
  assert.ok(Number.isInteger(q.correcta) && q.correcta >= 0 && q.correcta < q.opciones.length);
}

const alerta = T.secciones.find((s) => s.id === 'alerta');
assert.ok(alerta.cuerpo.some((l) => l.includes('N/B')));
assert.ok(alerta.cuerpo.some((l) => l.includes('11/21')));

console.log('tutorialBonos.test.mjs OK');
