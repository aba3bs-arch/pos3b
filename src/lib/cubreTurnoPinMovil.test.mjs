import assert from 'node:assert/strict';
import {
  construirUsuarioCtMovil,
  generarPinMovilCt,
} from './cubreTurnoPinMovil.js';

const pin = generarPinMovilCt();
assert.equal(typeof pin, 'string');
assert.match(pin, /^\d{4,6}$/);

const u = construirUsuarioCtMovil({
  id: 'rh-ct-1',
  nombre: 'Ana',
  apellidos: 'López',
  telefono: '3312345678',
  sucursal_id: 'FUSION',
  extras: { ct_dispositivo_id: 'dev-abc' },
});
assert.equal(u.esCtMovil, true);
assert.equal(u.esCubreTurno, true);
assert.equal(u.ctRhId, 'rh-ct-1');
assert.equal(u.rol, 'Cajero');
assert.equal(u.dispositivo_id, 'dev-abc');
assert.match(u.nombre, /Ana/);

console.log('cubreTurnoPinMovil.test.mjs ok');
