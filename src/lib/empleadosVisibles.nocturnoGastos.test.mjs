/**
 * Diurno + nocturno siempre visibles en gastos de corte (Virtual / Abarrotes).
 * node src/lib/empleadosVisibles.nocturnoGastos.test.mjs
 */
import assert from 'node:assert/strict';
import {
  empleadosParaCorte,
  agruparEmpleadosParaSelectCorte,
  elegirEmpleadosTiendaParaGastos,
  etiquetaEmpleadoSelectGastos,
  resolverTipoEmpleado,
  turnoEmpleadoParaGastos,
} from './empleadosVisibles.js';
import { empleadosParaCatalogoEmpleado } from './catalogoEmpleadoGastos.js';

const diurno = {
  id: 'd1',
  nombre: 'Ana Diurna',
  rol: 'Cajero',
  sucursal_id: '3B5',
  tipo_empleado: 'tienda',
  turno_id: 'diurno',
  activo: true,
};
const nocturno = {
  id: 'n1',
  nombre: 'Beto Nocturno',
  rol: 'Cajero',
  sucursal_id: '3B5',
  tipo_empleado: 'tienda',
  turno_id: 'nocturno',
  activo: true,
};
// Alta errónea: flag indirecto pero cajero de tienda (caso real que ocultaba al nocturno).
const nocturnoMalTipado = {
  id: 'n2',
  nombre: 'Carla Noche',
  rol: 'Cajero',
  sucursal_id: 'FUSION',
  tipo_empleado: 'indirecto',
  turno_id: 'nocturno',
  activo: true,
};
const extraAlfa = {
  id: 'x1',
  nombre: 'Zora Extra',
  rol: 'Cajero',
  sucursal_id: '3B5',
  tipo_empleado: 'tienda',
  turno_id: 'diurno',
  activo: true,
};

assert.equal(resolverTipoEmpleado(nocturnoMalTipado), 'tienda', 'cajero en tienda no es indirecto');
assert.equal(turnoEmpleadoParaGastos(nocturno), 'nocturno');
assert.match(etiquetaEmpleadoSelectGastos(nocturno), /Nocturno/);

const lista = empleadosParaCorte([diurno, nocturno], '3B5', 'virtual', 'Administrador');
assert.ok(lista.some((e) => e.id === 'd1'), 'diurno en Virtual');
assert.ok(lista.some((e) => e.id === 'n1'), 'nocturno en Virtual');

const abar = empleadosParaCorte([diurno, nocturno], '3B5', 'abarrotes', 'Cajero');
assert.ok(abar.some((e) => e.id === 'n1'), 'nocturno en Abarrotes');

// Aunque pasen opts.turno=diurno (hora de día), el nocturno sigue visible.
const conOpts = empleadosParaCorte([diurno, nocturno], '3B5', 'virtual', 'Administrador', {
  turno: { id: 'diurno', nombre: 'Diurno' },
  date: new Date('2026-09-26T18:00:00.000Z'), // ~11:00 Hermosillo
});
assert.ok(conOpts.some((e) => e.id === 'n1'), 'nocturno visible aunque el reloj diga diurno');

const fusion = empleadosParaCorte([nocturnoMalTipado], 'FUSION', 'virtual', 'Administrador');
assert.ok(fusion.some((e) => e.id === 'n2'), 'nocturno mal tipado aparece en su tienda');

const grupos = agruparEmpleadosParaSelectCorte(lista);
assert.equal(grupos.tienda.length, 2);
assert.equal(grupos.tienda[0].id, 'd1', 'diurno primero');
assert.equal(grupos.tienda[1].id, 'n1', 'nocturno segundo');

// Máx 3 en tienda: preferir diurno+nocturno (no solo .slice alfabético que deja fuera al nocturno).
const elegidos = elegirEmpleadosTiendaParaGastos([extraAlfa, nocturno, diurno]);
assert.equal(elegidos.length, 2);
assert.ok(elegidos.some((e) => e.turno_id === 'nocturno'), 'incluye nocturno');
assert.ok(elegidos.some((e) => e.turno_id === 'diurno'), 'incluye diurno');
assert.ok(
  elegidos.some((e) => e.id === 'n1'),
  'nocturno no queda fuera por orden alfabético',
);

const cat = empleadosParaCatalogoEmpleado([diurno, nocturno, extraAlfa], '3B5');
const g = cat.tiendaGrupos.find((x) => x.sucursalId === '3B5');
assert.ok(g);
assert.equal(g.empleados.length, 2);
assert.ok(g.empleados.some((e) => e.turno_id === 'nocturno'));

// Leyver Misael = empleado de tienda (no el Misael MAIN de consumo PIN)
const leyver = {
  id: 'ley-1',
  nombre: 'Leyver Misael',
  rol: 'Cajero',
  sucursal_id: '3B5',
  tipo_empleado: 'tienda',
  turno_id: 'nocturno',
  activo: true,
};
const conLeyver = empleadosParaCorte([diurno, leyver], '3B5', 'virtual', 'Administrador');
assert.ok(conLeyver.some((e) => e.id === 'ley-1'), 'Leyver Misael en lista de corte');
assert.ok(!conLeyver.find((e) => e.id === 'ley-1')?.requiere_pin_consumo, 'Leyver no es consumo PIN');
const gLey = agruparEmpleadosParaSelectCorte(conLeyver);
assert.ok(gLey.tienda.some((e) => e.id === 'ley-1'), 'Leyver en optgroup empleados de tienda');
assert.ok(!gLey.consumoPin.some((e) => e.id === 'ley-1'), 'Leyver no va al grupo Misael PIN');

console.log('empleadosVisibles.nocturnoGastos.test.mjs ok');
