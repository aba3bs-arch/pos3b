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

// ── Alta frecuencia y orden ──
import {
  descripcionFrecuencia,
  frecuenciaVentas,
  ordenarLineasCompra,
} from './comprasRecomendacion.js';
{
  const dias = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];
  const diario = Object.fromEntries(dias.map((d) => [d, 1]));
  const f1 = frecuenciaVentas(diario, dias);
  assert.equal(f1.diasConVenta, 7);
  assert.equal(f1.altaFrecuencia, true);
  assert.equal(f1.ventaDiaria, 1);

  // 5 de 7 días = 71% → alta; 4 de 7 = 57% → no.
  assert.equal(frecuenciaVentas({ [dias[0]]: 2, [dias[1]]: 2, [dias[2]]: 2, [dias[3]]: 2, [dias[4]]: 2 }, dias).altaFrecuencia, true);
  assert.equal(frecuenciaVentas({ [dias[0]]: 9, [dias[1]]: 9, [dias[2]]: 9, [dias[3]]: 9 }, dias).altaFrecuencia, false);
  // Un solo día de ventas enormes no es frecuencia.
  assert.equal(frecuenciaVentas({ [dias[6]]: 30 }, dias).altaFrecuencia, false);
  // Periodo demasiado corto: no se marca.
  assert.equal(frecuenciaVentas({ [dias[0]]: 5 }, [dias[0]]).altaFrecuencia, false);
  assert.equal(frecuenciaVentas({}, []).altaFrecuencia, false);
  assert.equal(descripcionFrecuencia(f1), 'Vendió en 7 de 7 días · 1 pz/día');

  const lineas = [
    { id: 'galle', nombre: 'Galletas' },
    { id: 'refre', nombre: 'Refresco' },
    { id: 'pan', nombre: 'Pan' },
    { id: 'pico', nombre: 'Producto de fiesta' },
    { id: 'cero', nombre: 'Alfa sin ventas' },
  ];
  const metricas = {
    refre: frecuenciaVentas(diario, dias),
    pan: frecuenciaVentas(Object.fromEntries(dias.map((d) => [d, 8])), dias),
    galle: frecuenciaVentas({ [dias[0]]: 1, [dias[3]]: 1 }, dias),
    pico: frecuenciaVentas({ [dias[6]]: 30 }, dias),
    cero: frecuenciaVentas({}, dias),
  };
  const ids = (modo, recs = {}) => ordenarLineasCompra(lineas, { modo, metricas, recomendaciones: recs }).map((l) => l.id);
  // Estrellas primero (pan 8/día antes que refresco 1/día); luego el resto por venta diaria.
  assert.deepEqual(ids('frecuencia'), ['pan', 'refre', 'pico', 'galle', 'cero']);
  assert.deepEqual(ids('nombre'), ['cero', 'galle', 'pan', 'pico', 'refre']);
  // «Por pedir primero»: los que hay que pedir arriba, y dentro de cada grupo por frecuencia.
  assert.deepEqual(ids('pedir', { galle: { pedir: 3 }, pan: { pedir: 0 } }), ['galle', 'pan', 'refre', 'pico', 'cero']);
  // No muta el arreglo original.
  assert.equal(lineas[0].id, 'galle');
}
console.log('orden alta frecuencia OK');
