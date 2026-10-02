/**
 * Rastreo de uso del POS: quién, desde qué dispositivo y qué hizo.
 * Persistencia: pos_auditoria_eventos (append-only) + buffer local de respaldo.
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  dispositivosVinculadosUsuario,
  esTerminalTiendaFijada,
  obtenerIdDispositivoLocal,
} from './dispositivoUsuario.js';
import { normalizarRol, rolSistemaEfectivo } from './roles.js';

export const LS_AUDITORIA_BUFFER = 'pos3b_auditoria_buffer';
export const EVENTO_AUDITORIA = 'pos3b-auditoria-evento';

export const AVISO_FALTA_AUDITORIA_SQL =
  'Ejecuta supabase/fix_auditoria_uso.sql en Supabase para guardar el rastreo de uso entre cajas.';

/** Tipos de evento del módulo Auditoría. */
export const TIPOS_AUDITORIA = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  VISTA: 'VISTA',
  PIN_ADMIN: 'PIN_ADMIN',
  CONFIG: 'CONFIG',
  CORTE_DELETE: 'CORTE_DELETE',
  CORTE_EDIT: 'CORTE_EDIT',
  CORTE_RESTORE: 'CORTE_RESTORE',
  DISPOSITIVO: 'DISPOSITIVO',
  PURGA: 'PURGA',
  SEGURIDAD: 'SEGURIDAD',
};

export const SEVERIDAD_AUDITORIA = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

export const ETIQUETAS_TIPO_AUDITORIA = {
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  VISTA: 'Módulo / pantalla',
  PIN_ADMIN: 'PIN de administrador',
  CONFIG: 'Configuración',
  CORTE_DELETE: 'Borrado de corte',
  CORTE_EDIT: 'Edición de corte',
  CORTE_RESTORE: 'Restaurar corte',
  DISPOSITIVO: 'Dispositivo',
  PURGA: 'Purga de datos',
  SEGURIDAD: 'Alerta de seguridad',
};

const BUFFER_MAX = 200;

/** @type {{ supabase: any, user: any, sucursal: string|null }} */
let contexto = { supabase: null, user: null, sucursal: null };

/** Evita spam de VISTA al re-entrar al mismo módulo. */
let ultimaVistaRegistrada = '';
let ultimaVistaTs = 0;

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_auditoria_eventos')
    || (msg.includes('schema cache') && msg.includes('auditoria'))
    || (msg.includes('does not exist') && msg.includes('pos_auditoria'))
  );
}

