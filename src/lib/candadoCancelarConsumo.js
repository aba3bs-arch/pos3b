/**
 * Registro de consumo por empleado.
 * Quien no está en la lista puede registrar consumo.
 * En la lista:
 * - bloqueado: no se le puede registrar consumo.
 * - límite: solo hasta ese monto de hoy.
 */
import { esValeConsumo, resolverBeneficiarioConsumoPin } from './pinBeneficiarioConsumo.js';
import { esEmpleadoConsumoPinCorte } from './empleadosVisibles.js';
import { normalizarNombreMatch } from './contabilidadConstants.js';

const LS_CANDADO = 'pos3b_candado_cancelar_consumo';
export const EVENTO_CANDADO_CANCELAR_CONSUMO = 'pos3b-candado-cancelar-consumo-updated';
export const EVENTO_CONSUMO_LIMITE = 'pos3b-consumo-limite-excedido';
export const TIPO_NOTIF_CONSUMO_LIMITE = 'consumo_limite_excedido';
const TZ = 'America/Hermosillo';

export function hoyConsumoClave(fecha = new Date()) {
  return fecha.toLocaleDateString('en-CA', { timeZone: TZ });
}

function normalizarLimite(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function normalizarCandadoCancelarConsumo(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const mapa = src.empleados && typeof src.empleados === 'object' && !Array.isArray(src.empleados)
    ? src.empleados
    : {};
  const empleados = {};
  for (const [claveRaw, row] of Object.entries(mapa)) {
    const id = String(row?.id || claveRaw || '').trim();
    if (!id) continue;
    const limite = normalizarLimite(row?.limite);
    const modo = String(row?.registrar || '').toLowerCase();
    let registrar = modo === 'limite' || modo === 'bloqueado'
      ? modo
      : (limite != null ? 'limite' : 'bloqueado');
    if (registrar === 'limite' && limite == null) registrar = 'bloqueado';
    empleados[id] = {
      id,
      nombre: String(row?.nombre || '').trim(),
      registrar,
      limite: registrar === 'limite' ? limite : null,
    };
  }
  return { empleados };
}

export function leerCandadoCancelarConsumo() {
  try {
    const raw = localStorage.getItem(LS_CANDADO);
    if (raw == null || raw === '') return { empleados: {}, updatedAt: null };
    const parsed = JSON.parse(raw);
    return { ...normalizarCandadoCancelarConsumo(parsed), updatedAt: parsed?.updatedAt || null };
  } catch {
    return { empleados: {}, updatedAt: null };
  }
}

export function guardarCandadoCancelarConsumo(parcial, opts = {}) {
  const previo = leerCandadoCancelarConsumo();
  const empleados = parcial?.empleados
    ? parcial.empleados
    : previo.empleados;
  const next = {
    ...normalizarCandadoCancelarConsumo({ empleados }),
    updatedAt: opts.updatedAt || new Date().toISOString(),
  };
  localStorage.setItem(LS_CANDADO, JSON.stringify(next));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_CANDADO_CANCELAR_CONSUMO, { detail: next }));
  }
  return next;
}

/** Saca a una persona de la lista. Sin ficha vuelve al comportamiento de siempre: se puede cancelar y no tiene tope. */
export function quitarEmpleadoCandadoConsumo(cfg, id) {
  const empleados = { ...normalizarCandadoCancelarConsumo(cfg).empleados };
  const clave = String(id || '').trim();
  if (clave) delete empleados[clave];
  return { empleados };
}

/** La nube vacía no borra una ficha local más nueva. La nube más nueva sí reemplaza. */
export function debeTomarCandadoRemoto(local, remoto, { localAt = null, remotoAt = null } = {}) {
  const localTiene = Object.keys(local?.empleados || {}).length > 0;
  const remotoTiene = Object.keys(remoto?.empleados || {}).length > 0;
  const rAt = remotoAt ? Date.parse(remotoAt) : 0;
  const lAt = localAt ? Date.parse(localAt) : 0;
  const remotoMs = Number.isFinite(rAt) ? rAt : 0;
  const localMs = Number.isFinite(lAt) ? lAt : 0;
  if (!remotoTiene && localTiene && remotoMs <= localMs) return false;
  if (!remotoTiene && !localTiene) return false;
  return remotoMs >= localMs;
}

export function etiquetaRegistroConsumo(row) {
  if (!row || row.registrar !== 'limite') return 'No registra';
  return etiquetaLimiteConsumo(row.limite);
}

