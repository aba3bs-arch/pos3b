import assert from 'node:assert/strict';
import {
  diaSemanaDeYmd,
  diasHastaSiguienteVisita,
  diasParaPromedio,
  horizonteDesdeCalendario,
  recomendarPedido,
  sumarDiasYmd,
  textoRecomendacion,
  ventaDiariaPromedio,
} from './comprasRecomendacion.js';
import { sugerirQtyPedido } from './comprasPedido.js';

// 2026-11-10 es martes.
assert.equal(diaSemanaDeYmd('2026-11-10'), 2);
assert.equal(diaSemanaDeYmd('2026-11-15'), 7);
assert.equal(sumarDiasYmd('2026-11-30', 1), '2026-12-01');

// Visitas martes, jueves y sábado: hoy martes → la siguiente es el jueves (2 días).
const visitas = [2, 4, 6];
assert.deepEqual(diasHastaSiguienteVisita(visitas, 2), { dias: 2, diaSemana: 4 });
assert.deepEqual(diasHastaSiguienteVisita(visitas, 6), { dias: 3, diaSemana: 2 });
assert.deepEqual(diasHastaSiguienteVisita([3], 3), { dias: 7, diaSemana: 3 });
assert.equal(diasHastaSiguienteVisita([], 3), null);

// Martes → jueves cuenta martes, miércoles y jueves = 3 días.
const h = horizonteDesdeCalendario(visitas, 2);
assert.equal(h.diasACubrir, 3);
assert.equal(h.origen, 'calendario');
assert.equal(horizonteDesdeCalendario([], 2).diasACubrir, 7);
assert.equal(horizonteDesdeCalendario([], 2).origen, 'sin_calendario');

// Caso del encargado: el Sugerido dice 12, hay 8 en inventario y se vende 1 por día en 3 días.
const ventas = Object.fromEntries(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].map((d) => [d, 1]));
const dias = diasParaPromedio('2026-11-03', '2026-11-10', '2026-11-10');
assert.equal(dias.length, 7, 'hoy (incompleto) no entra al promedio');
assert.equal(ventaDiariaPromedio(ventas, dias), 1);
const rec = recomendarPedido({ stock: 8, ventaDiaria: 1, diasACubrir: h.diasACubrir, sugerido: 12 });
assert.equal(rec.necesario, 3);
assert.equal(rec.pedir, 0);
assert.equal(rec.accion, 'no_pedir');
assert.equal(rec.diasAlcanza, 8);
assert.equal(rec.ahorroVsSugerido, 12);
assert.deepEqual(textoRecomendacion(rec), { principal: 'NO PEDIR', detalle: 'alcanza 8 días' });

// Con 2 en inventario sí hay que pedir lo que falta (3 − 2 = 1).
const rec2 = recomendarPedido({ stock: 2, ventaDiaria: 1, diasACubrir: 3 });
assert.equal(rec2.accion, 'pedir');
assert.equal(rec2.pedir, 1);
assert.equal(textoRecomendacion(rec2).principal, 'PEDIR 1');

// Producto estrella: 8 al día, 3 en inventario, 3 días a cubrir.
assert.equal(recomendarPedido({ stock: 3, ventaDiaria: 8, diasACubrir: 3 }).pedir, 21);
// Colchón de 1 día.
assert.equal(recomendarPedido({ stock: 3, ventaDiaria: 8, diasACubrir: 3, colchonDias: 1 }).pedir, 29);
// Redondeo hacia arriba y sin ventas.
assert.equal(recomendarPedido({ stock: 0, ventaDiaria: 0.4, diasACubrir: 3 }).pedir, 2);
const sin = recomendarPedido({ stock: 5, ventaDiaria: 0, diasACubrir: 3 });
assert.equal(sin.accion, 'no_pedir');
assert.equal(sin.sinVentas, true);
assert.equal(textoRecomendacion(sin).detalle, 'sin ventas');
// Inventario negativo se trata como cero.
assert.equal(recomendarPedido({ stock: -4, ventaDiaria: 1, diasACubrir: 3 }).pedir, 3);

// El Sugerido real del sistema suele ser mayor que lo necesario en un producto lento.
assert.ok(sugerirQtyPedido({ stock: 2 }, 8, 7) > recomendarPedido({ stock: 2, ventaDiaria: 1, diasACubrir: 3 }).pedir);

// Periodo de un solo día: se conserva (no se excluye hoy).
assert.deepEqual(diasParaPromedio('2026-11-10', '2026-11-10', '2026-11-10'), ['2026-11-10']);
console.log('comprasRecomendacion.test.mjs OK');