function cortoDispositivo(id) {
  const s = String(id || '').trim();
  if (!s) return '—';
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function leerUa() {
  try {
    return String(navigator?.userAgent || '').slice(0, 280);
  } catch {
    return '';
  }
}

/** Heurística móvil / tablet vs PC de sucursal. */
export function detectarEsMovil(ua = leerUa()) {
  const s = String(ua || '');
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(s);
}

export function resumenUserAgent(ua = leerUa()) {
  const s = String(ua || '');
  if (!s) return 'Desconocido';
  if (/Edg\//i.test(s)) return 'Edge';
  if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) return 'Chrome';
  if (/Safari\//i.test(s) && !/Chrome\//i.test(s)) return 'Safari';
  if (/Firefox\//i.test(s)) return 'Firefox';
  return s.slice(0, 40);
}

/**
 * Contexto de dispositivo para cada evento.
 * @param {object|null} user
 */
export function snapshotDispositivo(user = null) {
  const dispositivo_id = obtenerIdDispositivoLocal();
  const ua = leerUa();
  const es_movil = detectarEsMovil(ua);
  const terminal_tienda = esTerminalTiendaFijada();
  const anclados = dispositivosVinculadosUsuario(user || contexto.user || {});
  const dispositivo_reconocido = anclados.length === 0
    ? terminal_tienda
    : anclados.includes(dispositivo_id);
  return {
    dispositivo_id,
    dispositivo_corto: cortoDispositivo(dispositivo_id),
    dispositivo_reconocido,
    es_movil,
    terminal_tienda,
    user_agent: ua,
    navegador: resumenUserAgent(ua),
  };
}

export function configurarContextoAuditoria({ supabase = null, user = null, sucursal = null } = {}) {
  contexto = {
    supabase: supabase ?? contexto.supabase,
    user: user === undefined ? contexto.user : user,
    sucursal: sucursal != null ? normalizarCodigoTienda(sucursal) : contexto.sucursal,
  };
  return contexto;
}

export function leerContextoAuditoria() {
  return { ...contexto };
}

function pushBufferLocal(row) {
  try {
    const raw = localStorage.getItem(LS_AUDITORIA_BUFFER);
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list : [];
    next.unshift(row);
    localStorage.setItem(LS_AUDITORIA_BUFFER, JSON.stringify(next.slice(0, BUFFER_MAX)));
  } catch {
    /* ignore */
  }
}

export function leerBufferAuditoriaLocal() {
  try {
    const raw = localStorage.getItem(LS_AUDITORIA_BUFFER);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function emitirEventoLocal(row) {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(EVENTO_AUDITORIA, { detail: row }));
    }
  } catch {
    /* ignore */
  }
}

function normalizarSeveridad(s, tipo, detalle = {}) {
  const v = String(s || '').toLowerCase();
  if (v === 'critical' || v === 'warning' || v === 'info') return v;
  if (tipo === TIPOS_AUDITORIA.PURGA || tipo === TIPOS_AUDITORIA.CORTE_DELETE) return SEVERIDAD_AUDITORIA.CRITICAL;
  if (tipo === TIPOS_AUDITORIA.PIN_ADMIN || tipo === TIPOS_AUDITORIA.SEGURIDAD) return SEVERIDAD_AUDITORIA.WARNING;
  if (tipo === TIPOS_AUDITORIA.DISPOSITIVO && detalle?.alerta) return SEVERIDAD_AUDITORIA.WARNING;
  if (tipo === TIPOS_AUDITORIA.LOGIN && (detalle?.dispositivo_no_reconocido || detalle?.es_movil_sin_terminal)) {
    return SEVERIDAD_AUDITORIA.WARNING;
  }
  return SEVERIDAD_AUDITORIA.INFO;
}

/**
 * Registra un evento de auditoría (fire-and-forget seguro).
 * @returns {Promise<{ ok: boolean, registro?: object, aviso?: string, sinTabla?: boolean, error?: string }>}
 */
export async function registrarEventoAuditoria(supabaseOrNull, payload = {}) {
  const sb = supabaseOrNull || contexto.supabase;
  const user = payload.usuario || payload.user || contexto.user || null;
  const suc = normalizarCodigoTienda(payload.sucursal || payload.sucursal_id || contexto.sucursal || '') || null;
  const tipo = String(payload.tipo || '').trim().toUpperCase() || 'EVENTO';
  const snap = snapshotDispositivo(user);
  const detalleIn = payload.detalle && typeof payload.detalle === 'object' ? payload.detalle : {};
  const detalle = {
    ...detalleIn,
    navegador: detalleIn.navegador || snap.navegador,
  };

  // Señales de seguridad útiles en el detalle
  if (!snap.dispositivo_reconocido && !detalle.dispositivo_no_reconocido) {
    detalle.dispositivo_no_reconocido = true;
  }
  if (snap.es_movil && !snap.terminal_tienda) {
    detalle.es_movil_sin_terminal = true;
  }

  const severidad = normalizarSeveridad(payload.severidad, tipo, { ...detalle, ...snap });
  const registro = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    tipo,
    accion: payload.accion ? String(payload.accion).slice(0, 200) : null,
    severidad,
    usuario_id: user?.id != null ? String(user.id) : (payload.usuario_id != null ? String(payload.usuario_id) : null),
    usuario_nombre: String(user?.nombre || payload.usuario_nombre || '').trim() || null,
    rol: user?.rol ? normalizarRol(user.rol) : (payload.rol || null),
    sucursal_id: suc,
    dispositivo_id: snap.dispositivo_id,
    dispositivo_corto: snap.dispositivo_corto,
    dispositivo_reconocido: snap.dispositivo_reconocido,
    es_movil: snap.es_movil,
    terminal_tienda: snap.terminal_tienda,
    user_agent: snap.user_agent,
    vista: payload.vista ? String(payload.vista).slice(0, 120) : null,
    detalle,
    fuente: 'local',
  };

  pushBufferLocal(registro);
  emitirEventoLocal(registro);

  if (!sb) return { ok: true, registro, soloLocal: true };

  const rowNube = {
    created_at: registro.created_at,
    tipo: registro.tipo,
    accion: registro.accion,
    severidad: registro.severidad,
    usuario_id: registro.usuario_id,
    usuario_nombre: registro.usuario_nombre,
    rol: registro.rol,
    sucursal_id: registro.sucursal_id,
    dispositivo_id: registro.dispositivo_id,
    dispositivo_corto: registro.dispositivo_corto,
    dispositivo_reconocido: registro.dispositivo_reconocido,
    es_movil: registro.es_movil,
    terminal_tienda: registro.terminal_tienda,
    user_agent: registro.user_agent,
    vista: registro.vista,
    detalle: registro.detalle,
  };

  try {
    const { data, error } = await sb.from('pos_auditoria_eventos').insert([rowNube]).select('id, created_at').maybeSingle();
    if (error) {
      if (faltaTabla(error)) {
        return { ok: true, registro, aviso: AVISO_FALTA_AUDITORIA_SQL, sinTabla: true };
      }
      return { ok: false, registro, error: error.message };
    }
    return {
      ok: true,
      registro: { ...registro, id: data?.id || registro.id, fuente: 'nube' },
    };
  } catch (e) {
    return { ok: false, registro, error: e?.message || String(e) };
  }
}

/** Atajos tipados */
export function auditarLogin(supabase, { user, sucursal, evento, extra = {} } = {}) {
  const snapHints = snapshotDispositivo(user);
  const alertaMovil = snapHints.es_movil && !snapHints.terminal_tienda;
  const alertaEquipo = !snapHints.dispositivo_reconocido && !snapHints.terminal_tienda;
  return registrarEventoAuditoria(supabase, {
    tipo: alertaMovil || alertaEquipo ? TIPOS_AUDITORIA.SEGURIDAD : TIPOS_AUDITORIA.LOGIN,
    accion: evento || 'ENTRADA',
    usuario: user,
    sucursal,
    severidad: alertaMovil || alertaEquipo ? SEVERIDAD_AUDITORIA.WARNING : SEVERIDAD_AUDITORIA.INFO,
    detalle: {
      evento_login: evento || 'ENTRADA',
      ...extra,
      alerta_movil: alertaMovil,
      alerta_equipo_no_tienda: alertaEquipo,
    },
  });
}

export function auditarLogout(supabase, { user, sucursal } = {}) {
  return registrarEventoAuditoria(supabase, {
    tipo: TIPOS_AUDITORIA.LOGOUT,
    accion: 'SALIDA',
    usuario: user,
    sucursal,
  });
}

export function auditarVista(supabase, { user, sucursal, vista } = {}) {
  const v = String(vista || '').trim();
  if (!v || v === 'Auditoría') return Promise.resolve({ ok: true, omitido: true });
  const now = Date.now();
  if (v === ultimaVistaRegistrada && now - ultimaVistaTs < 2500) {
    return Promise.resolve({ ok: true, omitido: true });
  }
  ultimaVistaRegistrada = v;
  ultimaVistaTs = now;
  return registrarEventoAuditoria(supabase, {
    tipo: TIPOS_AUDITORIA.VISTA,
    accion: `Abrir ${v}`,
    usuario: user,
    sucursal,
    vista: v,
    detalle: { modulo: v },
  });
}

export function auditarPinAdmin(supabase, {
  admin,
  usuarioObjetivo = null,
  sucursal,
  motivo,
  extra = {},
} = {}) {
  return registrarEventoAuditoria(supabase, {
    tipo: TIPOS_AUDITORIA.PIN_ADMIN,
    accion: motivo || 'autorizacion_admin',
    usuario: admin,
    sucursal,
    severidad: SEVERIDAD_AUDITORIA.WARNING,
    detalle: {
      motivo: motivo || 'autorizacion_admin',
      admin_id: admin?.id || null,
      admin_nombre: admin?.nombre || null,
      objetivo_id: usuarioObjetivo?.id || null,
      objetivo_nombre: usuarioObjetivo?.nombre || null,
      ...extra,
    },
  });
}

export function auditarConfig(supabase, { user, sucursal, panel, cambios = {}, extra = {} } = {}) {
  return registrarEventoAuditoria(supabase, {
    tipo: TIPOS_AUDITORIA.CONFIG,
    accion: panel ? `Config → ${panel}` : 'Configuración',
    usuario: user,
    sucursal,
    vista: 'Configuracion',
    severidad: SEVERIDAD_AUDITORIA.WARNING,
    detalle: { panel: panel || null, cambios, ...extra },
  });
}

export function auditarCorte(supabase, {
  tipo = TIPOS_AUDITORIA.CORTE_EDIT,
  user,
  sucursal,
  modulo,
  cierreId,
  folio,
  extra = {},
} = {}) {
  return registrarEventoAuditoria(supabase, {
    tipo,
    accion: folio ? `${tipo} ${folio}` : tipo,
    usuario: user,
    sucursal,
    vista: modulo || null,
    severidad: tipo === TIPOS_AUDITORIA.CORTE_DELETE
      ? SEVERIDAD_AUDITORIA.CRITICAL
      : SEVERIDAD_AUDITORIA.WARNING,
    detalle: {
      modulo: modulo || null,
      cierre_id: cierreId || null,
      folio: folio || null,
      ...extra,
    },
  });
}

export function auditarDispositivo(supabase, {
  user,
  sucursal,
  accion,
  extra = {},
} = {}) {
  const snap = snapshotDispositivo(user);
  const alerta = !snap.dispositivo_reconocido || (snap.es_movil && !snap.terminal_tienda);
  return registrarEventoAuditoria(supabase, {
    tipo: alerta ? TIPOS_AUDITORIA.SEGURIDAD : TIPOS_AUDITORIA.DISPOSITIVO,
    accion: accion || 'dispositivo',
    usuario: user,
    sucursal,
    severidad: alerta ? SEVERIDAD_AUDITORIA.WARNING : SEVERIDAD_AUDITORIA.INFO,
    detalle: { ...extra, accion_dispositivo: accion || null },
  });
}

export function auditarPurga(supabase, { user, sucursal, tipos = [], detalle = {} } = {}) {
  return registrarEventoAuditoria(supabase, {
    tipo: TIPOS_AUDITORIA.PURGA,
    accion: 'Purga de datos',
    usuario: user,
    sucursal,
    severidad: SEVERIDAD_AUDITORIA.CRITICAL,
    detalle: { tipos, ...detalle },
  });
}

/**
 * Lista eventos desde nube (+ mezcla buffer local si hace falta).
 */
export async function listarEventosAuditoria(supabase, {
  desde = null,
  hasta = null,
  tipo = null,
  sucursal = null,
  usuarioId = null,
  dispositivoId = null,
  severidad = null,
  soloAlertas = false,
  q = '',
  limit = 300,
} = {}) {
  const lim = Math.max(20, Math.min(1000, Number(limit) || 300));
  let aviso = null;
  let rows = [];

  if (supabase) {
    try {
      let query = supabase
        .from('pos_auditoria_eventos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(lim);

      if (desde) query = query.gte('created_at', `${desde}T00:00:00`);
      if (hasta) query = query.lte('created_at', `${hasta}T23:59:59.999`);
      if (tipo) query = query.eq('tipo', String(tipo).toUpperCase());
      if (sucursal) query = query.eq('sucursal_id', normalizarCodigoTienda(sucursal));
      if (usuarioId) query = query.eq('usuario_id', String(usuarioId));
      if (dispositivoId) query = query.eq('dispositivo_id', String(dispositivoId));
      if (severidad) query = query.eq('severidad', String(severidad).toLowerCase());
      if (soloAlertas) query = query.in('severidad', ['warning', 'critical']);

      const { data, error } = await query;
      if (error) {
        if (faltaTabla(error)) aviso = AVISO_FALTA_AUDITORIA_SQL;
        else return { ok: false, data: [], error: error.message, aviso };
      } else {
        rows = (data || []).map((r) => ({ ...r, fuente: 'nube' }));
      }
    } catch (e) {
      return { ok: false, data: [], error: e?.message || String(e) };
    }
  }

  if (!rows.length || aviso) {
    const local = leerBufferAuditoriaLocal().map((r) => ({ ...r, fuente: r.fuente || 'local' }));
    const filtrados = local.filter((r) => {
      const at = String(r.created_at || '').slice(0, 10);
      if (desde && at < desde) return false;
      if (hasta && at > hasta) return false;
      if (tipo && String(r.tipo).toUpperCase() !== String(tipo).toUpperCase()) return false;
      if (sucursal && normalizarCodigoTienda(r.sucursal_id) !== normalizarCodigoTienda(sucursal)) return false;
      if (usuarioId && String(r.usuario_id) !== String(usuarioId)) return false;
      if (dispositivoId && String(r.dispositivo_id) !== String(dispositivoId)) return false;
      if (severidad && String(r.severidad).toLowerCase() !== String(severidad).toLowerCase()) return false;
      if (soloAlertas && !['warning', 'critical'].includes(String(r.severidad || '').toLowerCase())) return false;
      return true;
    });
    // Preferir nube; completar con local no duplicado
    const ids = new Set(rows.map((r) => r.id));
    for (const r of filtrados) {
      if (!ids.has(r.id)) rows.push(r);
    }
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    rows = rows.slice(0, lim);
  }

  const texto = String(q || '').trim().toLowerCase();
  if (texto) {
    rows = rows.filter((r) => {
      const blob = [
        r.tipo,
        r.accion,
        r.usuario_nombre,
        r.rol,
        r.sucursal_id,
        r.dispositivo_corto,
        r.vista,
        JSON.stringify(r.detalle || {}),
      ].join(' ').toLowerCase();
      return blob.includes(texto);
    });
  }

  return { ok: true, data: rows, aviso };
}

export function resumenEventoAuditoria(row) {
  if (!row) return '—';
  const tipo = ETIQUETAS_TIPO_AUDITORIA[row.tipo] || row.tipo;
  const accion = row.accion || '';
  const quien = row.usuario_nombre || '—';
  const donde = row.sucursal_id || '—';
  const equipo = row.dispositivo_corto || '—';
  const flags = [];
  if (row.es_movil) flags.push('móvil');
  if (row.terminal_tienda) flags.push('caja tienda');
  if (row.dispositivo_reconocido === false) flags.push('equipo no reconocido');
  const flagTxt = flags.length ? ` [${flags.join(', ')}]` : '';
  return `${tipo}${accion ? ` · ${accion}` : ''} — ${quien} @ ${donde} · ${equipo}${flagTxt}`;
}

export function puedeVerModuloAuditoria(rol) {
  return rolSistemaEfectivo(rol) === 'Administrador';
}
