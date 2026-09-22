import assert from 'node:assert/strict';
import {
  normalizarHoraLimiteVale,
  valeRequiereAutorizacionAdmin,
  HORA_LIMITE_VALE_DEFAULT_ETIQUETA,
} from './contabilidadConstants.js';

// Stub localStorage for Node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

store.set('pos3b_hora_limite_vale', '10:45');

assert.equal(normalizarHoraLimiteVale('10:45').minutos, 10 * 60 + 45);
assert.equal(normalizarHoraLimiteVale('10:45').etiqueta, '10:45');
assert.equal(HORA_LIMITE_VALE_DEFAULT_ETIQUETA, '09:00');

function sonoraDate(h, m) {
  const pad = (n) => String(n).padStart(2, '0');
  return new Date(`2026-08-26T${pad(h)}:${pad(m)}:00-07:00`);
}

// Todos los vales requieren admin (cualquier categoría / horario / MAIN).
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(10, 20), 'gasolina'), true);
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(10, 45), 'gasolina'), true);
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(10, 46), 'gasolina'), true);
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(9, 0), 'consumo'), true);
assert.equal(
  valeRequiereAutorizacionAdmin(sonoraDate(22, 30), 'gasolina', { origenMain: true }),
  true,
  'MAIN también requiere admin',
);
assert.equal(
  valeRequiereAutorizacionAdmin(sonoraDate(22, 30), 'consumo', { origenMain: true }),
  true,
);
assert.equal(
  valeRequiereAutorizacionAdmin(sonoraDate(8, 0), 'herramienta', { omitirVentana: true }),
  true,
);

console.log('horaLimiteVale.test.mjs ok');
