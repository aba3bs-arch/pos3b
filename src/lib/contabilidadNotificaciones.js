import { mostrarNotificacionDispositivo } from './notificacionesDispositivo.js';

export const AVISO_FALTA_NOTIF =
  'Faltan notificaciones de contabilidad. Ejecuta supabase/fix_vales_prestamos_aprobaciones.sql';

export const EVENTO_NOTIFICACIONES = 'pos-notificaciones-refresh';
export const EVENTO_NOTIFICACION_DISPOSITIVO = 'pos-notificacion-dispositivo';

export function emitirRefreshNotificaciones() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACIONES));
  }
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('contabilidad_notificaciones');
}

export async function crearNotificacion(supabase, row) {
  if (!supabase) return { ok: true, id: null };
  const payload = {
    sucursal_id: row.sucursal_id || 'MAIN',
    tipo: row.tipo,
    ref_tabla: row.ref_tabla,
    ref_id: row.ref_id,
    titulo: row.titulo,
    mensaje: row.mensaje || null,
    estado: 'pendiente',
    leida: false,
  };
  const { data, error } = await supabase.from('contabilidad_notificaciones').insert([payload]).select('id').single();
  if (error && faltaTabla(error)) return { ok: true, id: null, aviso: AVISO_FALTA_NOTIF };
  if (error) return { ok: false, error: error.message };
  emitirRefreshNotificaciones();
  if (data?.id) {
    mostrarNotificacionDispositivo({
      id: data.id,
      titulo: payload.titulo,
      mensaje: payload.mensaje,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACION_DISPOSITIVO, { detail: { ...payload, id: data.id } }));
    }
  }
  return { ok: true, id: data?.id };
}

export async function listarNotificacionesPendientes(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, tipos, limit = 50, todasTiendas = false } = opts;
  let q = supabase
    .from('contabilidad_notificaciones')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sucursal && !todasTiendas) q = q.eq('sucursal_id', sucursal);
  if (tipos?.length) q = q.in('tipo', tipos);
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_NOTIF };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function contarNotificacionesPendientes(supabase, opts = {}) {
  const res = await listarNotificacionesPendientes(supabase, { ...opts, limit: 200 });
  return { count: (res.data || []).length, data: res.data, aviso: res.aviso };
}

export async function marcarNotificacionAtendida(supabase, refTabla, refId, atendidaPor) {
  if (!supabase || !refId) return { ok: true };
  const { error } = await supabase
    .from('contabilidad_notificaciones')
    .update({
      estado: 'atendida',
      leida: true,
      atendida_por: atendidaPor || null,
      atendida_at: new Date().toISOString(),
    })
    .eq('ref_tabla', refTabla)
    .eq('ref_id', refId)
    .eq('estado', 'pendiente');
  if (error && !faltaTabla(error)) return { ok: false, error: error.message };
  emitirRefreshNotificaciones();
  return { ok: true };
}

export async function marcarNotificacionAtendidaPorId(supabase, id, atendidaPor) {
  if (!supabase || !id) return { ok: true };
  const { error } = await supabase
    .from('contabilidad_notificaciones')
    .update({
      estado: 'atendida',
      leida: true,
      atendida_por: atendidaPor || null,
      atendida_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('estado', 'pendiente');
  if (error && !faltaTabla(error)) return { ok: false, error: error.message };
  emitirRefreshNotificaciones();
  return { ok: true };
}

export async function listarHistorialNotificaciones(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, todasTiendas = false, limit = 80 } = opts;
  let q = supabase
    .from('contabilidad_notificaciones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sucursal && !todasTiendas) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_NOTIF };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export function agruparNotificacionesPorSucursal(notifs) {
  const map = new Map();
  for (const n of notifs || []) {
    const k = n.sucursal_id || 'MAIN';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(n);
  }
  return map;
}

export const TIPOS_NOTIF = {
  VALE_PENDIENTE: 'vale_pendiente_admin',
  PRESTAMO_ADMIN: 'prestamo_pendiente_admin',
  PRESTAMO_SOCIO: 'prestamo_pendiente_socio',
  PRESTAMO_INTERAREA: 'prestamo_interarea',
  INCIDENCIA: 'incidencia_tienda',
  CONSUMO_CORTE: 'consumo_corte_pendiente',
};

export function etiquetaTipoNotificacion(tipo) {
  switch (tipo) {
    case TIPOS_NOTIF.VALE_PENDIENTE:
      return 'Vale pendiente';
    case TIPOS_NOTIF.PRESTAMO_ADMIN:
      return 'Préstamo pendiente';
    case TIPOS_NOTIF.PRESTAMO_SOCIO:
      return 'Préstamo (socio)';
    case TIPOS_NOTIF.PRESTAMO_INTERAREA:
      return 'Préstamo entre áreas';
    case TIPOS_NOTIF.INCIDENCIA:
      return 'Incidencia';
    case TIPOS_NOTIF.CONSUMO_CORTE:
      return 'Consumo en corte';
    default:
      return tipo || 'Notificación';
  }
}
