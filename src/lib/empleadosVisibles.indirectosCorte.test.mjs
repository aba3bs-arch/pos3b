import assert from 'node:assert/strict';
import {
  actorPuedeGastosAIndirectos,
  empleadosParaCorte,
  textoMencionaPersonalIndirecto,
  agruparEmpleadosParaSelectCorte,
} from './empleadosVisibles.js';

const tienda = {
  id: 1,
  nombre: 'Ana Tienda',
  rol: 'Cajero',
  sucursal_id: 'CEDIS',
  tipo_empleado: 'tienda',
  activo: true,
};
const indirecto = {
  id: 2,
  nombre: 'Gonzalo Leal',
  rol: 'Técnico',
  sucursal_id: 'MAIN',
  tipo_empleado: 'indirecto',
  activo: true,
};
const admin = {
  id: 3,
  nombre: 'Admin',
  rol: 'Administrador',
  sucursal_id: 'MAIN',
  activo: true,
};

assert.equal(actorPuedeGastosAIndirectos('Administrador'), true);
assert.equal(actorPuedeGastosAIndirectos('Gerente'), true);
assert.equal(actorPuedeGastosAIndirectos('Cajero'), false);
assert.equal(actorPuedeGastosAIndirectos('Cajero', { esCubreTurno: true }), false);
assert.equal(actorPuedeGastosAIndirectos('Administrador', { esCubreTurno: true }), false);
assert.equal(actorPuedeGastosAIndirectos('Gerente', { user: { esCubreTurno: true } }), false);

const todos = [tienda, indirecto, admin];
const paraAdmin = empleadosParaCorte(todos, 'CEDIS', 'virtual', 'Administrador');
assert.ok(paraAdmin.some((e) => e.id === 2), 'admin ve indirectos');
assert.ok(paraAdmin.some((e) => e.id === 1), 'admin ve tienda');

const paraCajero = empleadosParaCorte(todos, 'CEDIS', 'virtual', 'Cajero');
assert.ok(paraCajero.some((e) => e.id === 1), 'cajero ve tienda');
assert.ok(!paraCajero.some((e) => e.id === 2), 'cajero no ve indirectos');
assert.ok(!paraCajero.some((e) => String(e.id).startsWith('indirect:')), 'cajero sin placeholders');

const paraCt = empleadosParaCorte(todos, 'CEDIS', 'abarrotes', 'Cajero', { esCubreTurno: true });
assert.ok(!paraCt.some((e) => e.es_indirecto_corte || e.tipo_empleado === 'indirecto'));

const grupos = agruparEmpleadosParaSelectCorte(paraCajero);
assert.equal(grupos.indirectos.length, 0);

assert.equal(textoMencionaPersonalIndirecto('compra de bolsas', todos), false);
assert.equal(textoMencionaPersonalIndirecto('consumo gonzalo', todos), true);
assert.equal(textoMencionaPersonalIndirecto('PARA LUIS ENRIQUE', todos), true);
assert.equal(textoMencionaPersonalIndirecto('Misael cobró', todos), true);
assert.equal(textoMencionaPersonalIndirecto('', todos), false);

console.log('empleadosVisibles.indirectosCorte.test.mjs ok');
