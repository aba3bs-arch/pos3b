/**
 * Tope / folio Consultas inventario.
 * Ejecutar: node --test src/lib/consultasInventario.limite.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_MOV_NUBE_POR_TIENDA,
  LIMITE_MOV_NUBE_TODAS,
  limiteFilasMovimientosNube,
  pareceFolioInventarioConsulta,
} from './consultasInventario.js';

describe('limiteFilasMovimientosNube', () => {
  it('da más cupo por tienda que en «Todas»', () => {
    assert.equal(limiteFilasMovimientosNube({ sucursal: '3B2' }), LIMITE_MOV_NUBE_POR_TIENDA);
    assert.equal(limiteFilasMovimientosNube({}), LIMITE_MOV_NUBE_TODAS);
    assert.ok(LIMITE_MOV_NUBE_POR_TIENDA > LIMITE_MOV_NUBE_TODAS);
    assert.ok(LIMITE_MOV_NUBE_POR_TIENDA > 3000);
  });
});

describe('pareceFolioInventarioConsulta', () => {
  it('reconoce ING/RET/CMP/trp', () => {
    assert.equal(pareceFolioInventarioConsulta('ING-2-0709-0004'), true);
    assert.equal(pareceFolioInventarioConsulta('ret-5-0709-0001'), true);
    assert.equal(pareceFolioInventarioConsulta('CMP-2-AABBCCDD'), true);
    assert.equal(pareceFolioInventarioConsulta('trp-2-0004'), true);
    assert.equal(pareceFolioInventarioConsulta('coca'), false);
    assert.equal(pareceFolioInventarioConsulta(''), false);
  });
});
