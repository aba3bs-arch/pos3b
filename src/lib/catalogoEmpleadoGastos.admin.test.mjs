import assert from 'node:assert/strict';
import { empleadosParaCatalogoEmpleado, enriquecerCategoriaEmpleado } from './catalogoEmpleadoGastos.js';

const empleados = [
  { id: 'c1', nombre: 'Cajero Uno', rol: 'Cajero', sucursal_id: '3B2', tipo_empleado: 'tienda', activo: true },
  { id: 'a1', nombre: 'Ana Admin', rol: 'Administrador', sucursal_id: 'MAIN', activo: true },
  { id: 'a2', nombre: 'Beto Socio', rol: 'Administrador', sucursal_id: 'MAIN', activo: true, socio_3b: true },
  { id: 'a3', nombre: 'Cora Baja', rol: 'Administrador', sucursal_id: 'MAIN', activo: false },
];

const cat = empleadosParaCatalogoEmpleado(empleados, 'CEDIS');
assert.ok(cat.main.some((e) => e.id === 'a1'), 'el administrador activo aparece en Empleados de Main');
assert.equal(cat.main.some((e) => e.id === 'a2'), false, 'el socio no entra a nómina ni al catálogo');
assert.equal(cat.main.some((e) => e.id === 'a3'), false, 'el administrador de baja no aparece');
assert.equal(
  cat.tiendaGrupos.some((g) => (g.empleados || []).some((e) => e.id === 'a1')),
  false,
  'el administrador no se lista como empleado de tienda',
);

const enriched = enriquecerCategoriaEmpleado(
  { id: 'empleado', nombre: 'Empleado', subcategorias: [] },
  empleados,
  'CEDIS',
);
const sub = enriched.subcategorias.find((s) => s.usuario_id === 'a1');
assert.ok(sub, 'el administrador es subcategoría viva de Empleado');
assert.equal(sub.grupo_empleado, 'main');
assert.equal(enriched.subcategorias.some((s) => s.usuario_id === 'a2'), false);

console.log('catalogoEmpleadoGastos.admin.test.mjs OK');
