import assert from 'node:assert/strict';
import {
  EDAD_MAYORIA,
  edadDesdeFechaNacimiento,
  esModoContratacionPublica,
  urlPortalContratacion,
  validarFiltroTipoEdad,
  validarFormularioContratacion,
  FORM_CONTRATACION_VACIO,
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

console.log('contratacion.test.mjs OK');
