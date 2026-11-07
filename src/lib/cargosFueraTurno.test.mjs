process.env.TZ = 'America/Hermosillo';
import assert from 'node:assert/strict';

const {
  empleadosMencionadosEnTexto,
  empleadosQueRequierenPinPorCargo,
  estadoTurnoEmpleadoParaCargo,
  verificarPinCargoFueraTurno,
} = await import('./cargosFueraTurno.js');

const turnos = [
  { id: 'diurno', nombre: 'Diurno', hora_inicio: '07:00', hora_fin: '19:00' },
  { id: 'nocturno', nombre: 'Nocturno', hora_inicio: '19:00', hora_fin: '07:00' },
];
// Fechas en hora de Sonora (UTC−7): jueves 2026-11-05.
const en = (hhmm, dia = '2026-11-05') => new Date(`${dia}T${hhmm}:00-07:00`);

const dia = { id: 'u1', nombre: 'Kathara López', rol: 'Cajero', turno_id: 'diurno' };
const noche = { id: 'u2', nombre: 'Luis Pérez', rol: 'Cajero', turno_id: 'nocturno' };
const opts = (hhmm, extra = {}) => ({ date: en(hhmm), turnos, sucursal: '3B1', ...extra });

// Diurno 07–19 (+45 = 19:45)
assert.deepEqual(estadoTurnoEmpleadoParaCargo(dia, opts('12:00')), { aplica: true, dentro: true, motivo: 'en_turno' });
assert.equal(estadoTurnoEmpleadoParaCargo(dia, opts('19:45')).dentro, true);
assert.equal(estadoTurnoEmpleadoParaCargo(dia, opts('19:46')).dentro, false);
assert.equal(estadoTurnoEmpleadoParaCargo(dia, opts('23:00')).dentro, false);
assert.equal(estadoTurnoEmpleadoParaCargo(dia, opts('05:00')).dentro, false);

// Nocturno 19–07: cruza medianoche; a las 07:45 todavía; 07:46 ya no.
assert.equal(estadoTurnoEmpleadoParaCargo(noche, opts('22:00')).dentro, true);
assert.equal(estadoTurnoEmpleadoParaCargo(noche, opts('02:00')).dentro, true);
assert.equal(estadoTurnoEmpleadoParaCargo(noche, opts('07:45')).dentro, true);
assert.equal(estadoTurnoEmpleadoParaCargo(noche, opts('07:46')).dentro, false);
assert.equal(estadoTurnoEmpleadoParaCargo(noche, opts('12:00')).dentro, false);

// Rotación por días: el turno de ayer cuenta después de medianoche.
// 2026-11-05 es jueves (4). Trabaja nocturno solo el miércoles (3): jueves 02:00 sigue en turno.
const rota = { id: 'u3', nombre: 'Ana Ruiz', rol: 'Cajero', turno_horario: { tipo: 'personalizado', dias: { 3: 'nocturno' } } };
assert.equal(estadoTurnoEmpleadoParaCargo(rota, opts('02:00')).dentro, true);
assert.equal(estadoTurnoEmpleadoParaCargo(rota, opts('22:00')).dentro, false);
const lunes = { ...rota, turno_horario: { tipo: 'personalizado', dias: { 1: 'diurno' } } };
assert.deepEqual(estadoTurnoEmpleadoParaCargo(lunes, opts('12:00')), { aplica: true, dentro: false, motivo: 'descanso' });

// No aplica: admin, cubre turno, sin turno asignado, ambos turnos, sin turnos configurados.
assert.equal(estadoTurnoEmpleadoParaCargo({ ...dia, rol: 'Administrador' }, opts('23:00')).aplica, false);
assert.equal(estadoTurnoEmpleadoParaCargo({ ...dia, esCubreTurno: true }, opts('23:00')).aplica, false);
assert.equal(estadoTurnoEmpleadoParaCargo({ id: 'x', nombre: 'Sin Turno', rol: 'Cajero' }, opts('23:00')).aplica, false);
assert.equal(estadoTurnoEmpleadoParaCargo({ ...dia, turno_id: 'ambos' }, opts('23:00')).aplica, false);
assert.equal(estadoTurnoEmpleadoParaCargo(dia, { date: en('23:00'), turnos: [], sucursal: '3B1' }).aplica, false);

// Menciones en texto.
const emps = [dia, noche, { id: 'indirect:1', nombre: 'Misael', rol: 'Cajero', turno_id: 'diurno' }];
assert.deepEqual(empleadosMencionadosEnTexto('CONSUMO KATHARA', emps).map((e) => e.id), ['u1']);
assert.deepEqual(empleadosMencionadosEnTexto('faltante de luis pérez', emps).map((e) => e.id), ['u2']);
assert.deepEqual(empleadosMencionadosEnTexto('ANALISIS DE LUISA', emps), []);
assert.deepEqual(empleadosMencionadosEnTexto('Misael', emps), []);

// Requiere NIP: empleado elegido o mencionado, solo si está fuera de turno.
let req = empleadosQueRequierenPinPorCargo({ seleccionado: dia, textos: ['EMPLEADO', 'CONSUMO', ''], empleados: emps, ...opts('21:00') });
assert.deepEqual(req.map((r) => r.empleado.id), ['u1']);
req = empleadosQueRequierenPinPorCargo({ seleccionado: dia, textos: ['CONSUMO'], empleados: emps, ...opts('12:00') });
assert.deepEqual(req, []);
// Gasto sin empleado elegido, pero con el nombre en comentario.
req = empleadosQueRequierenPinPorCargo({ seleccionado: null, textos: ['GASTO', 'FALTANTE KATHARA'], empleados: emps, ...opts('21:00') });
assert.deepEqual(req.map((r) => r.empleado.id), ['u1']);
// Nocturno mencionado a las 21:00 está en turno → no pide NIP.
req = empleadosQueRequierenPinPorCargo({ seleccionado: null, textos: ['faltante luis'], empleados: emps, ...opts('21:00') });
assert.deepEqual(req, []);
// Sin nadie mencionado: no pide NIP.
req = empleadosQueRequierenPinPorCargo({ seleccionado: null, textos: ['PAPELERIA'], empleados: emps, ...opts('23:30') });
assert.deepEqual(req, []);

// Verificación de NIP.
function sbConUsuarios(rows) {
  return {
    from: () => ({
      select: () => ({ eq: (c, v) => Promise.resolve({ data: rows.filter((r) => r[c] === v), error: null }) }),
    }),
  };
}
const sb = sbConUsuarios([
  { id: 'u1', nombre: 'Kathara López', pin: '1111', rol: 'Cajero', activo: true },
  { id: 'u2', nombre: 'Luis Pérez', pin: '2222', rol: 'Cajero', activo: true },
  { id: 'a1', nombre: 'Admin', pin: '9999', rol: 'Administrador', activo: true },
  { id: 'u9', nombre: 'Baja', pin: '7777', rol: 'Cajero', activo: false },
]);
assert.equal((await verificarPinCargoFueraTurno(sb, '1111', dia)).ok, true);
assert.equal((await verificarPinCargoFueraTurno(sb, '2222', dia)).ok, false, 'el NIP de otro cajero no sirve');
assert.equal((await verificarPinCargoFueraTurno(sb, '', dia)).ok, false);
assert.equal((await verificarPinCargoFueraTurno(sb, '0000', dia)).ok, false);
const adm = await verificarPinCargoFueraTurno(sb, '9999', dia);
assert.equal(adm.ok, false, 'el NIP de admin no autoriza en sucursal: responde el cajero');
console.log('cargosFueraTurno.test.mjs ok');
