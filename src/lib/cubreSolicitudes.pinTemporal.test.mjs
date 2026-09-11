import assert from 'node:assert/strict';
import {
  GRACIA_PIN_TEMPORAL_CT_MIN,
  estimarFinTurnoCt,
  ventanaPinParaFecha,
  pinTemporalCtActivo,
} from './cubreSolicitudes.js';

assert.equal(GRACIA_PIN_TEMPORAL_CT_MIN, 60);

const finTarde = estimarFinTurnoCt('2026-09-11', 'tarde', 'Tarde');
assert.equal(finTarde.getHours(), 22);

const v = ventanaPinParaFecha('2026-09-11', 'tarde', 'Tarde');
const hasta = new Date(v.pin_valido_hasta);
assert.equal(hasta.getTime(), finTarde.getTime() + 60 * 60 * 1000);

const base = {
  estado: 'aceptada',
  pin_temporal: '4827',
  fecha: '2026-09-11',
  turno_id: 'tarde',
  pin_valido_desde: v.pin_valido_desde,
  pin_valido_hasta: v.pin_valido_hasta,
};

assert.equal(pinTemporalCtActivo(base, new Date('2026-09-11T20:00:00')), true);
assert.equal(pinTemporalCtActivo(base, new Date('2026-09-11T23:30:00')), false);
assert.equal(pinTemporalCtActivo({ ...base, estado: 'solicitada' }, new Date('2026-09-11T20:00:00')), false);
assert.equal(pinTemporalCtActivo({ ...base, pin_temporal: '' }, new Date('2026-09-11T20:00:00')), false);

const finNoche = estimarFinTurnoCt('2026-09-11', 'noche', 'Nocturno');
assert.equal(finNoche.getDate(), 12);
assert.equal(finNoche.getHours(), 6);

console.log('cubreSolicitudes.pinTemporal.test.mjs ok');
