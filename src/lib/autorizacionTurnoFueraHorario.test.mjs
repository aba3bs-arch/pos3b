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
  expiracionLocalDesdeServidor,
  aplicarAutorizacionEnEquipo,
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

const entry = await otorgarAutorizacionFueraHorario({
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

// Reloj de la caja adelantado: el servidor aún tiene vigente la fila,
// pero expira_en ya quedó atrás en el reloj local.
const otorgado = Date.parse('2026-11-03T15:41:12.822Z');
const expira = Date.parse('2026-11-03T19:41:12.822Z');
const relojAdelantado = Date.parse('2026-11-03T22:41:12.822Z');
const anclada = expiracionLocalDesdeServidor(otorgado, expira, relojAdelantado);
assert.equal(anclada - relojAdelantado, 4 * 60 * 60 * 1000);
assert.equal(expiracionLocalDesdeServidor(otorgado, expira, Date.parse('2026-11-03T16:00:00.000Z')), expira);

const fusion = { id: 'u-fusion', nombre: 'Caja Fusión' };
revocarAutorizacionFueraHorario(fusion.id, 'FUSION');
const guardada = aplicarAutorizacionEnEquipo({
  usuarioId: fusion.id,
  sucursal: 'Fusión',
  adminNombre: 'AMR',
  otorgadoEn: otorgado,
  expiraEn: expira,
});
assert.ok(guardada);
assert.equal(tieneAutorizacionFueraHorario(fusion, 'FUSION'), true);
assert.equal(tieneAutorizacionFueraHorario(fusion, 'Fusion'), true);

const originalSet = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = () => {
  throw new Error('quota');
};
const sinDisco = { id: 'u-quota', nombre: 'Sin disco' };
revocarAutorizacionFueraHorario(sinDisco.id, '3B10');
globalThis.localStorage.setItem = () => {
  throw new Error('quota');
};
const entryQuota = await otorgarAutorizacionFueraHorario({
  usuarioId: sinDisco.id,
  sucursal: '3B10',
  admin,
  duracionMs: 2 * 60 * 60 * 1000,
});
assert.ok(entryQuota);
assert.equal(tieneAutorizacionFueraHorario(sinDisco, '3B10'), true);
globalThis.localStorage.setItem = originalSet;

console.log('autorizacionTurnoFueraHorario.test.mjs OK');
