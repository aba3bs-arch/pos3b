import assert from 'node:assert/strict';
import {
  GRACIA_PIN_TEMPORAL_CT_MIN,
  estimarFinTurnoCt,
  ventanaPinParaFecha,
  pinTemporalCtActivo,
  pinTemporalCtVisible,
  ymdHermosillo,
  normalizarFechaYmd,
} from './cubreSolicitudes.js';

assert.equal(GRACIA_PIN_TEMPORAL_CT_MIN, 60);
assert.equal(normalizarFechaYmd('2026-09-11T00:00:00.000Z'), '2026-09-11');
assert.equal(ymdHermosillo(new Date('2026-09-12T06:30:00.000Z')), '2026-09-11'); // 23:30 Sonora día 11

// Fin de turno anclado a Sonora (-07), no a la zona del proceso.
const finTarde = estimarFinTurnoCt('2026-09-11', 'tarde', 'Tarde');
assert.equal(finTarde.toISOString(), '2026-09-12T05:00:00.000Z'); // 22:00 -07

const v = ventanaPinParaFecha('2026-09-11', 'tarde', 'Tarde');
const hasta = new Date(v.pin_valido_hasta);
assert.equal(hasta.getTime(), finTarde.getTime() + 60 * 60 * 1000);
assert.equal(hasta.toISOString(), '2026-09-12T06:00:00.000Z'); // 23:00 -07

const base = {
  estado: 'aceptada',
  pin_temporal: '4827',
  fecha: '2026-09-11',
  turno_id: 'tarde',
  pin_valido_desde: v.pin_valido_desde,
  pin_valido_hasta: v.pin_valido_hasta,
};

assert.equal(pinTemporalCtActivo(base, new Date('2026-09-11T20:00:00-07:00')), true);
assert.equal(pinTemporalCtVisible(base, new Date('2026-09-11T20:00:00-07:00')), true);
assert.equal(pinTemporalCtActivo(base, new Date('2026-09-11T23:30:00-07:00')), false);
assert.equal(pinTemporalCtVisible(base, new Date('2026-09-11T23:30:00-07:00')), false);
assert.equal(pinTemporalCtActivo({ ...base, estado: 'solicitada' }, new Date('2026-09-11T20:00:00-07:00')), false);
assert.equal(pinTemporalCtActivo({ ...base, pin_temporal: '' }, new Date('2026-09-11T20:00:00-07:00')), false);

// Cumplida con PIN vigente: sigue usable en caja
assert.equal(pinTemporalCtVisible({ ...base, estado: 'cumplida' }, new Date('2026-09-11T20:00:00-07:00')), true);
assert.equal(pinTemporalCtActivo({ ...base, estado: 'cumplida' }, new Date('2026-09-11T20:00:00-07:00')), true);

// Fecha futura: se VE en pantalla (para anotar), pero aún no sirve en caja
const futuro = {
  ...base,
  fecha: '2099-06-01',
  ...ventanaPinParaFecha('2099-06-01', 'tarde', 'Tarde'),
};
assert.equal(pinTemporalCtVisible(futuro, new Date('2026-09-11T12:00:00-07:00')), true);
assert.equal(pinTemporalCtActivo(futuro, new Date('2026-09-11T12:00:00-07:00')), false);

const finNoche = estimarFinTurnoCt('2026-09-11', 'noche', 'Nocturno');
assert.equal(finNoche.toISOString(), '2026-09-12T13:00:00.000Z'); // 06:00 -07 del día 12

console.log('cubreSolicitudes.pinTemporal.test.mjs ok');
