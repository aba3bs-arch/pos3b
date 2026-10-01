import assert from 'node:assert/strict';
import {
  confirmarSucursalOperacion,
  mensajeConfirmarSucursal,
} from './confirmarSucursalOperacion.js';

const msgVale = mensajeConfirmarSucursal({
  tipo: 'vale',
  codigoSucursal: '3B5',
  sesionSucursal: '3B5',
});
assert.match(msgVale, /vale/i);
assert.match(msgVale, /3B5/);
assert.match(msgVale, />>>/);
assert.doesNotMatch(msgVale, /sesión actual/i);

const msgMain = mensajeConfirmarSucursal({
  tipo: 'pagare',
  codigoSucursal: '3B2',
  sesionSucursal: 'MAIN',
});
assert.match(msgMain, /pagaré/i);
assert.match(msgMain, /3B2/);
assert.match(msgMain, /MAIN|administración/i);

let asked = '';
const ok = confirmarSucursalOperacion({
  tipo: 'vale',
  codigoSucursal: 'FUSION',
  sesionSucursal: 'FUSION',
  confirmFn: (m) => {
    asked = m;
    return true;
  },
});
assert.equal(ok, true);
assert.match(asked, /Fusión|FUSION/i);

const no = confirmarSucursalOperacion({
  tipo: 'pagare',
  codigoSucursal: '3B7',
  confirmFn: () => false,
});
assert.equal(no, false);

console.log('confirmarSucursalOperacion.test.mjs OK');
