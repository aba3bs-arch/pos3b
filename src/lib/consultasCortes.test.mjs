import assert from 'node:assert/strict';
import { desgloseCorte, totalesCortes } from './consultasCortes.js';

const pos = { grupos: { efectivo: 1000, tarjeta: 300, transferencia: 50, qr: 20, otros: 0 }, electronico: 370, efectivoEsperado: 1000 };
assert.deepEqual(desgloseCorte(pos), { efectivo: 1000, tarjeta: 300, otrosElectronicos: 70, electronico: 370, total: 1370 });

const abarrotes = { tipoCaja: 'abarrotes_tarjeta', tarjetaAbarrotes: 218, electronico: 218, grupos: { efectivo: 0, tarjeta: 218 } };
assert.deepEqual(desgloseCorte(abarrotes), { efectivo: 0, tarjeta: 218, otrosElectronicos: 0, electronico: 218, total: 218 });

assert.deepEqual(desgloseCorte({ efectivoEsperado: 500, grupos: {} }).efectivo, 500);
assert.deepEqual(desgloseCorte(null), { efectivo: 0, tarjeta: 0, otrosElectronicos: 0, electronico: 0, total: 0 });

const t = totalesCortes([pos, abarrotes, { grupos: { efectivo: 250.5, tarjeta: 0 }, electronico: 0 }]);
assert.equal(t.efectivo, 1250.5);
assert.equal(t.tarjeta, 518);
assert.equal(t.otrosElectronicos, 70);
assert.equal(t.electronico, 588);
assert.equal(t.total, 1838.5);
assert.equal(t.cortes, 3);

console.log('consultasCortes.test.mjs ok');
