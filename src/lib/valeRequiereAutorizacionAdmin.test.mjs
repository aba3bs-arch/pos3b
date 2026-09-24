import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    store.set(k, String(v));
  },
  removeItem: (k) => {
    store.delete(k);
  },
};

const {
  guardarHoraLimiteVale,
  valeRequiereAutorizacionAdmin,
} = await import('./contabilidadConstants.js');

guardarHoraLimiteVale('09:00');

// Consumo siempre admin
assert.equal(valeRequiereAutorizacionAdmin(new Date('2026-09-24T08:00:00-07:00'), 'consumo'), true);
assert.equal(
  valeRequiereAutorizacionAdmin(new Date('2026-09-24T08:00:00-07:00'), 'vales', { subcategoria: 'vales-consumo' }),
  true,
);

// Gasolina dentro de ventana (antes/igual a 09:00 Sonora) → sin admin
assert.equal(
  valeRequiereAutorizacionAdmin(new Date('2026-09-24T08:30:00-07:00'), 'gasolina'),
  false,
);
assert.equal(
  valeRequiereAutorizacionAdmin(new Date('2026-09-24T09:00:00-07:00'), 'vales', { subcategoria: 'vales-gasolina' }),
  false,
);

// Gasolina después de la hora límite → admin
assert.equal(
  valeRequiereAutorizacionAdmin(new Date('2026-09-24T09:01:00-07:00'), 'gasolina'),
  true,
);

// MAIN omite ventana
assert.equal(
  valeRequiereAutorizacionAdmin(new Date('2026-09-24T15:00:00-07:00'), 'herramienta', { origenMain: true }),
  false,
);

guardarHoraLimiteVale('10:45');
assert.equal(
  valeRequiereAutorizacionAdmin(new Date('2026-09-24T10:45:00-07:00'), 'gasolina'),
  false,
);
assert.equal(
  valeRequiereAutorizacionAdmin(new Date('2026-09-24T10:46:00-07:00'), 'gasolina'),
  true,
);

console.log('valeRequiereAutorizacionAdmin.test.mjs OK');
