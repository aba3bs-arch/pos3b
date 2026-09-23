/**
 * Alarma de asalto / pánico.
 * Activación:
 *  - ≥ TECLAS_MIN_ASALTO teclas a la vez (cualquier combinación), o
 *  - Escape pulsado ESC_TAPS_ASALTO veces seguidas en ≤ ESC_VENTANA_MS.
 * Destino: Administradores + empleados indirectos (MAIN).
 *
 * Nota: muchos teclados baratos no registran 5 teclas a la vez (ghosting);
 * por eso el mínimo práctico es 3 y existe Escape ×5 como respaldo.
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { crearNotificacion, TIPOS_NOTIF } from './contabilidadNotificaciones.js';
import { esEmpleadoIndirectoOMain } from './empleadosVisibles.js';
import { normalizarRol } from './roles.js';
import { iniciarSirenaAsalto, detenerSirenaAsalto, prepararAudioPos } from './sonidosPos.js';

/** Mínimo de teclas simultáneas (3 = fiable en teclados con ghosting). */
export const TECLAS_MIN_ASALTO = 3;
/** Escape pulsado N veces seguidas (respaldo si el teclado no registra acordes). */
export const ESC_TAPS_ASALTO = 5;
export const ESC_VENTANA_MS = 2500;

export const EVENTO_ALERTA_ASALTO = 'pos-alerta-asalto';
export const EVENTO_ALERTA_ASALTO_DETENER = 'pos-alerta-asalto-detener';

export const TEXTO_ALERTA_ASALTO = 'ASALTO EN PROCESO';
export const TEXTO_ALERTA_ASALTO_SUB =
  'Alarma de emergencia activada. Verifica la tienda y contacta a seguridad / autoridades si aplica.';

const COOLDOWN_MS = 45_000;
let ultimoDisparoAt = 0;
let disparando = false;

/** Solo para pruebas unitarias. */
export function _resetCooldownAlertaAsaltoParaTests() {
  ultimoDisparoAt = 0;
  disparando = false;
}

export function teclasSimultaneasActivanAsalto(cantidad) {
  return Number(cantidad) >= TECLAS_MIN_ASALTO;
}

/** ¿Este usuario debe recibir la alerta remota (overlay + push elegible)? */
export function usuarioRecibeAlertaAsalto(user) {
  if (!user || user.esCtMovil) return false;
  const rol = normalizarRol(user.rol);
  if (rol === 'Administrador' || rol === 'Gerente') return true;
  return esEmpleadoIndirectoOMain(user);
}

/**
 * Lista destinatarios: admins activos + indirectos MAIN.
 */
export async function listarDestinatariosAlertaAsalto(supabase) {
  if (!supabase) return { data: [], error: 'Sin conexión.' };
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, sucursal_id, tipo_empleado, activo')
    .eq('activo', true)
    .order('nombre', { ascending: true })
    .limit(400);
  if (error) return { data: [], error: error.message };
  const lista = (data || []).filter((u) => usuarioRecibeAlertaAsalto(u));
  return { data: lista };
}

export function mensajeAlertaAsalto({ sucursal, usuarioNombre, teclas, modo } = {}) {
  const tienda = etiquetaTienda(sucursal) || normalizarCodigoTienda(sucursal) || sucursal || 'tienda';
  const quien = String(usuarioNombre || 'POS').trim() || 'POS';
  let extra = '';
  if (modo === 'prueba') extra = ' · PRUEBA';
  else if (modo === 'escape') extra = ` · Escape×${ESC_TAPS_ASALTO}`;
  else if (teclas != null) extra = ` · ${teclas} teclas`;
  return `${tienda} · activó ${quien}${extra}`;
}

function emitirEventoAsalto(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_ALERTA_ASALTO, { detail }));
}

export function emitirDetenerAlertaAsalto() {
  if (typeof window === 'undefined') return;
  detenerSirenaAsalto();
  window.dispatchEvent(new CustomEvent(EVENTO_ALERTA_ASALTO_DETENER));
}

/**
 * Dispara la alarma desde la sesión actual (cualquiera logueado en tienda).
 * - Sirena + overlay local inmediato
 * - Notificación en buzón + push a admins / indirectos MAIN
 * @param {{ forzar?: boolean, modo?: 'teclas'|'escape'|'prueba', teclas?: number }} opts
 */
