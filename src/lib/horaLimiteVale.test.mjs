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

// Sonora wall times via Date with fixed UTC offset for Hermosillo (UTC-7)
function sonoraDate(h, m) {
  // 2026-08-26 is a valid day; construct as ISO with -07:00
  const pad = (n) => String(n).padStart(2, '0');
  return new Date(`2026-08-26T${pad(h)}:${pad(m)}:00-07:00`);
}

assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(10, 20), 'gasolina'), false, '10:20 < límite 10:45');
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(10, 45), 'gasolina'), false, '10:45 inclusive sin auth');
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(10, 46), 'gasolina'), true, '10:46 ya requiere');
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(9, 0), 'consumo'), true, 'consumo siempre');

console.log('horaLimiteVale.test.mjs ok');
