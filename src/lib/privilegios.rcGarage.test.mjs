import assert from 'node:assert/strict';
import { sanitizarPrivilegios, normalizarListaModulos } from './privilegios.js';

const conVirtual = sanitizarPrivilegios({
  porRol: { Gerente: ['Inicio', 'RC Virtual', 'IE VIRTUAL'] },
  porUsuario: { u1: ['Inicio', 'RC Virtual'] },
});
assert.ok(conVirtual.porRol.Gerente.includes('RC Garage'), 'migra RC Garage si el rol tenía RC Virtual');
assert.ok(conVirtual.porUsuario.u1.includes('RC Garage'), 'migra RC Garage si el usuario tenía RC Virtual');
assert.ok(conVirtual._migratedModulos.includes('RC Garage'));

const yaMigrado = sanitizarPrivilegios({
  porRol: { Gerente: ['Inicio', 'RC Virtual'] },
  _migratedModulos: ['Check List', 'Evaluación operativa', 'RC Garage'],
});
assert.equal(
  yaMigrado.porRol.Gerente.includes('RC Garage'),
  false,
  'no vuelve a agregar RC Garage si ya se migró y el admin lo quitó',
);

const sinVirtual = sanitizarPrivilegios({
  porRol: { Cajero: ['Inicio', 'Ventas'] },
});
assert.equal(sinVirtual.porRol.Cajero.includes('RC Garage'), false, 'cajero sin RC Virtual no recibe RC Garage');

assert.ok(normalizarListaModulos(['RC Garage']).includes('RC Garage'));

console.log('privilegios.rcGarage.test.mjs ok');
