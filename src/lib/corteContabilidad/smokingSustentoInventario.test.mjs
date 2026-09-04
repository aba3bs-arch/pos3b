import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esGastoSmokingAbarrotes,
  esProveedorSmokingGasto,
  normalizarFolioSustentoSmoking,
  parseFoliosInventarioSmoking,
  aplicarMarkerSmokingComentario,
  MARKER_SMOK_INV,
} from './smokingSustentoInventario.js';

test('detecta Smoking en gasto Abarrotes', () => {
  assert.equal(
    esGastoSmokingAbarrotes('abarrotes', { categoria: 'PROVEEDORES', subcategoria: 'SMOKING' }),
    true,
  );
  assert.equal(
    esGastoSmokingAbarrotes('abarrotes', { categoria: 'PROVEEDORES', subcategoria: 'COCA COLA' }),
    false,
  );
  assert.equal(
    esGastoSmokingAbarrotes('virtual', { categoria: 'PROVEEDORES', subcategoria: 'SMOKING' }),
    false,
  );
});

test('esProveedorSmokingGasto acepta variantes', () => {
  assert.equal(esProveedorSmokingGasto({ subcategoria: 'EsmoKing' }), true);
  assert.equal(esProveedorSmokingGasto({ comentario: 'pago marlboro' }), true);
  assert.equal(esProveedorSmokingGasto({ subcategoria: 'BIMBO' }), false);
});

test('normaliza folios ING CMP trp', () => {
  assert.equal(normalizarFolioSustentoSmoking('ing-20260903-0007'), 'ING-20260903-0007');
  assert.equal(normalizarFolioSustentoSmoking('CMP-a1b2c3d4'), 'CMP-A1B2C3D4');
  assert.equal(normalizarFolioSustentoSmoking('trp-20'), 'trp-0020');
  assert.equal(normalizarFolioSustentoSmoking('trp0020'), 'trp-0020');
});

test('parseFoliosInventarioSmoking', () => {
  assert.deepEqual(parseFoliosInventarioSmoking('ING-1, CMP-2; trp-3'), ['ING-1', 'CMP-2', 'trp-3']);
});

test('aplicarMarkerSmokingComentario', () => {
  const m = `${MARKER_SMOK_INV}ING-20260903-0007`;
  assert.match(aplicarMarkerSmokingComentario('pago', m), /SMOK_INV:ING-20260903-0007/);
});
