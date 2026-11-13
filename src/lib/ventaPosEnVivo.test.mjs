import assert from 'node:assert/strict';
import { montosVentaEnVivo, sumarVentaEnVivo, cargarVentaPosEnVivo } from './ventaPosEnVivo.js';

const m = montosVentaEnVivo({
  total: 1785,
  grupos: { efectivo: 1400, tarjeta: 288, transferencia: 97, qr: 0, otros: 0 },
  ticketsBruto: 31,
  cancelaciones: 2,
});
assert.deepEqual(m, { total: 1785, efectivo: 1400, tarjeta: 288, otros: 97, tickets: 31, cancelaciones: 2 });

const t = sumarVentaEnVivo([m, { total: 215, efectivo: 200, tarjeta: 0, otros: 15, tickets: 4, cancelaciones: 0 }]);
assert.equal(t.total, 2000);
assert.equal(t.efectivo, 1600);
assert.equal(t.tickets, 35);

const sinNada = await cargarVentaPosEnVivo(null, { sucursales: ['3B5'], fecha: '2026-11-12' });
assert.equal(sinNada.ok, false);
assert.equal(sinNada.total.total, 0);
console.log('ventaPosEnVivo.test.mjs OK');
