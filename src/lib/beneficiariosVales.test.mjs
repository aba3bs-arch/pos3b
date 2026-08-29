import assert from 'node:assert/strict';
import { listarBeneficiariosVales } from './empleadosVisibles.js';
import { beneficiarioValePermitido, beneficiarioValePorId } from './contabilidadConstants.js';

const empleados = [
  { id: 'u1', nombre: 'Arnoldo moreno beltran', rol: 'Técnico', sucursal_id: 'MAIN', tipo_empleado: 'indirecto', activo: true },
  { id: 'u2', nombre: 'Gonzalo Leal', rol: 'Técnico', sucursal_id: 'MAIN', tipo_empleado: 'indirecto', activo: true },
  { id: 'u3', nombre: 'Cajero Tienda', rol: 'Cajero', sucursal_id: '3B5', tipo_empleado: 'tienda', activo: true },
  { id: 'u4', nombre: 'AMR', rol: 'Administrador', sucursal_id: 'MAIN', tipo_empleado: 'tienda', activo: true },
];

const list = listarBeneficiariosVales(empleados);
assert.ok(list.some((b) => /luis enrique/i.test(b.nombre)), 'incluye fijo Luis Enrique');
assert.ok(list.some((b) => /arnoldo/i.test(b.nombre)), 'incluye indirecto MAIN Arnoldo');
assert.ok(list.some((b) => /gonzalo/i.test(b.nombre)), 'incluye Gonzalo');
assert.ok(!list.some((b) => /cajero tienda/i.test(b.nombre)), 'no incluye personal de tienda');
assert.ok(!list.some((b) => b.nombre === 'AMR'), 'admin AMR no es beneficiario de vale');

const arn = list.find((b) => /arnoldo/i.test(b.nombre));
assert.ok(arn);
assert.equal(beneficiarioValePermitido(arn.nombre, 'abarrotes', { ampliado: true }), true);
assert.equal(beneficiarioValePermitido(arn.nombre, 'abarrotes'), false, 'sin ampliado no pasa el filtro histórico');
assert.ok(beneficiarioValePorId(arn.id, list));

console.log('beneficiariosVales.test.mjs ok');
