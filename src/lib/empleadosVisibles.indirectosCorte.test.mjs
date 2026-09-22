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
const tiendaOtra = {
  id: 4,
  nombre: 'Beto Otra',
  rol: 'Cajero',
  sucursal_id: '5',
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

// Nadie puede gastos a indirectos en cortes.
assert.equal(actorPuedeGastosAIndirectos('Administrador'), false);
assert.equal(actorPuedeGastosAIndirectos('Gerente'), false);
assert.equal(actorPuedeGastosAIndirectos('Cajero'), false);

const todos = [tienda, tiendaOtra, indirecto, admin];

const paraAdmin = empleadosParaCorte(todos, 'CEDIS', 'virtual', 'Administrador');
assert.ok(paraAdmin.some((e) => e.id === 1), 'admin ve tienda de la sucursal');
assert.ok(!paraAdmin.some((e) => e.id === 2), 'nadie ve indirectos');
assert.ok(!paraAdmin.some((e) => e.id === 3), 'nadie ve admins');
assert.ok(!paraAdmin.some((e) => e.id === 4), 'no ve tienda de otra sucursal');
assert.ok(!paraAdmin.some((e) => String(e.id).startsWith('indirect:')), 'sin placeholders');

const paraCajero = empleadosParaCorte(todos, 'CEDIS', 'virtual', 'Cajero');
assert.deepEqual(
  paraCajero.map((e) => e.id),
  [1],
);

const paraMain = empleadosParaCorte(todos, 'MAIN', 'garage', 'Administrador');
assert.ok(paraMain.some((e) => e.id === 1));
assert.ok(paraMain.some((e) => e.id === 4));
assert.ok(!paraMain.some((e) => e.id === 2));

const grupos = agruparEmpleadosParaSelectCorte(paraAdmin);
assert.equal(grupos.tienda.length, 1);
assert.equal(grupos.indirectos.length, 0);
assert.equal(grupos.admins.length, 0);

assert.equal(textoMencionaPersonalIndirecto('compra de bolsas', todos), false);
assert.equal(textoMencionaPersonalIndirecto('consumo gonzalo', todos), true);
assert.equal(textoMencionaPersonalIndirecto('PARA LUIS ENRIQUE', todos), true);
assert.equal(textoMencionaPersonalIndirecto('Misael cobró', todos), true);
assert.equal(textoMencionaPersonalIndirecto('', todos), false);

console.log('empleadosVisibles.indirectosCorte.test.mjs ok');
