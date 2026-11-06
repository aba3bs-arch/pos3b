import assert from 'node:assert/strict';
import {
  diaMarcaje,
  esMismoEmpleadoMarcaje,
  estadoMarcajesDia,
  rangoDiaMarcajeIso,
  validarMarcajeUnicoPorDia,
} from './marcajesDia.js';

// 2026-11-06 08:00 Sonora = 15:00Z; 2026-11-06 23:30 Sonora = 2026-11-07T06:30Z
assert.equal(diaMarcaje('2026-11-06T15:00:00Z'), '2026-11-06');
assert.equal(diaMarcaje('2026-11-07T06:30:00Z'), '2026-11-06');
assert.deepEqual(rangoDiaMarcajeIso('2026-11-06'), {
  desde: '2026-11-06T07:00:00.000Z',
  hasta: '2026-11-07T07:00:00.000Z',
});

const luis = { id: 7, nombre: 'Luis' };
const rows = [
  { id: 'a', usuario_id: 7, nombre: 'Luis', tipo: 'ENTRADA', created_at: '2026-11-06T15:00:00Z' },
  { id: 'b', usuario_id: 8, nombre: 'Ana', tipo: 'SALIDA', created_at: '2026-11-06T22:00:00Z' },
];

const dupEntrada = validarMarcajeUnicoPorDia(rows, luis, 'ENTRADA', new Date('2026-11-06T18:00:00Z'));
assert.equal(dupEntrada.ok, false);
assert.match(dupEntrada.error, /ya tiene una entrada/);

assert.equal(validarMarcajeUnicoPorDia(rows, luis, 'SALIDA', new Date('2026-11-06T23:00:00Z')).ok, true);
// Ana tiene salida, no entrada: otra persona no se bloquea por Luis.
assert.equal(validarMarcajeUnicoPorDia(rows, { id: 8, nombre: 'Ana' }, 'ENTRADA', new Date('2026-11-06T16:00:00Z')).ok, true);
assert.equal(validarMarcajeUnicoPorDia(rows, { id: 8, nombre: 'Ana' }, 'SALIDA', new Date('2026-11-06T23:00:00Z')).ok, false);

// Turno nocturno: entrada ayer 22:00 Sonora, salida hoy 06:00 → días distintos, no choca.
const noche = [{ id: 'n', usuario_id: 7, nombre: 'Luis', tipo: 'ENTRADA', created_at: '2026-11-06T05:00:00Z' }];
assert.equal(diaMarcaje('2026-11-06T05:00:00Z'), '2026-11-05');
assert.equal(validarMarcajeUnicoPorDia(noche, luis, 'SALIDA', new Date('2026-11-06T13:00:00Z')).ok, true);
assert.equal(validarMarcajeUnicoPorDia(noche, luis, 'ENTRADA', new Date('2026-11-06T13:00:00Z')).ok, true);

// Editar un marcaje: se excluye a sí mismo.
assert.equal(validarMarcajeUnicoPorDia(rows, luis, 'ENTRADA', new Date('2026-11-06T16:00:00Z'), { excluirId: 'a' }).ok, true);

// Sin id (cubre turno / registros viejos): por nombre.
const cubre = { id: null, nombre: 'Pedro (cubre turno)' };
const rowsCubre = [{ id: 'c', usuario_id: null, nombre: 'pedro (cubre turno)', tipo: 'SALIDA', created_at: '2026-11-06T20:00:00Z' }];
assert.equal(esMismoEmpleadoMarcaje(rowsCubre[0], cubre), true);
assert.equal(validarMarcajeUnicoPorDia(rowsCubre, cubre, 'SALIDA', new Date('2026-11-06T22:00:00Z')).ok, false);
// Registro viejo sin id contra empleado con id del mismo nombre.
assert.equal(esMismoEmpleadoMarcaje({ usuario_id: null, nombre: 'Luis' }, luis), true);
assert.equal(esMismoEmpleadoMarcaje({ usuario_id: 9, nombre: 'Luis' }, luis), false);

const est = estadoMarcajesDia(rows, luis, '2026-11-06');
assert.ok(est.entrada && !est.salida && !est.completo);
assert.equal(validarMarcajeUnicoPorDia(rows, luis, 'OTRO').ok, false);
console.log('marcajesDia.test.mjs ok');
