import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

const {
  autenticarConBiometria,
  convieneOfrecerBiometria,
  esErrorSinLlaveAcceso,
  hayBiometriaParaSucursal,
  listarCredencialesBiometricas,
  marcarOfertaBiometriaRespondida,
  registrarBiometriaTrasLogin,
  soporteBiometricoDisponible,
  yaSeOfrecioBiometria,
} = await import('./loginBiometrico.js');

assert.equal(typeof soporteBiometricoDisponible(), 'boolean');
assert.equal(typeof convieneOfrecerBiometria(), 'boolean');
assert.deepEqual(listarCredencialesBiometricas('3B5'), []);
assert.equal(hayBiometriaParaSucursal('3B5'), false);

assert.equal(esErrorSinLlaveAcceso({ message: 'No hay llave de acceso disponible' }), true);
assert.equal(esErrorSinLlaveAcceso({ message: 'No hay llaves de acceso disponibles' }), true);
assert.equal(esErrorSinLlaveAcceso({ message: 'User cancelled' }), false);
assert.equal(esErrorSinLlaveAcceso({ message: 'The operation either timed out or was not allowed.' }), false);

// Oferta de configuración: rechazar no se repite; aceptar sin credencial sí permite reintento.
assert.equal(yaSeOfrecioBiometria('u-test', '3B5'), false);
marcarOfertaBiometriaRespondida('u-test', '3B5', 'rechazada');
assert.equal(yaSeOfrecioBiometria('u-test', '3B5'), true);
marcarOfertaBiometriaRespondida('u-test', '3B5', 'aceptada');
// Sin credencial real, "aceptada" sola no bloquea (permite reintentar tras fallo de llave).
assert.equal(yaSeOfrecioBiometria('u-test', '3B5'), false);

// En Node (sin UA móvil): no conviene ofrecer biometría.
assert.equal(convieneOfrecerBiometria(), false);

const regDesktop = await registrarBiometriaTrasLogin({
  user: { id: 'u1', nombre: 'Test' },
  sucursal: '3B5',
});
assert.equal(regDesktop.ok, false);
assert.match(String(regDesktop.error || ''), /teléfonos|móvil|iPhone|Android/i);

const authDesktop = await autenticarConBiometria('3B5');
assert.equal(authDesktop.ok, false);
assert.match(String(authDesktop.error || ''), /teléfonos|móvil|iPhone|Android/i);

console.log('loginBiometrico.test.mjs ok');
