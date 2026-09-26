import assert from 'node:assert/strict';
import {
  normalizarHoraLimiteVale,
  valeRequiereAutorizacionAdmin,
  HORA_LIMITE_VALE_DEFAULT_ETIQUETA,
  guardarHoraLimiteVale,
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

// Dentro de ventana (límite 10:45) → gasolina/herramienta/accesorios sin admin
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(9, 35), 'gasolina'), false);
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(10, 20), 'gasolina'), false);
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(10, 45), 'gasolina'), false);
assert.equal(
  valeRequiereAutorizacionAdmin(sonoraDate(9, 35), 'vales', { subcategoria: 'vales-gasolina' }),
  false,
);
assert.equal(
  valeRequiereAutorizacionAdmin(sonoraDate(9, 35), 'vales', { subcategoria: 'vales-herramienta' }),
  false,
);

// Después del límite → admin
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(10, 46), 'gasolina'), true);

// Consumo siempre admin
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(9, 0), 'consumo'), true);
assert.equal(
  valeRequiereAutorizacionAdmin(sonoraDate(9, 0), 'vales', { subcategoria: 'vales-consumo' }),
  true,
);

// MAIN omite ventana para no-nómina
assert.equal(
  valeRequiereAutorizacionAdmin(sonoraDate(22, 30), 'gasolina', { origenMain: true }),
  false,
);

guardarHoraLimiteVale('09:00');
assert.equal(valeRequiereAutorizacionAdmin(sonoraDate(9, 35), 'gasolina'), true);

console.log('horaLimiteVale.test.mjs ok');
