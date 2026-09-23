import assert from 'node:assert/strict';
import {
  EDAD_MAYORIA,
  EDAD_MIN_CUBRE,
  EVALUACION_MIN_PCT,
  edadDesdeFechaNacimiento,
  esModoContratacionPublica,
  urlPortalContratacion,
  validarFiltroTipoEdad,
  validarFormularioContratacion,
  FORM_CONTRATACION_VACIO,
  formRhDesdeSolicitudContratacion,
  calificarEvaluacionFa3b003,
  listarPreguntasEvaluacionFa3b003,
  validarPerfilLaboral,
  decidirEstadoPostulacion,
  NOTA_HONESTIDAD_EVALUACION,
} from './contratacion.js';

assert.equal(edadDesdeFechaNacimiento('2000-01-15', new Date('2026-09-21')), 26);
assert.equal(edadDesdeFechaNacimiento('2010-12-01', new Date('2026-09-21')), 15);

assert.equal(validarFiltroTipoEdad({ tipo: 'planta', edad: 17 }).ok, false);
assert.equal(validarFiltroTipoEdad({ tipo: 'planta', edad: EDAD_MAYORIA }).ok, true);
assert.equal(validarFiltroTipoEdad({ tipo: 'cubre_turno', edad: 17 }).ok, true);
assert.equal(validarFiltroTipoEdad({ tipo: 'cubre_turno', edad: 15 }).ok, false);
assert.equal(validarFiltroTipoEdad({ tipo: 'cubre_turno', edad: EDAD_MIN_CUBRE }).ok, true);
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
  experiencia: '',
  disponibilidad_turno: 'diurno',
};
assert.equal(validarFormularioContratacion(formOk).ok, true, 'experiencia no es requisito');
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

// —— FA3B-003 scoring ——
const preguntas = listarPreguntasEvaluacionFa3b003();
assert.equal(preguntas.length, 20);
assert.ok(NOTA_HONESTIDAD_EVALUACION.includes('honestidad'));

const gateIds = preguntas.filter((p) => p.gate).map((p) => p.id);
assert.equal(gateIds.length, 5);

const respuestasPerfectas = {
  s1q1: 'a', s1q2: 'b', s1q3: 'a', s1q4: 'c', s1q5: 'b',
  s2q1: 'a', s2q2: 'b', s2q3: 'a', s2q4: 'c', s2q5: 'c',
  s3q1: 'a', s3q2: 'a', s3q3: 'a', s3q4: 'b', s3q5: 'a',
  s4q1: 'b', s4q2: 'a', s4q3: 'a', s4q4: 'b', s4q5: 'a',
};
const perfecta = calificarEvaluacionFa3b003(respuestasPerfectas);
assert.equal(perfecta.califica, true);
assert.ok(perfecta.score_pct >= EVALUACION_MIN_PCT);
assert.equal(perfecta.primeras5_todas_mal, false);
assert.equal(perfecta.primeras5_correctas, 5);

const todasMalGate = calificarEvaluacionFa3b003({
  ...respuestasPerfectas,
  s1q1: 'd', s1q2: 'd', s1q3: 'd', s1q4: 'd', s1q5: 'd',
});
assert.equal(todasMalGate.primeras5_todas_mal, true);
assert.equal(todasMalGate.califica, false);
assert.match(todasMalGate.motivo || '', /primeras 5/i);

const bajoMinimo = calificarEvaluacionFa3b003({
  s1q1: 'a', s1q2: 'b', s1q3: 'a', s1q4: 'a', s1q5: 'a', // 3/5 gate
  s2q1: 'b', s2q2: 'a', s2q3: 'b', s2q4: 'b', s2q5: 'b',
  s3q1: 'c', s3q2: 'b', s3q3: 'b', s3q4: 'a', s3q5: 'b',
  s4q1: 'a', s4q2: 'b', s4q3: 'b', s4q4: 'c', s4q5: 'b',
});
assert.equal(bajoMinimo.primeras5_todas_mal, false);
assert.ok(bajoMinimo.score_pct < EVALUACION_MIN_PCT);
assert.equal(bajoMinimo.califica, false);

// —— Perfil laboral ——
const perfilOk = {
  disponibilidad_horario: true,
  tiene_celular: true,
  casado: false,
  deberes_permiten_turno: null,
  sin_drogas: true,
  sin_vicio_juego: true,
  dispuesto_fin_semana: true,
  sabe_computadora: true,
  permiso_padres: null,
};
assert.equal(validarPerfilLaboral(perfilOk, { tipo: 'planta', edad: 22 }).cumple, true);

const perfilCasadoSinDeberes = { ...perfilOk, casado: true, deberes_permiten_turno: false };
assert.equal(validarPerfilLaboral(perfilCasadoSinDeberes, { tipo: 'planta', edad: 22 }).cumple, false);

const menorSinPermiso = { ...perfilOk, permiso_padres: false };
assert.equal(validarPerfilLaboral(menorSinPermiso, { tipo: 'cubre_turno', edad: 17 }).cumple, false);
assert.equal(validarPerfilLaboral({ ...perfilOk, permiso_padres: true }, { tipo: 'cubre_turno', edad: 17 }).cumple, true);

const decisionBolsa = decidirEstadoPostulacion({ evaluacion: perfecta, perfilOk: true });
assert.equal(decisionBolsa.estado, 'bolsa_de_trabajo');

const decisionNo = decidirEstadoPostulacion({ evaluacion: todasMalGate, perfilOk: true });
assert.equal(decisionNo.estado, 'no_califica');

const decisionPerfil = decidirEstadoPostulacion({ evaluacion: perfecta, perfilOk: false });
assert.equal(decisionPerfil.estado, 'no_califica');

import {
  validarAceptacionPrivacidad,
  AVISO_PRIVACIDAD_CONTRATACION,
  TEXTO_CASILLA_PRIVACIDAD,
} from './contratacion.js';

assert.ok(AVISO_PRIVACIDAD_CONTRATACION.includes('no serán vendidos') || AVISO_PRIVACIDAD_CONTRATACION.includes('no serán'));
assert.ok(TEXTO_CASILLA_PRIVACIDAD.includes('aviso de privacidad'));
assert.equal(validarAceptacionPrivacidad({ acepta_privacidad: false }).ok, false);
assert.equal(validarAceptacionPrivacidad({ acepta_privacidad: true }).ok, true);

console.log('contratacion.test.mjs OK');
