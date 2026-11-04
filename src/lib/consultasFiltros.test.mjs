import assert from 'node:assert/strict';
import test from 'node:test';
import { ajustarRango, coincideBusqueda, normalizarBusqueda, ymdHaceDias, ymdLocal } from './consultasFiltros.js';

test('búsqueda sin acentos ni mayúsculas, palabras en cualquier orden', () => {
  assert.equal(normalizarBusqueda('  Ramírez '), 'ramirez');
  assert.equal(coincideBusqueda(['Ángela Ramírez', 'ING-100'], 'angela ing'), true);
  assert.equal(coincideBusqueda('Luis Ramos', 'ramirez'), false);
  assert.equal(coincideBusqueda('lo que sea', ''), true);
});

test('fecha local, no UTC', () => {
  const d = new Date(2026, 10, 4, 23, 30);
  assert.equal(ymdLocal(d), '2026-11-04');
  assert.equal(ymdHaceDias(7, d), '2026-10-28');
});

test('rango: desde no pasa de hasta y viceversa; vacío se ignora', () => {
  const r = { desde: '2026-11-01', hasta: '2026-11-04' };
  assert.deepEqual(ajustarRango(r, 'desde', '2026-11-10'), { desde: '2026-11-10', hasta: '2026-11-10' });
  assert.deepEqual(ajustarRango(r, 'hasta', '2026-10-20'), { desde: '2026-10-20', hasta: '2026-10-20' });
  assert.deepEqual(ajustarRango(r, 'desde', ''), r);
  assert.deepEqual(ajustarRango(r, 'hasta', '2026-11-30'), { desde: '2026-11-01', hasta: '2026-11-30' });
});
