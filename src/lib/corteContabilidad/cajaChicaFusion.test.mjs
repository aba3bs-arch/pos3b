import assert from 'node:assert/strict';
import {
  cajaAnteriorDesdeFilasCierre,
  sucursalIdCorte,
  sucursalesIdCorteQuery,
} from './store.js';

assert.equal(sucursalIdCorte('Fusión'), 'FUSION');
assert.equal(sucursalIdCorte('FUSIÓN'), 'FUSION');
assert.equal(sucursalIdCorte('FUSION'), 'FUSION');
assert.ok(sucursalesIdCorteQuery('Fusión').includes('FUSION'));
assert.ok(sucursalesIdCorteQuery('FUSION').includes('Fusión'));

assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'RECOLECCION', caja_actual: 999 },
    { turno: 'DIURNO', caja_actual: 1850.5, detalle: {} },
  ]),
  1850.5,
);

assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'NOCTURNO', caja_actual: 0, detalle: { caja_chica: 420 } },
  ]),
  420,
);

assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { deleted_at: '2026-09-01', turno: 'DIURNO', caja_actual: 500 },
    { turno: 'DIURNO', caja_actual: 310 },
  ]),
  310,
);

assert.equal(cajaAnteriorDesdeFilasCierre([]), null);
assert.equal(cajaAnteriorDesdeFilasCierre([{ turno: 'RECOLECCION', caja_actual: 100 }]), null);

console.log('cajaChicaFusion.ok');
