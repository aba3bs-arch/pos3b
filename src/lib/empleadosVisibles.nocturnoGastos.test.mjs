/**
 * Diurno + nocturno siempre visibles en gastos de corte (Virtual / Abarrotes).
 * node src/lib/empleadosVisibles.nocturnoGastos.test.mjs
 */
import assert from 'node:assert/strict';
import {
  empleadosParaCorte,
  agruparEmpleadosParaSelectCorte,
  elegirEmpleadosTiendaParaGastos,
  esEmpleadoConsumoPinCorte,
  etiquetaEmpleadoSelectGastos,
  resolverTipoEmpleado,
  turnoDominanteDesdeHorario,
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

// ——— 3B7 Del Valle: rotación nocturna + alias de colonia + alta mal tipada ———
const diurno3b7 = {
  id: 'd7',
  nombre: 'Ana 3B7',
  rol: 'Cajero',
  sucursal_id: '3B7',
  tipo_empleado: 'tienda',
  turno_id: 'diurno',
  activo: true,
};
const nocturnoRot3b7 = {
  id: 'n7',
  nombre: 'Beto 3B7 Noche',
  rol: 'Cajero',
  sucursal_id: '3B7',
  tipo_empleado: 'tienda',
  turno_id: null,
  turno_horario: { tipo: 'personalizado', patron: 'empleado_2' }, // Mié–Dom nocturno
  activo: true,
};
const extra3b7 = {
  id: 'x7',
  nombre: 'Zora 3B7',
  rol: 'Cajero',
  sucursal_id: '3B7',
  tipo_empleado: 'tienda',
  turno_id: 'diurno',
  activo: true,
};
// Alta con colonia en vez de código + tipado indirecto + rol no cajero.
const nocturnoDelValle = {
  id: 'n7b',
  nombre: 'Diego Del Valle',
  rol: 'Supervisor',
  sucursal_id: 'Del Valle',
  tipo_empleado: 'indirecto',
  turno_id: 'nocturno',
  activo: true,
};

assert.equal(turnoDominanteDesdeHorario(nocturnoRot3b7), 'nocturno');
const lunes = new Date('2026-10-12T18:00:00.000Z'); // lunes = descanso en empleado_2
assert.equal(turnoEmpleadoParaGastos(nocturnoRot3b7, lunes), 'nocturno', 'dominante aunque hoy descanse');
assert.match(etiquetaEmpleadoSelectGastos(nocturnoRot3b7, lunes), /Nocturno/);

const corte3b7 = empleadosParaCorte([diurno3b7, nocturnoRot3b7], '3B7', 'virtual', 'Administrador');
assert.ok(corte3b7.some((e) => e.id === 'n7'), 'nocturno 3B7 en gastos');

const elegLunes = elegirEmpleadosTiendaParaGastos([extra3b7, nocturnoRot3b7, diurno3b7], { date: lunes });
assert.ok(elegLunes.some((e) => e.id === 'n7'), 'rotación nocturna no se pierde el lunes');
assert.ok(
  elegLunes.some((e) => turnoEmpleadoParaGastos(e, lunes) === 'diurno'),
  'incluye diurno',
);

assert.equal(resolverTipoEmpleado(nocturnoDelValle), 'tienda', 'Del Valle + turno nocturno = tienda');
const corteAlias = empleadosParaCorte([diurno3b7, nocturnoDelValle], '3B7', 'abarrotes', 'Cajero');
assert.ok(corteAlias.some((e) => e.id === 'n7b'), 'empleado con sucursal Del Valle aparece en 3B7');

const cat3b7 = empleadosParaCatalogoEmpleado([diurno3b7, nocturnoRot3b7, extra3b7], '3B7');
const g7 = cat3b7.tiendaGrupos.find((x) => x.sucursalId === '3B7');
assert.ok(g7);
assert.ok(g7.empleados.some((e) => e.id === 'n7'), 'catálogo 3B7 incluye nocturno');

// ——— Caso real 3B7: Frania (diurno) + Leyver Misael (nocturno); Misael MAIN intacto ———
const frania = {
  id: 'fc4184b8-03d6-4006-8a17-6fa643f172fb',
  nombre: 'Frania Pahola Zazueta Amparan',
  rol: 'Cajero',
  sucursal_id: '3B7',
  tipo_empleado: 'tienda',
  turno_id: 'diurno',
  activo: true,
};
const leyver = {
  id: '43b09789-f7f2-4865-9efa-789896e9d200',
  nombre: 'Leyver Misael Jimenez salinas',
  rol: 'Cajero',
  sucursal_id: '3B7',
  tipo_empleado: 'tienda',
  turno_id: 'nocturno',
  activo: true,
};
const misaelMain = {
  id: 'e686f39b-82e2-4a52-9d1e-896666f28f84',
  nombre: 'Misael Edwin Avalos Perez',
  rol: 'Técnico',
  sucursal_id: 'MAIN',
  tipo_empleado: 'indirecto',
  turno_id: 'ambos',
  activo: true,
};
assert.equal(esEmpleadoConsumoPinCorte(leyver), false, 'Leyver no es el Misael de PIN');
assert.equal(esEmpleadoConsumoPinCorte(misaelMain), true, 'Misael MAIN sigue con PIN');

const real3b7 = empleadosParaCorte([frania, leyver, misaelMain], '3B7', 'virtual', 'Administrador');
const gruposReal = agruparEmpleadosParaSelectCorte(real3b7);
assert.equal(gruposReal.tienda.length, 2, 'exactamente diurno + nocturno en 3B7');
assert.ok(gruposReal.tienda.some((e) => e.id === frania.id), 'Frania diurno');
assert.ok(gruposReal.tienda.some((e) => e.id === leyver.id), 'Leyver nocturno en tienda');
assert.match(etiquetaEmpleadoSelectGastos(leyver), /Nocturno/);
assert.ok(
  (gruposReal.consumoPin || []).some((e) => esEmpleadoConsumoPinCorte(e) && /misael/i.test(e.nombre || e.etiqueta_consumo_pin || '')),
  'Misael MAIN sigue en consumo PIN',
);
assert.ok(
  !(gruposReal.consumoPin || []).some((e) => String(e.id) === leyver.id),
  'Leyver no va al grupo MAIN',
);

console.log('empleadosVisibles.nocturnoGastos.test.mjs ok');
