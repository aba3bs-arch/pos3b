import assert from 'node:assert/strict';
import {
  convieneOfrecerBiometria,
  hayBiometriaParaSucursal,
  listarCredencialesBiometricas,
  soporteBiometricoDisponible,
} from './loginBiometrico.js';

assert.equal(typeof soporteBiometricoDisponible(), 'boolean');
assert.equal(typeof convieneOfrecerBiometria(), 'boolean');
assert.deepEqual(listarCredencialesBiometricas('3B5'), []);
assert.equal(hayBiometriaParaSucursal('3B5'), false);

console.log('loginBiometrico.test.mjs ok');
