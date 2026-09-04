import assert from 'node:assert/strict';
import {
  agruparEmpleadosParaSelectPrestamo,
  empleadosParaNominaGlobal,
  empleadosParaPrestamosEmpleado,
  prestamoEmpleadoOmiteCorte,
} from './empleadosVisibles.js';

const empleados = [
  { id: 1, nombre: 'Ana Tienda', rol: 'Cajero', sucursal_id: 'T1', tipo_empleado: 'tienda', activo: true },
  { id: 2, nombre: 'Luis Main', rol: 'Cajero', sucursal_id: 'MAIN', tipo_empleado: 'indirecto', activo: true },
  { id: 3, nombre: 'Admin', rol: 'Administrador', sucursal_id: 'MAIN', tipo_empleado: 'indirecto', activo: true },
  { id: 4, nombre: 'Baja', rol: 'Cajero', sucursal_id: 'MAIN', tipo_empleado: 'indirecto', activo: false },
  { id: 5, nombre: 'Pedro T2', rol: 'Cajero', sucursal_id: 'T2', tipo_empleado: 'tienda', activo: true },
];

// En tienda: solo personal de esa tienda (sin MAIN).
{
  const list = empleadosParaPrestamosEmpleado(empleados, 'T1', 'Cajero');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 1);
  assert.equal(prestamoEmpleadoOmiteCorte(list[0]), false);
}

// En MAIN sin admin: vacío.
{
  const list = empleadosParaPrestamosEmpleado(empleados, 'MAIN', 'Cajero');
  assert.equal(list.length, 0);
}

// En MAIN con admin: tienda + MAIN (sin admin ni bajas).
{
  const list = empleadosParaPrestamosEmpleado(empleados, 'MAIN', 'Administrador');
  const ids = list.map((e) => e.id).sort();
  assert.deepEqual(ids, [1, 2, 5]);
  assert.equal(prestamoEmpleadoOmiteCorte(list.find((e) => e.id === 2)), true);
  assert.equal(prestamoEmpleadoOmiteCorte(list.find((e) => e.id === 1)), false);
}

{
  const list = empleadosParaPrestamosEmpleado(empleados, 'MAIN', 'Administrador');
  const g = agruparEmpleadosParaSelectPrestamo(list);
  assert.equal(g.main.length, 1);
  assert.equal(g.main[0].id, 2);
  assert.equal(g.tienda.length, 2);
}

{
  const list = empleadosParaNominaGlobal(empleados);
  assert.ok(!list.some((e) => e.id === 4), 'bajas no van a nómina');
  assert.ok(list.some((e) => e.id === 1));
  assert.ok(!list.some((e) => e.rol === 'Administrador'));
}

console.log('empleadosVisibles.prestamosMain.test.mjs OK');
