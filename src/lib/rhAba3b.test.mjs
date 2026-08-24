import assert from 'node:assert/strict';
import {
  etiquetaEstadoRh,
  etiquetaTipoEmpleadoRh,
  nombreCompletoRh,
  puedeGestionarRh,
  resumenProgresoRecontratacion,
} from './rhAba3b.js';

assert.equal(etiquetaTipoEmpleadoRh('tienda'), 'Empleado de tienda');
assert.equal(etiquetaTipoEmpleadoRh('cubre_turno'), 'Cubre turnos');
assert.equal(etiquetaTipoEmpleadoRh('indirecto'), 'Empleado indirecto (MAIN)');
assert.equal(etiquetaEstadoRh('baja'), 'Inactivo (baja)');
assert.equal(nombreCompletoRh({ nombre: 'Ana', apellidos: 'Pérez' }), 'Ana Pérez');
assert.equal(puedeGestionarRh({ rol: 'Administrador' }), true);
assert.equal(puedeGestionarRh({ rol: 'Gerente' }), true);
assert.equal(puedeGestionarRh({ rol: 'Cajero' }), false);

const prog = resumenProgresoRecontratacion(
  [
    { nombre: 'AMR', esPrincipal: true, activo: false },
    { nombre: 'Admin 2', esPrincipal: false, activo: true },
  ],
  [{ admin_nombre: 'AMR', es_admin_principal: true }],
);
assert.equal(prog.listos, 1);
assert.equal(prog.completo, false);

console.log('rhAba3b.test.mjs OK');
