import assert from 'node:assert/strict';
import {
  claveCorreccionLinea,
  podarMapaCorrecciones,
  guardarCorreccionLineaInventario,
  leerCorreccionesLineasInventario,
} from './conteoDepartamento.js';

const LS = 'pos3b_correcciones_lineas_inventario';

function mockLocalStorage({ failUntil = 0 } = {}) {
  const store = new Map();
  let failsLeft = failUntil;
  globalThis.localStorage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      if (failsLeft > 0) {
        failsLeft -= 1;
        const err = new Error('Setting the value exceeded the quota.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
  };
  return store;
}

{
  const map = {};
  for (let i = 0; i < 50; i++) {
    map[`k${i}`] = { updated_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`, codigo: String(i) };
  }
  const podado = podarMapaCorrecciones(map, 10);
  assert.equal(Object.keys(podado).length, 10);
  assert.ok(podado.k49 || podado.k48); // recientes
}

{
  mockLocalStorage();
  localStorage.removeItem(LS);
  const r = guardarCorreccionLineaInventario({
    folio: 'AJU-1',
    sucursal: '3B2',
    codigo: 'P1',
    nombre: 'Prod',
    existencia: 5,
    contada: 4,
    diferencia: -1,
    precioVenta: 10,
    valorDiferencia: 10,
    estado: 'faltante',
    folio_correccion: 'AJU-2',
    corregido_por: 'Ana',
    nota: 'ok',
  });
  assert.equal(r.ok, true);
  assert.equal(r.entry.codigo, 'P1');
  const key = claveCorreccionLinea('AJU-1', '3B2', 'P1');
  const map = leerCorreccionesLineasInventario();
  assert.ok(map[key]);
  assert.equal(map[key].contada, 4);
}

{
  // Primera escritura falla por cuota → poda emergencia y reintenta
  mockLocalStorage({ failUntil: 1 });
  const r = guardarCorreccionLineaInventario({
    folio: 'AJU-9',
    sucursal: 'MAIN',
    codigo: 'X',
    nombre: 'X',
    contada: 1,
    diferencia: 0,
  });
  assert.equal(r.ok, true);
  assert.ok(r.aviso);
  const map = leerCorreccionesLineasInventario();
  assert.ok(Object.keys(map).length >= 1);
}

console.log('conteoDepartamento.correccionesQuota.test.mjs OK');
