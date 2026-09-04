import { leerPrivilegios } from './posConfig.js';

export const ACCION_PLAN_HORARIO = 'chec_plan_horario';

export const ACCIONES_CHECADOR_PRIVILEGIO = [
  {
    id: ACCION_PLAN_HORARIO,
    label: 'Plan horario (calendario)',
    desc: 'Ver y editar el plan semanal de todas las tiendas: turnos, descansos, colores y cubre turnos (CT).',
  },
];

export const IDS_ACCIONES_CHECADOR = new Set(ACCIONES_CHECADOR_PRIVILEGIO.map((a) => a.id));

/** Sin checkbox: solo Administrador. Gerente/Supervisor se otorgan en Configuración. */
export const ACCIONES_DEFAULT_CHECADOR_POR_ROL = {
  Administrador: [ACCION_PLAN_HORARIO],
  Gerente: [],
  Supervisor: [],
  Auditor: [],
  Cajero: [],
  Repartidor: [],
  Técnico: [],
};

export const DESCRIPCION_MODULO_CHECADOR =
  'Precios, reloj y asistencia. El plan horario tipo calendario se activa abajo en Checador — Plan horario (admin siempre; el resto con privilegio).';

const ROLES_SISTEMA = ['Cajero', 'Auditor', 'Repartidor', 'Supervisor', 'Gerente', 'Técnico', 'Administrador'];

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
 * ¿Puede ver/editar el plan horario del Checador?
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

export function tieneAccionChecador(accionId, rol, userId = null, data = null) {
  if (accionId === ACCION_PLAN_HORARIO) return tieneAccionPlanHorario(rol, userId, data);
  if (!IDS_ACCIONES_CHECADOR.has(accionId)) return false;
  const r = normRol(rol);
  if (r === 'Administrador') return true;
  const privilegios = data || leerPrivilegios();
  const explicito = lecturaExplicitaAccion(privilegios, accionId, r, userId);
  if (explicito !== null) return explicito;
  return (ACCIONES_DEFAULT_CHECADOR_POR_ROL[r] || []).includes(accionId);
}
