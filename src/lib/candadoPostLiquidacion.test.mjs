import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  CANDADO_POST_LIQUIDACION_DEFAULT,
  etiquetaCandadoPostLiquidacion,
  guardarCandadoPostLiquidacion,
  leerCandadoPostLiquidacion,
} from './candadoPostLiquidacion.js';

const LS = 'pos3b_candado_post_liquidacion';

describe('candadoPostLiquidacion', () => {
  beforeEach(() => {
    globalThis.localStorage = {
      _m: new Map(),
      getItem(k) {
        return this._m.has(k) ? this._m.get(k) : null;
      },
      setItem(k, v) {
        this._m.set(k, String(v));
      },
      removeItem(k) {
        this._m.delete(k);
      },
    };
  });

  it('default ON cuando no hay valor', () => {
    assert.equal(leerCandadoPostLiquidacion(), CANDADO_POST_LIQUIDACION_DEFAULT);
    assert.equal(CANDADO_POST_LIQUIDACION_DEFAULT, true);
  });

  it('guarda y lee OFF / ON', () => {
    assert.equal(guardarCandadoPostLiquidacion(false), false);
    assert.equal(leerCandadoPostLiquidacion(), false);
    assert.equal(guardarCandadoPostLiquidacion(true), true);
    assert.equal(leerCandadoPostLiquidacion(), true);
  });

  it('acepta legacy string false/true', () => {
    localStorage.setItem(LS, 'false');
    assert.equal(leerCandadoPostLiquidacion(), false);
    localStorage.setItem(LS, 'true');
    assert.equal(leerCandadoPostLiquidacion(), true);
  });

  it('etiqueta legible', () => {
    assert.match(etiquetaCandadoPostLiquidacion(true), /ON/);
    assert.match(etiquetaCandadoPostLiquidacion(false), /OFF/);
  });
});
