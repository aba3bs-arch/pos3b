import { leerPrivilegios } from './posConfig.js';

export const ACCION_PLAN_HORARIO = 'chec_plan_horario';
/** Asignar / quitar descansos en el calendario (privilegio aparte del solo ver el plan). */
export const ACCION_ASIGNAR_DESCANSOS = 'chec_asignar_descansos';

export const ACCIONES_CHECADOR_PRIVILEGIO = [
  {
    id: ACCION_PLAN_HORARIO,
    label: 'Plan horario (calendario)',
    desc: 'Ver el plan semanal de todas las tiendas (turnos, colores y cubre turnos). El administrador siempre lo tiene.',
  },
  {
    id: ACCION_ASIGNAR_DESCANSOS,
    label: 'Asignar descansos (Plan horario)',
    desc: 'Marcar o quitar descansos en Checador → Plan horario. Solo administrador o quien tenga este privilegio.',
  },
];

export const IDS_ACCIONES_CHECADOR = new Set(ACCIONES_CHECADOR_PRIVILEGIO.map((a) => a.id));

/**
 * Sin checkbox: solo Administrador tiene ambos.
 * Gerente/Supervisor u otros se otorgan en Configuración → Privilegios → Checador.
 */
export const ACCIONES_DEFAULT_CHECADOR_POR_ROL = {
  Administrador: [ACCION_PLAN_HORARIO, ACCION_ASIGNAR_DESCANSOS],
  Gerente: [],
  Supervisor: [],
  Auditor: [],
  Cajero: [],
  Repartidor: [],
  Técnico: [],
};

export const DESCRIPCION_MODULO_CHECADOR =
  'Precios, reloj y asistencia. El plan horario se activa abajo. '
  + 'Ver el calendario y asignar descansos son privilegios distintos (admin siempre; el resto con checkbox).';

const ROLES_SISTEMA = ['Cajero', 'Auditor', 'Repartidor', 'Supervisor', 'Gerente', 'Técnico', 'Administrador', 'Cliente'];

function normRol(rol) {
  const r = String(rol ?? '').trim();
  if (ROLES_SISTEMA.includes(r)) return r;
  const found = ROLES_SISTEMA.find((x) => x.toLowerCase() === r.toLowerCase());
  return found || r;
}

function lecturaExplicitaAccion(data, accionId, rol, userId) {
  const acc = data?.acciones?.[accionId];
  if (!acc) return null;
  const uid = userId != null ? String(userId) : '';
  if (uid && Object.prototype.hasOwnProperty.call(acc.porUsuario || {}, uid)) {
    return Boolean(acc.porUsuario[uid]);
  }
  if (Object.prototype.hasOwnProperty.call(acc.porRol || {}, rol)) {
    return Boolean(acc.porRol[rol]);
  }
  return null;
}

/**
 * ¿Puede ver el plan horario del Checador?
 * Administrador siempre sí. Si hay checkbox en Configuración, manda.
 */
export function tieneAccionPlanHorario(rol, userId = null, data = null) {
  const r = normRol(rol);
  if (r === 'Administrador') return true;
  const privilegios = data || leerPrivilegios();
  const explicito = lecturaExplicitaAccion(privilegios, ACCION_PLAN_HORARIO, r, userId);
  if (explicito !== null) return explicito;
  return (ACCIONES_DEFAULT_CHECADOR_POR_ROL[r] || []).includes(ACCION_PLAN_HORARIO);
}

/**
 * ¿Puede marcar / quitar descansos en Plan horario?
 * Privilegio independiente: lo asigna el admin (o quien gestione privilegios).
 */
export function tieneAccionAsignarDescansos(rol, userId = null, data = null) {
  const r = normRol(rol);
  if (r === 'Administrador') return true;
  const privilegios = data || leerPrivilegios();
  const explicito = lecturaExplicitaAccion(privilegios, ACCION_ASIGNAR_DESCANSOS, r, userId);
  if (explicito !== null) return explicito;
  return (ACCIONES_DEFAULT_CHECADOR_POR_ROL[r] || []).includes(ACCION_ASIGNAR_DESCANSOS);
}

export function tieneAccionChecador(accionId, rol, userId = null, data = null) {
  if (accionId === ACCION_PLAN_HORARIO) return tieneAccionPlanHorario(rol, userId, data);
  if (accionId === ACCION_ASIGNAR_DESCANSOS) return tieneAccionAsignarDescansos(rol, userId, data);
  if (!IDS_ACCIONES_CHECADOR.has(accionId)) return false;
  const r = normRol(rol);
  if (r === 'Administrador') return true;
  const privilegios = data || leerPrivilegios();
  const explicito = lecturaExplicitaAccion(privilegios, accionId, r, userId);
  if (explicito !== null) return explicito;
  return (ACCIONES_DEFAULT_CHECADOR_POR_ROL[r] || []).includes(accionId);
}
