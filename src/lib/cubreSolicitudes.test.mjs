import assert from 'node:assert/strict';
import {
  ctPuedeSerSolicitado,
  colorDisponibilidadCt,
  estadoDisponibilidadCt,
  etiquetaDisponibilidadCt,
  fechasOcupadasCt,
  ctPuedeSolicitarseEnFecha,
  ctPuedeCubrirSucursal,
  ctPuedeCubrirTurno,
  ctPuedeCubrirEn,
} from './cubreSolicitudes.js';

assert.equal(estadoDisponibilidadCt({ estado: 'baja' }), 'baja');
assert.equal(
  estadoDisponibilidadCt({
    id: '1',
    estado: 'activo',
    extras: { ct_hold_until: new Date(Date.now() + 86400000).toISOString() },
  }),
  'hold',
);
assert.equal(
  estadoDisponibilidadCt({
    id: '1',
    estado: 'activo',
    extras: { ct_disponibilidad: 'no_disponible' },
  }),
  'no_disponible',
);
assert.equal(
  estadoDisponibilidadCt({ id: '1', estado: 'activo', extras: {} }, [
    { ct_rh_id: '1', estado: 'aceptada', fecha: '2026-09-15' },
  ]),
  'cubriendo',
);
assert.equal(estadoDisponibilidadCt({ id: '2', estado: 'activo', extras: {} }, []), 'disponible');

// Con fecha: solo bloquea el mismo día
assert.equal(
  estadoDisponibilidadCt(
    { id: '1', estado: 'activo', extras: {} },
    [{ ct_rh_id: '1', estado: 'aceptada', fecha: '2026-09-15' }],
    { fecha: '2026-09-16' },
  ),
  'disponible',
);
assert.equal(
  estadoDisponibilidadCt(
    { id: '1', estado: 'activo', extras: {} },
    [{ ct_rh_id: '1', estado: 'solicitada', fecha: '2026-09-15' }],
    { fecha: '2026-09-15' },
  ),
  'cubriendo',
);

assert.deepEqual(
  fechasOcupadasCt('1', [
    { ct_rh_id: '1', estado: 'aceptada', fecha: '2026-09-16' },
    { ct_rh_id: '1', estado: 'solicitada', fecha: '2026-09-15' },
    { ct_rh_id: '1', estado: 'cancelada', fecha: '2026-09-14' },
    { ct_rh_id: '2', estado: 'aceptada', fecha: '2026-09-17' },
  ]),
  ['2026-09-15', '2026-09-16'],
);

assert.equal(
  ctPuedeSolicitarseEnFecha(
    { id: '1', estado: 'activo', extras: {} },
    [{ ct_rh_id: '1', estado: 'aceptada', fecha: '2026-09-15' }],
    '2026-09-16',
  ),
  true,
);
assert.equal(
  ctPuedeSolicitarseEnFecha(
    { id: '1', estado: 'activo', extras: {} },
    [{ ct_rh_id: '1', estado: 'aceptada', fecha: '2026-09-15' }],
    '2026-09-15',
  ),
  false,
);
assert.equal(
  ctPuedeSolicitarseEnFecha(
    {
      disponibilidad: 'cubriendo',
      fechas_ocupadas: ['2026-09-15'],
    },
    [],
    '2026-09-16',
  ),
  true,
);
assert.equal(
  ctPuedeSolicitarseEnFecha(
    { disponibilidad: 'hold', fechas_ocupadas: [] },
    [],
    '2026-09-16',
  ),
  false,
);

assert.equal(ctPuedeSerSolicitado('disponible'), true);
assert.equal(ctPuedeSerSolicitado('hold'), false);
assert.equal(colorDisponibilidadCt('disponible'), '#2e7d32');
assert.equal(colorDisponibilidadCt('cubriendo'), '#c62828');
assert.match(etiquetaDisponibilidadCt('hold'), /Hold/i);

assert.equal(ctPuedeCubrirSucursal({}, 'FUSION'), true);
assert.equal(ctPuedeCubrirSucursal({ ct_sucursales: ['FUSION', '3B2'] }, '3B5'), false);
assert.equal(ctPuedeCubrirSucursal({ ct_sucursales: ['FUSION'] }, 'FUSION'), true);
assert.equal(ctPuedeCubrirTurno({}, 'nocturno'), true);
assert.equal(ctPuedeCubrirTurno({ ct_solo_dia: true }, 'nocturno'), false);
assert.equal(ctPuedeCubrirTurno({ ct_solo_dia: true }, 'diurno'), true);
assert.equal(ctPuedeCubrirEn({ ct_sucursales: ['3B2'], ct_solo_dia: true }, { sucursal_id: '3B2', turno_id: 'diurno' }), true);
assert.equal(ctPuedeCubrirEn({ ct_sucursales: ['3B2'], ct_solo_dia: true }, { sucursal_id: '3B2', turno_id: 'nocturno' }), false);

console.log('cubreSolicitudes.test.mjs ok');
