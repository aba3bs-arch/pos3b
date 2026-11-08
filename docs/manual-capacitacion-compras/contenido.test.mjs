import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MANUAL_CAPACITACION_COMPRAS as M, PRACTICAS, resolverPractica } from './contenido.mjs';
import { sugerirQtyPedido } from '../../src/lib/comprasPedido.js';

assert.equal(new Set(M.secciones.map((s) => s.id)).size, M.secciones.length);

const conImg = M.secciones.filter((s) => s.imagen);
assert.ok(conImg.length >= 7);
for (const s of conImg) {
  assert.match(s.imagen, /^imagenes\/.+\.jpg$/);
  assert.ok(fs.existsSync(new URL(`./${s.imagen}`, import.meta.url)), `falta ${s.imagen}`);
  assert.ok(s.imagenAlt);
}

const conDialogo = M.secciones.filter((s) => s.dialogo);
assert.ok(conDialogo.length >= 8, 'secciones con globos de diálogo');
for (const s of conDialogo) {
  for (const d of s.dialogo) {
    assert.ok(d.quien && d.texto);
    assert.ok(d.lado === 'tienda' || d.lado === 'proveedor');
  }
}
assert.ok(conDialogo.some((s) => s.dialogo.some((d) => d.lado === 'proveedor')));

const quiz = M.secciones.find((s) => s.id === 'quiz').quiz;
assert.equal(quiz.length, 12);
assert.equal(new Set(quiz.map((q) => q.id)).size, quiz.length);
for (const q of quiz) {
  assert.ok(q.pregunta && q.explicacion);
  assert.ok(Number.isInteger(q.correcta) && q.correcta >= 0 && q.correcta < q.opciones.length);
}

// Los Sugeridos citados en los ejemplos del manual deben coincidir con la fórmula real.
assert.equal(sugerirQtyPedido({ stock: 10 }, 8, 18), 13, 'ejemplo A');
assert.equal(sugerirQtyPedido({ stock: 3 }, 8, 56), 33, 'ejemplo B');
assert.equal(sugerirQtyPedido({ stock: 5 }, 8, 42), 26, 'ejemplo C');
assert.equal(sugerirQtyPedido({ stock: 20 }, 8, 0), 0, 'ejemplo D');

// Aritmética de las respuestas numéricas.
const pedir = (ventas, teorico, diasSurtido, colchon = 2) =>
  Math.round(((ventas.reduce((a, b) => a + b, 0) / ventas.length) * (diasSurtido + colchon) - teorico) * 100) / 100;
assert.equal(Math.round(pedir([2, 3, 2, 4, 3, 2, 2], 10, 3)), 3, 'ejemplo A: pedir 3');
assert.equal(Math.round(pedir([6, 8, 7, 9, 8, 10, 8], 3, 3)), 37, 'ejemplo B: pedir 37');
assert.equal(pedir([2, 2, 2, 2, 2, 2], 5, 2), 3, 'ejemplo C sin pico: pedir 3');
assert.equal(pedir([2, 2, 2, 2, 2, 2, 30], 5, 2), 19, 'con pico saldría 19');
assert.equal(pedir([2, 2, 2, 2, 2, 2, 2], 6, 3), 4, 'q6: pedir 4');
const [p1, p2, p3] = PRACTICAS.map(resolverPractica);
assert.equal(p1.pedir, 9, 'práctica 1');
assert.equal(p2.pedir, 14, 'práctica 2');
assert.equal(p3.pedir, 0, 'práctica 3 (sin pico)');
assert.ok(p2.cobertura < 1, 'práctica 2: menos de un día de cobertura');
console.log('docs/manual-capacitacion-compras/contenido.test.mjs OK');
