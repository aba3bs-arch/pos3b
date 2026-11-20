/**
 * Candado para cancelar consumo de empleados.
 * ON: se puede cancelar (borrar el vale o el gasto de corte).
 * OFF: el consumo queda; no se puede cancelar.
 * Un interruptor para directos (tienda) y otro para indirectos (MAIN).
 */
import { esValeConsumo } from './pinBeneficiarioConsumo.js';
import { esEmpleadoConsumoPinCorte, esEmpleadoIndirectoOMain } from './empleadosVisibles.js';
import { normalizarNombreMatch } from './contabilidadConstants.js';

const LS_CANDADO = 'pos3b_candado_cancelar_consumo';
export const EVENTO_CANDADO_CANCELAR_CONSUMO = 'pos3b-candado-cancelar-consumo-updated';

/** Por defecto se puede cancelar, igual que antes de este candado. */
export const CANDADO_CANCELAR_CONSUMO_DEFAULT = { directos: true, indirectos: true };

function normalizarLado(val, fallback) {
  if (val === false || val === 0 || val === '0' || val === 'false') return false;
  if (val === true || val === 1 || val === '1' || val === 'true') return true;
  return fallback;
}

export function normalizarCandadoCancelarConsumo(raw) {
  const base = CANDADO_CANCELAR_CONSUMO_DEFAULT;
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    directos: normalizarLado(src.directos, base.directos),
    indirectos: normalizarLado(src.indirectos, base.indirectos),
  };
}

export function leerCandadoCancelarConsumo() {
  try {
    const raw = localStorage.getItem(LS_CANDADO);
    if (raw == null || raw === '') return { ...CANDADO_CANCELAR_CONSUMO_DEFAULT };
    return normalizarCandadoCancelarConsumo(JSON.parse(raw));
  } catch {
    return { ...CANDADO_CANCELAR_CONSUMO_DEFAULT };
  }
}

export function guardarCandadoCancelarConsumo(parcial) {
  const next = normalizarCandadoCancelarConsumo({ ...leerCandadoCancelarConsumo(), ...parcial });
  localStorage.setItem(LS_CANDADO, JSON.stringify(next));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_CANDADO_CANCELAR_CONSUMO, { detail: next }));
  }
  return next;
}

export function etiquetaCandadoCancelarConsumo(activo) {
  return activo ? 'ON (se puede cancelar)' : 'OFF (no se puede cancelar)';
}

/** True si el vale o el gasto de corte es un consumo (no faltante, anticipo ni recarga). */
export function esRegistroConsumo(registro = {}) {
  const categoria = registro.categoria;
  const subcategoria = registro.subcategoria;
  const detalle = registro.detalle;
  if (esValeConsumo(categoria, subcategoria, detalle)) return true;
  const blob = [categoria, subcategoria, detalle].map((s) => String(s || '').toUpperCase()).join(' ');
  return blob.includes('CONSUMO');
}

export function evaluarCandadoCancelarConsumo(cfg, tipo) {
  const c = normalizarCandadoCancelarConsumo(cfg);
  const indirecto = tipo === 'indirecto';
  const permitido = indirecto ? c.indirectos : c.directos;
  if (permitido) return { ok: true, tipo: indirecto ? 'indirecto' : 'directo' };
  const quien = indirecto ? 'indirectos' : 'directos';
  return {
    ok: false,
    tipo: quien === 'indirectos' ? 'indirecto' : 'directo',
    error: `El candado de cancelar consumo está apagado para empleados ${quien}. Enciéndelo en Configuración → Operación.`,
  };
}

function mismoNombre(a, b) {
  const x = normalizarNombreMatch(a);
  const y = normalizarNombreMatch(b);
  return Boolean(x && y && x === y);
}

/** Directo (tienda) o indirecto (MAIN / consumo con PIN). */
export async function clasificarEmpleadoConsumo(supabase, { usuarioId, nombre } = {}) {
  const id = String(usuarioId || '').trim();
  const nom = nombre || '';
  if (id.startsWith('consumo-pin:') || esEmpleadoConsumoPinCorte(nom)) return 'indirecto';
  if (!supabase) return 'directo';
  const cols = 'id, nombre, rol, sucursal_id, tipo_empleado, turno_id, turno_horario, activo';
  if (/^[0-9a-f-]{16,}$/i.test(id)) {
    const { data } = await supabase.from('usuarios').select(cols).eq('id', id).maybeSingle();
    if (data) return esEmpleadoIndirectoOMain(data) ? 'indirecto' : 'directo';
  }
  if (nom) {
    const { data } = await supabase.from('usuarios').select(cols).limit(500);
    const hit = (data || []).find((u) => mismoNombre(u?.nombre, nom) || String(u?.id) === id);
    if (hit) return esEmpleadoIndirectoOMain(hit) ? 'indirecto' : 'directo';
  }
  return 'directo';
}

/**
 * Si el registro no es consumo, deja pasar.
 * Si es consumo, respeta el candado del tipo de empleado.
 */
export async function revisarCancelarConsumo(supabase, registro = {}) {
  if (!esRegistroConsumo(registro)) return { ok: true, consumo: false };
  const tipo = await clasificarEmpleadoConsumo(supabase, {
    usuarioId: registro.usuario_id || registro.usuarioId,
    nombre: registro.usuario_nombre || registro.nombre_empleado || registro.nombre,
  });
  const res = evaluarCandadoCancelarConsumo(leerCandadoCancelarConsumo(), tipo);
  return { ...res, consumo: true };
}
