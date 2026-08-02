import { normalizarRol } from '../roles.js';
import { leerPrivilegios } from '../posConfig.js';

const ROLES_OPERACION = new Set(['Cajero', 'Supervisor', 'Repartidor', 'Técnico']);

/** Permisos de cortes contabilidad — aislados del Corte de caja del POS. */
export function permisosCorteContabilidad(rol, userId = null) {
  const r = normalizarRol(rol);
  const esAdmin = r === 'Administrador';
  const rec = esAdmin || puedeRecoleccionCortes(rol, userId);

  let base;
  if (esAdmin) {
    base = {
      guardar: true,
      gastos: true,
      comentarios: true,
      moneda_inicial: true,
      moneda_final: true,
      faltante: true,
      fondo: true,
      caja_anterior: true,
      folio: true,
      soloLectura: false,
    };
  } else if (r === 'Gerente' || ROLES_OPERACION.has(r)) {
    base = {
      guardar: true,
      gastos: true,
      comentarios: true,
      moneda_inicial: false,
      moneda_final: true,
      faltante: true,
      fondo: false,
      caja_anterior: false,
      folio: false,
      soloLectura: false,
    };
  } else if (r === 'Auditor') {
    base = {
      guardar: false,
      gastos: false,
      comentarios: false,
      moneda_inicial: false,
      moneda_final: false,
      faltante: false,
      fondo: false,
      caja_anterior: false,
      folio: false,
      soloLectura: true,
    };
  } else {
    base = {
      guardar: false,
      gastos: false,
      comentarios: false,
      moneda_inicial: false,
      moneda_final: false,
      faltante: false,
      fondo: false,
      caja_anterior: false,
      folio: false,
      soloLectura: true,
    };
  }

  if (rec && !esAdmin) {
    base.moneda_inicial = true;
    base.caja_anterior = true;
  }

  return {
    ...base,
    recoleccion: rec,
    editarTodo: esAdmin,
  };
}

/** Solo administrador, repartidor/recolector, o quien tenga el privilegio marcado. */
export function puedeRecoleccionCortes(rol, userId = null) {
  const r = normalizarRol(rol);
  if (r === 'Administrador') return true;
  // Repartidor (= Recolector) siempre puede recolectar; no depende de quitar privilegios al cajero.
  if (r === 'Repartidor') return true;
  const p = leerPrivilegios();
  const acc = p.acciones?.recoleccion_cortes || {};
  const uid = userId != null ? String(userId) : '';
  if (uid && acc.porUsuario?.[uid]) return true;
  if (acc.porRol?.[r]) return true;
  return false;
}

export function etiquetaTipoCierre(detalle) {
  const t = detalle?.tipo_cierre;
  if (t === 'recoleccion') return 'Recolección';
  if (t === 'recoleccion_temporal') return 'Recolección temporal';
  if (t === 'actualizacion') return 'Actualización';
  return 'Cierre';
}

/** ¿Puede editar un campo operativo del corte? (cajero: moneda final, faltante, gastos) */
export function puedeEditarCorteCampo(perm, campo) {
  if (!perm || perm.soloLectura) return false;
  if (perm.editarTodo) return true;
  if (perm[campo] === true) return true;
  if (perm.guardar && ['moneda_final', 'faltante', 'comentarios'].includes(campo)) return true;
  if (perm.gastos && campo === 'gastos') return true;
  return false;
}