export function etiquetaLimiteConsumo(limite) {
  if (limite == null) return 'Sin límite';
  return `$${(Number(limite) || 0).toFixed(2)} hoy`;
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

function mismoNombre(a, b) {
  const x = normalizarNombreMatch(a);
  const y = normalizarNombreMatch(b);
  return Boolean(x && y && x === y);
}

function mismoBeneficiarioPin(a, b) {
  const pa = resolverBeneficiarioConsumoPin(a);
  const pb = resolverBeneficiarioConsumoPin(b);
  return Boolean(pa && pb && pa.id === pb.id);
}

/** Ficha guardada de esa persona, o null si todavía no tiene candado propio. */
export function configEmpleadoConsumo(cfg, { usuarioId, nombre } = {}) {
  const map = normalizarCandadoCancelarConsumo(cfg).empleados;
  const id = String(usuarioId || '').trim();
  if (id && map[id]) return map[id];
  const nom = nombre || '';
  if (!nom) return null;
  for (const row of Object.values(map)) {
    if (mismoNombre(row.nombre, nom)) return row;
  }
  if (esEmpleadoConsumoPinCorte(nom)) {
    for (const row of Object.values(map)) {
      if (mismoBeneficiarioPin(row.nombre, nom)) return row;
    }
  }
  return null;
}

export function evaluarRegistroConsumo(cfg, ref = {}, { acumulado = 0, monto = 0 } = {}) {
  const row = configEmpleadoConsumo(cfg, ref);
  if (!row) return { ok: true, empleado: null };
  const quien = row.nombre || ref.nombre || 'Este empleado';
  if (row.registrar !== 'limite') {
    return {
      ok: false,
      empleado: row,
      motivo: 'permiso',
      titulo: 'Sin permiso de consumo',
      error: `${quien} no tiene permiso de registrar consumo.`,
    };
  }
  const tope = evaluarLimiteConsumo({
    limite: row.limite,
    acumulado,
    monto,
    nombre: quien,
  });
  if (tope.ok) return { ...tope, empleado: row, motivo: 'limite' };
  return {
    ...tope,
    empleado: row,
    motivo: 'limite',
    titulo: 'Límite de consumo',
  };
}

export function evaluarLimiteConsumo({ limite, acumulado = 0, monto = 0, nombre } = {}) {
  if (limite == null) return { ok: true };
  const lim = Number(limite);
  const lleva = Number(acumulado) || 0;
  const cargo = Number(monto) || 0;
  if (lleva + cargo <= lim + 0.009) {
    return { ok: true, restante: Math.round((lim - lleva - cargo) * 100) / 100 };
  }
  const disponible = Math.max(0, Math.round((lim - lleva) * 100) / 100);
  const quien = nombre || 'Este empleado';
  return {
    ok: false,
    disponible,
    error: `${quien}: su consumo excede el límite permitido de $${lim.toFixed(2)}. Ya lleva $${lleva.toFixed(2)}. Disponible: $${disponible.toFixed(2)}.`,
  };
}

export function notificacionConsumoLimiteParaUsuario(n, user) {
  if (!n || String(n.tipo || '') !== TIPO_NOTIF_CONSUMO_LIMITE || !user) return false;
  if (n.ref_id && user.id && String(n.ref_id) === String(user.id)) return true;
  const nom = normalizarNombreMatch(user.nombre);
  if (!nom) return false;
  const blob = normalizarNombreMatch(`${n.titulo || ''} ${n.mensaje || ''}`);
  return blob.startsWith(nom) || blob.includes(` ${nom}`);
}

async function avisarConsumoSinAprobar(supabase, { nombre, usuarioId, sucursalId, mensaje, titulo }) {
  const detail = {
    tipo: TIPO_NOTIF_CONSUMO_LIMITE,
    titulo: titulo || 'Consumo no aprobado',
    mensaje: mensaje || `${nombre || 'El empleado'} no tiene permiso de registrar consumo.`,
    sucursal_id: sucursalId || 'MAIN',
    ref_tabla: 'usuarios',
    ref_id: usuarioId || null,
  };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_CONSUMO_LIMITE, { detail }));
  }
  if (!supabase) return;
  try {
    const { crearNotificacion, listarNotificacionesPendientes } = await import('./contabilidadNotificaciones.js');
    if (usuarioId) {
      const prev = await listarNotificacionesPendientes(supabase, {
        todasTiendas: true,
        tipos: [TIPO_NOTIF_CONSUMO_LIMITE],
        limit: 20,
      });
      const reciente = (prev.data || []).find((n) => String(n.ref_id || '') === String(usuarioId));
      const edad = reciente?.created_at ? Date.now() - Date.parse(reciente.created_at) : Infinity;
      if (reciente && edad < 90_000) return;
    }
    await crearNotificacion(supabase, detail, { silenciosoLocal: true, skipPush: true });
  } catch {
    /* el aviso local de la pantalla abierta ya se disparó */
  }
}

