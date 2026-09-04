import test from 'node:test';
import assert from 'node:assert/strict';
import { huellaGastoCorte, MODULOS_CORTE, etiquetaModuloCorte } from './store.js';

test('MODULOS_CORTE tiene los tres cortes', () => {
  assert.deepEqual(MODULOS_CORTE, ['virtual', 'abarrotes', 'garage']);
});

test('anti-duplicado solo aplica conceptualmente a Abarrotes', () => {
  assert.ok(MODULOS_CORTE.includes('abarrotes'));
  assert.equal(etiquetaModuloCorte('abarrotes'), 'Corte Abarrotes');
});

test('etiquetaModuloCorte', () => {
  assert.equal(etiquetaModuloCorte('abarrotes'), 'Corte Abarrotes');
  assert.equal(etiquetaModuloCorte('virtual'), 'Corte Virtual');
  assert.equal(etiquetaModuloCorte('garage'), 'Corte Garage');
});

test('huellaGastoCorte normaliza acentos y monto', () => {
  const a = huellaGastoCorte({
    categoria: 'Empleado',
    subcategoria: 'Consumo',
    monto: '150.10',
    usuario_id: 12,
  });
  const b = huellaGastoCorte({
    categoria: 'EMPLEADO',
    subcategoria: 'CONSUMO',
    monto: 150.1,
    usuario_id: '12',
  });
  assert.equal(a.categoria, 'EMPLEADO');
  assert.equal(a.subcategoria, 'CONSUMO');
  assert.equal(a.monto, b.monto);
  assert.equal(a.usuario_id, b.usuario_id);
});
