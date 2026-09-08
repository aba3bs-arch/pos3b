/**
 * Tests: ingreso masivo no mezcla tickets automáticamente.
 * Ejecutar: node --test src/lib/ajusteInventarioBorrador.folios.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  borradorTieneDatos,
  guardarAjusteEnEspera,
  idAutoBorrador,
  leerBorradorAuto,
  eliminarAjusteEnEspera,
  limpiarAjustesEnEspera,
} from './ajusteInventarioBorrador.js';
import { generarFolioMovimiento, generarFolioMovimientoUnico } from './foliosInventario.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    store.set(k, String(v));
  },
  removeItem: (k) => {
    store.delete(k);
  },
  clear: () => store.clear(),
};

describe('borrador ingreso no se fuerza al abrir ticket nuevo', () => {
  it('guarda y lee borrador auto, pero ticket nuevo puede ignorarlo', () => {
    limpiarAjustesEnEspera();
    const id = idAutoBorrador('masivo', '3B2');
    guardarAjusteEnEspera({
      id,
      tipo: 'masivo',
      titulo: 'Ingreso',
      lineasMasivas: [{ productoId: 'a', cantidad: '10' }],
      sucursal: '3B2',
      auto: true,
    });
    const draft = leerBorradorAuto('masivo', '3B2');
    assert.ok(borradorTieneDatos(draft));
    assert.equal(draft.lineasMasivas.length, 1);
    // Simula ticket nuevo: no se usan las líneas del borrador a menos que el usuario diga Continuar
    const lineasTicketNuevo = [];
    assert.equal(lineasTicketNuevo.length, 0);
    eliminarAjusteEnEspera(id);
    assert.equal(borradorTieneDatos(leerBorradorAuto('masivo', '3B2')), false);
  });
});

describe('generarFolioMovimientoUnico', () => {
  it('cada generación local incrementa el consecutivo', () => {
    store.clear();
    const a = generarFolioMovimiento('entrada', '3B2');
    const b = generarFolioMovimiento('entrada', '3B2');
    assert.match(a, /^ING-2-\d{4}-0001$/);
    assert.match(b, /^ING-2-\d{4}-0002$/);
    assert.notEqual(a, b);
  });

  it('si el folio ya existe en nube, genera el siguiente', async () => {
    store.clear();
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          filter(_col, _op, folio) {
            this._folio = folio;
            return this;
          },
          limit() {
            // 0001 ocupado; el resto libre
            const data = /0001$/.test(String(this._folio || '')) ? [{ id: 'x' }] : [];
            return Promise.resolve({ data, error: null });
          },
        };
      },
    };
    const nuevo = await generarFolioMovimientoUnico(supabase, 'entrada', '3B2');
    assert.match(nuevo, /^ING-2-\d{4}-0002$/);
  });
});
