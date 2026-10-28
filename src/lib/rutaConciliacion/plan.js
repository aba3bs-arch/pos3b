import { ESTADOS_ACTIVOS, ORDEN_SEVERIDAD } from './config.js';
import { rolSistemaEfectivo } from '../roles.js';

const REFRESCO_ULTIMA_VEZ_MS = 6 * 3600000;
const CAMPOS_IMPORTE = ['esperado', 'registrado', 'diferencia', 'severidad'];

const igual = (a, b) => (a == null && b == null) || Number(a) === Number(b) || a === b;

/**
 * Compara los hallazgos de esta corrida con lo ya guardado. No toca la base de datos.
 * Solo auto-resuelve cuando la corrida fue completa y la venta se volvió a revisar.
 */
export function planificarSincronizacion({
  existentes = [], hallazgos = [], ventasRevisadas = [], completa = true, ahora = new Date(),
} = {}) {
  const iso = ahora.toISOString();
  const porClave = new Map(existentes.map((a) => [a.clave, a]));
  const vistos = new Set();
  const plan = { insertar: [], actualizar: [], autoResolver: [], nuevasCriticas: [], escaladas: [] };

  for (const h of hallazgos) {
    if (vistos.has(h.clave)) continue;
    vistos.add(h.clave);
    const ex = porClave.get(h.clave);
    if (!ex) {
      plan.insertar.push({ ...h, estado: 'abierta', primera_vez_at: iso, ultima_vez_at: iso });
      if (h.severidad === 'critica') plan.nuevasCriticas.push(h);
      continue;
    }
    const patch = {};
    const cambioImporte = CAMPOS_IMPORTE.some((k) => !igual(ex[k], h[k]));
    const reabrir = ['resuelta', 'auto_resuelta'].includes(ex.estado)
      || (ex.estado === 'justificada' && CAMPOS_IMPORTE.some((k) => k !== 'severidad' && !igual(ex[k], h[k])));
    if (reabrir) {
      Object.assign(patch, { estado: 'abierta', resuelta_at: null, resuelta_por: null, nota_resolucion: null, notificada_at: null });
      if (h.severidad === 'critica') plan.nuevasCriticas.push(h);
    }
    if (cambioImporte) {
      Object.assign(patch, { esperado: h.esperado, registrado: h.registrado, diferencia: h.diferencia, severidad: h.severidad, detalle: h.detalle });
      if ((ORDEN_SEVERIDAD[h.severidad] ?? 9) < (ORDEN_SEVERIDAD[ex.severidad] ?? 9)) {
        plan.escaladas.push(h);
        if (h.severidad === 'critica' && !reabrir) plan.nuevasCriticas.push(h);
        patch.notificada_at = null;
      }
    }
    const antigua = !ex.ultima_vez_at || ahora.getTime() - new Date(ex.ultima_vez_at).getTime() > REFRESCO_ULTIMA_VEZ_MS;
    if (antigua || Object.keys(patch).length) patch.ultima_vez_at = iso;
    if (Object.keys(patch).length) plan.actualizar.push({ id: ex.id, patch });
  }

  if (completa) {
    const revisadas = new Set(ventasRevisadas.map(String));
    for (const ex of existentes) {
      if (vistos.has(ex.clave)) continue;
      if (!ESTADOS_ACTIVOS.includes(ex.estado)) continue;
      if (!revisadas.has(String(ex.venta_id))) continue;
      plan.autoResolver.push(ex.id);
    }
  }
  return plan;
}

export function puedeGestionarAlerta(rol, severidad) {
  const r = rolSistemaEfectivo(rol);
  if (severidad === 'critica') return r === 'Administrador';
  return r === 'Administrador' || r === 'Gerente';
}

export function validarCambioEstado({ estado, nota, rol, severidad }) {
  if (!['en_revision', 'justificada', 'resuelta', 'abierta'].includes(estado)) return 'Estado no válido.';
  if (!puedeGestionarAlerta(rol, severidad)) {
    return severidad === 'critica'
      ? 'Solo un administrador puede gestionar una alerta crítica.'
      : 'No tienes permiso para gestionar alertas.';
  }
  if (['justificada', 'resuelta'].includes(estado) && String(nota || '').trim().length < 5) {
    return 'Escribe una nota de al menos 5 caracteres.';
  }
  return null;
}
