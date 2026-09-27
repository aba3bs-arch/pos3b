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

// Cierre con caja_actual=0 (p. ej. recolección de nómina) NO debe revivir
// detalle.caja_anterior ni mirar cierres viejos.
assert.equal(
  cajaAnteriorDesdeFilasCierre([
    {
      turno: 'NOCTURNO',
      caja_actual: 0,
      detalle: { caja_anterior: 1940, recoleccion: '1940', tipo_cierre: 'cierre' },
    },
    { turno: 'NOCTURNO', caja_actual: 1940, detalle: {} },
  ]),
  0,
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

// Sin caja_actual en el cierre: solo campos explícitos de arrastre (no caja_anterior).
assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'DIURNO', detalle: { caja_chica: 420, caja_anterior: 999 } },
  ]),
  420,
);
assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'DIURNO', detalle: { caja_anterior: 999 } },
  ]),
  null,
);

console.log('cajaChicaFusion.ok');
