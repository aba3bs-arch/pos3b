import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MANUAL_LIBRO_DIARIO as M, PRACTICAS, resolverPractica } from './contenido.mjs';
import { construirHtml } from './generar-pdf.mjs';

assert.equal(new Set(M.secciones.map((s) => s.id)).size, M.secciones.length);

const conImg = M.secciones.filter((s) => s.imagen);
assert.ok(conImg.length >= 7);
for (const s of conImg) {
  assert.match(s.imagen, /^imagenes\/.+\.jpg$/);
  assert.ok(fs.existsSync(new URL(`./${s.imagen}`, import.meta.url)), `falta ${s.imagen}`);
  assert.ok(s.imagenAlt);
}

const conDialogo = M.secciones.filter((s) => s.dialogo);
assert.ok(conDialogo.length >= 9, 'secciones con globos de diálogo');
for (const s of conDialogo) {
  for (const d of s.dialogo) {
    assert.ok(d.quien && d.texto);
    assert.ok(d.lado === 'tienda' || d.lado === 'proveedor');
  }
}

const quiz = M.secciones.find((s) => s.id === 'quiz').quiz;
assert.equal(quiz.length, 14);
assert.equal(new Set(quiz.map((q) => q.id)).size, quiz.length);
for (const q of quiz) {
  assert.ok(q.pregunta && q.explicacion);
  assert.ok(Number.isInteger(q.correcta) && q.correcta >= 0 && q.correcta < q.opciones.length);
}

// Ejemplos numéricos del manual.
const ejemploCaja = 500 + 1800 - 350;
assert.equal(ejemploCaja, 1950, 'ejemplo de caja chica');
assert.equal(2000 - 350, 1650, 'ejemplo de resultado');
const [a, b, c, d] = PRACTICAS.map(resolverPractica);
assert.deepEqual(a, { entro: 2200, resultado: 1700, cajaCierre: 2100, pctAba: 800, pctVirtual: 0 });
assert.deepEqual(b, { entro: 0, resultado: -300, cajaCierre: -50, pctAba: 1000, pctVirtual: 200 });
assert.deepEqual(c, { entro: 1800, resultado: 800, cajaCierre: 1100, pctAba: 500, pctVirtual: 200 });
assert.deepEqual(d, { entro: 1700, resultado: 1700, cajaCierre: 1850, pctAba: 300, pctVirtual: 0 });

const html = construirHtml();
assert.ok(html.includes('Clave de respuestas'));
assert.ok(html.includes('CGA-00001'));
console.log('docs/manual-capacitacion-libro-diario/contenido.test.mjs OK');
