import assert from 'node:assert/strict';
import test from 'node:test';
import { agruparVentaPorArticulo } from './consultasUi.js';
import { coincideBusqueda } from './consultasFiltros.js';

test('agrupa Recarga 50 y Recargas 10; búsqueda recargas las encuentra', () => {
  const r = agruparVentaPorArticulo([
    {
      id: 'v1',
      articulos: [{ id: '705', nombre: 'Recarga 50', precio: 50, qty: 1 }],
    },
    {
      id: 'v2',
      articulos: [{ id: '700', nombre: 'Recargas 10', precio: 10, qty: 1 }],
    },
  ], {
    productoPorId: new Map([
      ['705', { id: '705', nombre: 'Recargas 50', cat: 'TELEFONÍA' }],
      ['700', { id: '700', nombre: 'Recargas 10', cat: 'TELEFONÍA' }],
    ]),
  });
  assert.equal(r.filas.length, 2);
  assert.equal(r.totalImporte, 60);
  const filtradas = r.filas.filter((f) => coincideBusqueda(`${f.id} ${f.nombre} ${f.departamento}`, 'recargas'));
  assert.equal(filtradas.length, 2);
  assert.ok(filtradas.some((f) => f.id === '705' && f.nombre === 'Recargas 50'));
});

test('línea sin id/código sí aparece agrupada por nombre', () => {
  const r = agruparVentaPorArticulo([
    {
      id: 'v3',
      articulos: [{ nombre: 'Recarga 50', precio: 50, qty: 1 }],
    },
  ]);
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].importe, 50);
  assert.equal(r.filas[0].nombre, 'Recarga 50');
  assert.equal(coincideBusqueda(`${r.filas[0].id} ${r.filas[0].nombre}`, 'recargas'), true);
});