function registroDeEstaPersona(registro, ref) {
  const id = String(ref.usuarioId || '').trim();
  const rid = String(registro.usuario_id || registro.usuarioId || '').trim();
  if (id && rid && id === rid) return true;
  const nombre = ref.nombre || '';
  const rn = registro.usuario_nombre || registro.nombre_empleado || registro.nombre || '';
  if (mismoNombre(nombre, rn)) return true;
  if (esEmpleadoConsumoPinCorte(nombre) && mismoBeneficiarioPin(nombre, rn)) return true;
  return false;
}

/** Suma el consumo de hoy: gastos del corte más vales que aún no están en el corte. */
export async function acumuladoConsumoHoy(supabase, ref = {}, { excluirValeId, excluirGastoId } = {}) {
  if (!supabase) return 0;
  const hoy = hoyConsumoClave();
  const desde = `${hoy}T00:00:00-07:00`;
  const hasta = `${hoy}T23:59:59-07:00`;
  let total = 0;

  const gastos = await supabase
    .from('cortes_contabilidad_gastos')
    .select('id, monto, categoria, subcategoria, usuario_id, usuario_nombre, created_at')
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .limit(500);
  if (!gastos.error) {
    for (const g of gastos.data || []) {
      if (excluirGastoId && String(g.id) === String(excluirGastoId)) continue;
      if (!esRegistroConsumo(g) || !registroDeEstaPersona(g, ref)) continue;
      total += Number(g.monto) || 0;
    }
  }

  const vales = await supabase
    .from('vales')
    .select('id, monto, categoria, subcategoria, detalle, nombre_empleado, usuario_id, estado_aprobacion, cargado_corte, fecha')
    .eq('fecha', hoy)
    .limit(300);
  if (!vales.error) {
    for (const v of vales.data || []) {
      if (excluirValeId && String(v.id) === String(excluirValeId)) continue;
      if (v.cargado_corte) continue;
      const est = String(v.estado_aprobacion || 'aprobado');
      if (est === 'cancelado' || est === 'rechazado') continue;
      if (!esRegistroConsumo(v) || !registroDeEstaPersona(v, ref)) continue;
      total += Number(v.monto) || 0;
    }
  }

  return Math.round(total * 100) / 100;
}

async function candadoVigente(supabase) {
  if (supabase) {
    try {
      const { sincronizarCandadoCancelarConsumoDesdeNube } = await import('./candadoCancelarConsumoSync.js');
      await sincronizarCandadoCancelarConsumoDesdeNube(supabase);
    } catch {
      /* sigue el candado de este equipo */
    }
  }
  return leerCandadoCancelarConsumo();
}

export async function revisarLimiteConsumo(supabase, registro = {}, extra = {}) {
  if (!esRegistroConsumo(registro)) return { ok: true, consumo: false };
  if (String(registro.comentario || '').toUpperCase().includes('VALE ')) return { ok: true, consumo: true, omitido: true };
  const ref = {
    usuarioId: registro.usuario_id || registro.usuarioId,
    nombre: registro.usuario_nombre || registro.nombre_empleado || registro.nombre,
  };
  const cfg = await candadoVigente(supabase);
  const row = configEmpleadoConsumo(cfg, ref);
  if (!row) return { ok: true, consumo: true };
  const acumulado = row.registrar === 'limite'
    ? await acumuladoConsumoHoy(supabase, { ...ref, nombre: ref.nombre || row.nombre }, extra)
    : 0;
  const res = evaluarRegistroConsumo(cfg, { ...ref, nombre: ref.nombre || row.nombre }, {
    acumulado,
    monto: registro.monto,
  });
  if (!res.ok) {
    await avisarConsumoSinAprobar(supabase, {
      nombre: row.nombre || ref.nombre,
      usuarioId: row.id || ref.usuarioId,
      sucursalId: registro.sucursal_id || registro.sucursalId,
      titulo: res.titulo,
      mensaje: res.error,
    });
  }
  return { ...res, consumo: true, limite: !res.ok };
}
