import assert from 'node:assert/strict';
import {
  EDAD_MAYORIA,
  edadDesdeFechaNacimiento,
  esModoContratacionPublica,
  urlPortalContratacion,
  validarFiltroTipoEdad,
  validarFormularioContratacion,
  FORM_CONTRATACION_VACIO,
  formRhDesdeSolicitudContratacion,
} from './contratacion.js';

assert.equal(edadDesdeFechaNacimiento('2000-01-15', new Date('2026-09-21')), 26);
assert.equal(edadDesdeFechaNacimiento('2010-12-01', new Date('2026-09-21')), 15);

assert.equal(validarFiltroTipoEdad({ tipo: 'planta', edad: 17 }).ok, false);
assert.equal(validarFiltroTipoEdad({ tipo: 'planta', edad: EDAD_MAYORIA }).ok, true);
assert.equal(validarFiltroTipoEdad({ tipo: 'cubre_turno', edad: 17 }).ok, true);
assert.equal(validarFiltroTipoEdad({ tipo: '' }).ok, false);

const formOk = {
  ...FORM_CONTRATACION_VACIO,
  tipo: 'planta',
  edad: 22,
  nombre: 'Ana',
  apellidos: 'López García',
  telefono: '6311234567',
  direccion: 'Calle 1',
  ciudad: 'Nogales',
  grado_estudios: 'Preparatoria / Bachillerato',
  experiencia: 'Cajera 2 años',
  disponibilidad_turno: 'diurno',
};
assert.equal(validarFormularioContratacion(formOk).ok, true);
assert.equal(validarFormularioContratacion({ ...formOk, telefono: '123' }).ok, false);

assert.equal(esModoContratacionPublica({ search: '?contratacion=1', hash: '' }), true);
assert.equal(esModoContratacionPublica({ search: '', hash: '#contratacion' }), true);
assert.equal(esModoContratacionPublica({ search: '', hash: '' }), false);
assert.ok(urlPortalContratacion('https://ejemplo.com').includes('contratacion=1'));

const rhPlanta = formRhDesdeSolicitudContratacion({
  id: 'sol-1',
  tipo: 'planta',
  nombre: 'Ana',
  apellidos: 'López',
  telefono: '6311234567',
  email: 'a@x.com',
  curp: 'loxa000101mxxx',
  sucursales_interes: ['3B5', '3B2'],
  disponibilidad_turno: 'diurno',
  experiencia: '2 años',
});
assert.equal(rhPlanta.nombre, 'Ana');
assert.equal(rhPlanta.tipo_empleado, 'tienda');
assert.equal(rhPlanta.sucursal_id, '3B5');
assert.equal(rhPlanta.curp, 'LOXA000101MXXX');
assert.match(rhPlanta.notas, /Origen contratación: sol-1/);
assert.match(rhPlanta.notas, /Experiencia: 2 años/);

const rhCt = formRhDesdeSolicitudContratacion({
  tipo: 'cubre_turno',
  nombre: 'Luis',
  sucursales_interes: ['3B7'],
  disponibilidad_turno: 'diurno',
});
assert.equal(rhCt.tipo_empleado, 'cubre_turno');
assert.deepEqual(rhCt.ct_sucursales, ['3B7']);
assert.equal(rhCt.ct_solo_dia, true);

console.log('contratacion.test.mjs OK');
