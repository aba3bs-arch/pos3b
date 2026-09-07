import assert from 'node:assert/strict';
import {
  filtrarNotificacionesFormularioIncidencia,
  notificacionEsDeMiBuzon,
} from './buzonUsuario.js';
import { esNotificacionFormularioIncidencia, TIPOS_NOTIF } from './contabilidadNotificaciones.js';

const admin = { rol: 'Administrador', nombre: 'AMR' };
const gerente = { rol: 'Gerente', nombre: 'Ana' };
const cajero = { rol: 'Cajero', nombre: 'Juan' };
const gonzalo = { rol: 'Técnico', nombre: 'Gonzalo' };

const incForm = {
  tipo: TIPOS_NOTIF.INCIDENCIA,
  titulo: 'Falla POS',
  mensaje: '3B2 · Área: Virtual · Responsable: Gonzalo · Operación',
};
const recIe = {
  tipo: TIPOS_NOTIF.RECOLECCION_CORTE_IE,
  titulo: 'Recolección Garage',
  mensaje: 'Corte Garage pendiente de IE',
};
const recLiq = {
  tipo: TIPOS_NOTIF.RECOLECCION_POST_LIQ,
  titulo: 'Cobro post-liquidación',
};
const vale = {
  tipo: TIPOS_NOTIF.VALE_PENDIENTE,
  titulo: 'Vale pendiente',
};

assert.equal(esNotificacionFormularioIncidencia(incForm), true);
assert.equal(esNotificacionFormularioIncidencia(recIe), false);
assert.equal(esNotificacionFormularioIncidencia(recLiq), false);
assert.equal(esNotificacionFormularioIncidencia(vale), false);

assert.equal(notificacionEsDeMiBuzon(incForm, admin), true, 'admin ve incidencias del formulario');
assert.equal(notificacionEsDeMiBuzon(incForm, gerente), true, 'gerente ve incidencias del formulario');
assert.equal(notificacionEsDeMiBuzon(incForm, gonzalo), true, 'responsable asignado ve la incidencia');
assert.equal(notificacionEsDeMiBuzon(incForm, cajero), false, 'cajero no asignado no ve la incidencia');

assert.equal(notificacionEsDeMiBuzon(recIe, admin), true, 'admin sigue viendo otros tipos en su buzón genérico');

const mixtas = [incForm, recIe, recLiq, vale];
const soloFormAdmin = filtrarNotificacionesFormularioIncidencia(mixtas, admin, { verTodo: true });
assert.equal(soloFormAdmin.length, 1);
assert.equal(soloFormAdmin[0].tipo, TIPOS_NOTIF.INCIDENCIA);

const soloFormGonzalo = filtrarNotificacionesFormularioIncidencia(mixtas, gonzalo);
assert.equal(soloFormGonzalo.length, 1);

const soloFormCajero = filtrarNotificacionesFormularioIncidencia(mixtas, cajero);
assert.equal(soloFormCajero.length, 0);

console.log('buzonUsuario.incidencias.test.mjs ok');