export async function dispararAlertaAsalto(supabase, {
  user,
  sucursal,
  teclas = TECLAS_MIN_ASALTO,
  forzar = false,
  modo = 'teclas',
} = {}) {
  const ahora = Date.now();
  if (disparando) return { ok: false, skipped: true, error: 'Ya se está enviando la alarma.' };
  if (!forzar && ahora - ultimoDisparoAt < COOLDOWN_MS) {
    return { ok: false, skipped: true, error: 'Espera unos segundos antes de volver a activar.' };
  }
  disparando = true;
  ultimoDisparoAt = ahora;

  try {
    prepararAudioPos();
    iniciarSirenaAsalto();

    const titulo = TEXTO_ALERTA_ASALTO;
    const mensaje = mensajeAlertaAsalto({
      sucursal,
      usuarioNombre: user?.nombre,
      teclas,
      modo,
    });
    const detailLocal = {
      titulo,
      mensaje,
      sucursal_id: sucursal || null,
      origen_usuario: user?.nombre || null,
      origen_usuario_id: user?.id || null,
      teclas,
      modo,
      at: new Date().toISOString(),
      local: true,
    };
    emitirEventoAsalto(detailLocal);

    const dest = await listarDestinatariosAlertaAsalto(supabase);
    const usuarioIds = (dest.data || []).map((u) => String(u.id)).filter(Boolean);

    const notif = await crearNotificacion(
      supabase,
      {
        sucursal_id: sucursal || 'MAIN',
        tipo: TIPOS_NOTIF.ASALTO,
        ref_tabla: 'alerta_asalto',
        ref_id: `${Date.now()}`,
        titulo,
        mensaje,
        area_buzon: 'main',
      },
      { usuarioIds, modoPush: 'asalto' },
    );

    return {
      ok: true,
      id: notif.id,
      destinatarios: usuarioIds.length,
      aviso: dest.error || null,
    };
  } finally {
    disparando = false;
  }
}

/**
 * Tracker de teclas simultáneas + Escape × N.
 */
export function crearDetectorTeclasAsalto({
  minimo = TECLAS_MIN_ASALTO,
  escTaps = ESC_TAPS_ASALTO,
  escVentanaMs = ESC_VENTANA_MS,
  onActivar,
  habilitado = () => true,
} = {}) {
  const pressed = new Set();
  let disparadoEnEsteAcorde = false;
  const escTimes = [];

  const onKeyDown = (e) => {
    if (!habilitado()) return;
    if (e.repeat) return;
    const code = e.code || e.key;
    if (!code) return;

    // Respaldo: Escape × N
    if (code === 'Escape' || e.key === 'Escape') {
      const now = Date.now();
      escTimes.push(now);
      while (escTimes.length && now - escTimes[0] > escVentanaMs) escTimes.shift();
      if (escTimes.length >= escTaps) {
        escTimes.length = 0;
        onActivar?.({ teclas: escTaps, codes: ['Escape'], modo: 'escape' });
        return;
      }
    }

    pressed.add(code);
    if (pressed.size >= minimo && !disparadoEnEsteAcorde) {
      disparadoEnEsteAcorde = true;
      onActivar?.({ teclas: pressed.size, codes: [...pressed], modo: 'teclas' });
    }
  };

  const onKeyUp = (e) => {
    const code = e.code || e.key;
    if (code) pressed.delete(code);
    if (pressed.size === 0) disparadoEnEsteAcorde = false;
  };

  const onBlur = () => {
    pressed.clear();
    disparadoEnEsteAcorde = false;
  };

  const attach = (target = typeof window !== 'undefined' ? window : null) => {
    if (!target) return () => {};
    target.addEventListener('keydown', onKeyDown, true);
    target.addEventListener('keyup', onKeyUp, true);
    target.addEventListener('blur', onBlur, true);
    return () => {
      target.removeEventListener('keydown', onKeyDown, true);
      target.removeEventListener('keyup', onKeyUp, true);
      target.removeEventListener('blur', onBlur, true);
      pressed.clear();
    };
  };

  return { attach, pressed };
}
