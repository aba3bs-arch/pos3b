import test from 'node:test';
import assert from 'node:assert/strict';
import {
  huellaGastoCorte,
  MODULOS_CORTE,
  etiquetaModuloCorte,
  gastoLigadoAOtroFolioCompra,
} from './store.js';

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

test('gasto de otra compra (otro CMP) no cuenta como duplicado de esta compra', () => {
  const previo = { comentario: 'COMPRA VENTA EN RUTA · CMP-FUS-AAAA1111-E · VENTA EN RUTA' };
  assert.equal(gastoLigadoAOtroFolioCompra(previo, 'CMP-FUS-BBBB2222-E'), true);
  assert.equal(gastoLigadoAOtroFolioCompra(previo, 'CMP-FUS-AAAA1111'), false);
  assert.equal(gastoLigadoAOtroFolioCompra(previo, 'CMP-FUS-AAAA1111-E'), false);
});

test('gasto manual sin folio sigue contando como duplicado', () => {
  assert.equal(gastoLigadoAOtroFolioCompra({ comentario: 'otros' }, 'CMP-FUS-BBBB2222-E'), false);
  assert.equal(gastoLigadoAOtroFolioCompra({ comentario: 'x' }, null), false);
});
