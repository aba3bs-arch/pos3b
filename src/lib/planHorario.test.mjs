import assert from 'node:assert/strict';
import {
  formatoHoraPlan,
  formatoBloqueHorario,
  fusionarPlanConUsuarios,
  moverCelda,
  parchearCelda,
  asignarDescansoConCt,
  quitarDescanso,
  textoCelda,
  listarCandidatosCt,
  idFilaEmpleado,
  idFilaCt,
  tituloTiendaPlan,
  empleadosPorTiendaParaPlan,
  COLOR_DESCANSO_DEFAULT,
} from './planHorario.js';
import { tieneAccionPlanHorario, ACCION_PLAN_HORARIO } from './planHorarioAcciones.js';

assert.equal(formatoHoraPlan('07:00'), '7:00 AM');
assert.equal(formatoHoraPlan('19:00'), '19:00');
assert.equal(formatoBloqueHorario('07:00', '19:00'), '7:00 AM A 19:00');
assert.equal(formatoBloqueHorario('19:00', '07:00'), '19:00 A 7:00 AM');
assert.equal(tituloTiendaPlan('3B5'), 'ABARROTES 3B5 LOMAS DOS');
assert.equal(tituloTiendaPlan('FUSION'), 'ABARROTES FUSION');

const usuarios = [
  { id: 1, nombre: 'Leitah', rol: 'Cajero', sucursal_id: 'FUSION', turno_id: 'diurno', activo: true, tipo_empleado: 'tienda' },
  { id: 2, nombre: 'Karla', rol: 'Cajero', sucursal_id: 'FUSION', turno_id: 'nocturno', activo: true, tipo_empleado: 'tienda' },
  { id: 3, nombre: 'Admin', rol: 'Administrador', sucursal_id: 'FUSION', activo: true, tipo_empleado: 'tienda' },
  { id: 4, nombre: 'Baja', rol: 'Cajero', sucursal_id: 'FUSION', activo: false, tipo_empleado: 'tienda' },
  { id: 5, nombre: 'Oficina', rol: 'Cajero', sucursal_id: 'MAIN', activo: true, tipo_empleado: 'indirecto' },
  { id: 6, nombre: 'Ana', rol: 'Cajero', sucursal_id: '3B2', turno_id: 'diurno', activo: true, tipo_empleado: 'tienda' },
];

const porTienda = empleadosPorTiendaParaPlan(usuarios);
assert.equal(porTienda.get('FUSION').length, 2);
assert.equal(porTienda.get('FUSION')[0].nombre, 'Leitah');
assert.ok(!porTienda.get('FUSION').some((u) => u.nombre === 'Admin' || u.nombre === 'Baja'));

const plan = fusionarPlanConUsuarios({ filas: [] }, usuarios, {
  rhPorUsuarioId: new Map([['1', { telefono: '6311116124', nombre_completo: 'Leitah' }]]),
});
const fusion = plan.filas.filter((f) => f.sucursal_id === 'FUSION');
assert.equal(fusion.length, 3);
assert.equal(fusion[0].nombre, 'LEITAH 6311116124');
assert.equal(fusion[1].nombre, 'KARLA');
assert.equal(fusion[2].tipo, 'ct');
assert.equal(fusion[2].id, idFilaCt('FUSION'));
assert.ok(plan.filas.some((f) => f.id === idFilaEmpleado('3B2', 6)));
assert.ok(plan.filas.some((f) => f.sucursal_id === '3B5' && f.nombre === 'SIN EMPLEADO'));

const filaLeitah = fusion[0].id;
let next = asignarDescansoConCt(plan, filaLeitah, 0, { id: 'rh:9', nombre: 'Samuel', telefono: '6310000000' });
const celDom = next.filas.find((f) => f.id === filaLeitah).celdas['0'];
assert.equal(celDom.tipo, 'descanso');
assert.equal(celDom.ctNombre, 'Samuel');
assert.equal(celDom.color, COLOR_DESCANSO_DEFAULT);
assert.equal(textoCelda(celDom, '7:00 AM A 19:00'), 'SAMUEL');

next = moverCelda(next, filaLeitah, 0, filaLeitah, 6);
const trasMover = next.filas.find((f) => f.id === filaLeitah);
assert.equal(trasMover.celdas['6'].tipo, 'descanso');
assert.equal(trasMover.celdas['6'].ctNombre, 'Samuel');
assert.equal(trasMover.celdas['0'].tipo, 'turno');

next = parchearCelda(next, filaLeitah, 6, { color: '#bbdefb' });
assert.equal(next.filas.find((f) => f.id === filaLeitah).celdas['6'].color, '#bbdefb');

next = quitarDescanso(next, filaLeitah, 6);
assert.equal(next.filas.find((f) => f.id === filaLeitah).celdas['6'].tipo, 'turno');
assert.equal(next.filas.find((f) => f.id === filaLeitah).celdas['6'].ctNombre, null);

const cts = listarCandidatosCt({
  usuarios,
  rhCubre: [
    { id: 10, nombre_completo: 'Angel Perez', telefono: '6311110000', tipo_empleado: 'cubre_turno', estado: 'activo' },
    { id: 11, nombre_completo: 'Viejo', estado: 'baja' },
  ],
});
assert.ok(cts.some((c) => c.nombre === 'Angel Perez' && c.origen === 'rh'));
assert.ok(cts.some((c) => c.nombre === 'Leitah' && c.origen === 'usuario'));
assert.ok(!cts.some((c) => c.nombre === 'Viejo'));
assert.ok(!cts.some((c) => c.nombre === 'Admin'));

assert.equal(tieneAccionPlanHorario('Administrador'), true);
assert.equal(tieneAccionPlanHorario('Cajero'), false);
assert.equal(tieneAccionPlanHorario('Gerente'), false);
assert.equal(tieneAccionPlanHorario('Gerente', null, {
  acciones: { [ACCION_PLAN_HORARIO]: { porRol: { Gerente: true }, porUsuario: {} } },
}), true);
assert.equal(tieneAccionPlanHorario('Cajero', 'u1', {
  acciones: { [ACCION_PLAN_HORARIO]: { porRol: {}, porUsuario: { u1: true } } },
}), true);
assert.equal(tieneAccionPlanHorario('Administrador', null, {
  acciones: { [ACCION_PLAN_HORARIO]: { porRol: { Administrador: false }, porUsuario: {} } },
}), true);

const conservado = fusionarPlanConUsuarios(
  asignarDescansoConCt(plan, filaLeitah, 1, { nombre: 'Mayre' }),
  usuarios,
);
assert.equal(conservado.filas.find((f) => f.id === filaLeitah).celdas['1'].ctNombre, 'Mayre');

console.log('planHorario.test.mjs OK');
