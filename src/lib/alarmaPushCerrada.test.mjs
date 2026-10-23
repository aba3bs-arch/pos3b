import assert from 'node:assert/strict';
import {
  DEMORAS_REFUERZO_ASALTO_MS,
  programarRefuerzoPushAsalto,
  pushAsaltoSinReintento,
} from './webPush.js';

assert.deepEqual(DEMORAS_REFUERZO_ASALTO_MS, [12_000, 35_000]);
assert.equal(pushAsaltoSinReintento({ error: 'Faltan secrets VAPID_PRIVATE_KEY' }), true);
assert.equal(pushAsaltoSinReintento({ data: { error: 'Function not found' } }), true);
assert.equal(pushAsaltoSinReintento({ ok: false, error: 'Failed to fetch' }), false);
assert.equal(pushAsaltoSinReintento({ ok: true, data: { enviados: 2 } }), false);

const calls = [];
const timers = [];
const primero = programarRefuerzoPushAsalto(
  { ok: true },
  { id: 'n1', titulo: 'ASALTO EN PROCESO', modo: 'asalto' },
  {
    enviar: (_sb, payload) => { calls.push(payload); },
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clear: () => {},
  },
);
assert.equal(primero.veces, 2);
assert.deepEqual(timers.map((t) => t.ms), [12_000, 35_000]);
timers.forEach((t) => t.fn());
assert.equal(calls.length, 2);
assert.equal(calls[0].refuerzo, true);
assert.equal(calls[0].id, 'n1');
assert.equal(calls[0].modo, 'asalto');
assert.equal(calls[1].refuerzo, true);

let cleared = 0;
programarRefuerzoPushAsalto({ ok: true }, { id: 'n1' }, {
  enviar: () => {},
  schedule: () => 'nuevo',
  clear: () => { cleared += 1; },
});
assert.equal(cleared, 2);
assert.equal(programarRefuerzoPushAsalto(null, { id: 'x' }).ok, false);

console.log('alarmaPushCerrada.test OK');
