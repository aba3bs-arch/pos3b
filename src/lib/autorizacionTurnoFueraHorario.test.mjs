import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
};

const {
  rolPuedeAutorizarFueraHorario,
  otorgarAutorizacionFueraHorario,
  tieneAutorizacionFueraHorario,
  revocarAutorizacionFueraHorario,
} = await import('./autorizacionTurnoFueraHorario.js');

assert.equal(rolPuedeAutorizarFueraHorario('Administrador'), true);
assert.equal(rolPuedeAutorizarFueraHorario('administrador'), true);
assert.equal(rolPuedeAutorizarFueraHorario('Gerente'), true);
assert.equal(rolPuedeAutorizarFueraHorario('Cajero'), false);
assert.equal(rolPuedeAutorizarFueraHorario('Supervisor'), false);
assert.equal(rolPuedeAutorizarFueraHorario('Repartidor'), false);

const user = { id: 'u-cajero-1', nombre: 'Cajero Test' };
const admin = { id: 'u-admin-1', nombre: 'Admin Test' };
const suc = '3B5';

revocarAutorizacionFueraHorario(user.id, suc);
assert.equal(tieneAutorizacionFueraHorario(user, suc), false);

const entry = otorgarAutorizacionFueraHorario({
  usuarioId: user.id,
  sucursal: suc,
  admin,
  duracionMs: 60 * 60 * 1000,
});
assert.ok(entry);
assert.equal(tieneAutorizacionFueraHorario(user, suc), true);
assert.equal(tieneAutorizacionFueraHorario(user, 'FUSION'), false);

revocarAutorizacionFueraHorario(user.id, suc);
assert.equal(tieneAutorizacionFueraHorario(user, suc), false);

console.log('autorizacionTurnoFueraHorario.test.mjs OK');
