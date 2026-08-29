import assert from 'node:assert/strict';
import {
  convieneOfrecerBiometria,
  hayBiometriaParaSucursal,
  listarCredencialesBiometricas,
  marcarOfertaBiometriaRespondida,
  soporteBiometricoDisponible,
  yaSeOfrecioBiometria,
} from './loginBiometrico.js';

assert.equal(typeof soporteBiometricoDisponible(), 'boolean');
assert.equal(typeof convieneOfrecerBiometria(), 'boolean');
assert.deepEqual(listarCredencialesBiometricas('3B5'), []);
assert.equal(hayBiometriaParaSucursal('3B5'), false);

// Oferta de configuración: rechazar no se repite; aceptar sin credencial sí permite reintento.
assert.equal(yaSeOfrecioBiometria('u-test', '3B5'), false);
marcarOfertaBiometriaRespondida('u-test', '3B5', 'rechazada');
assert.equal(yaSeOfrecioBiometria('u-test', '3B5'), true);
marcarOfertaBiometriaRespondida('u-test', '3B5', 'aceptada');
// Sin credencial real, "aceptada" sola no bloquea (permite reintentar tras fallo de llave).
assert.equal(yaSeOfrecioBiometria('u-test', '3B5'), false);

console.log('loginBiometrico.test.mjs ok');
