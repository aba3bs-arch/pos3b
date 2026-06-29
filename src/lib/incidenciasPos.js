import { crearNotificacion, marcarNotificacionAtendida, TIPOS_NOTIF, emitirRefreshNotificaciones } from './contabilidadNotificaciones.js';

export const AVISO_FALTA_INCIDENCIAS = 'Ejecuta supabase/fix_buzon_incidencias.sql en Supabase.';

export const CATEGORIAS_INCIDENCIA = [
  { id: 'operacion', label: 'Operación / caja' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'equipo', label: 'Equipo / sistema' },
  { id: 'personal', label: 'Personal' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'otro', label: 'Otro' },
];

export const PRIORIDADES_INCIDENCIA = ['baja', 'normal', 'alta', 'urgente'];

export const ESTADOS_INCIDENCIA = ['abierta', 'en_revision', 'resuelta', 'cerrada'];

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('pos_incidencias');
}

export function etiquetaCategoriaIncidencia(id) {
  return CATEGORIAS_INCIDENCIA.find((c) => c.id === id)?.label || id || 'Otro';
}

export function etiquetaPrioridadIncidencia(p) {
  const map = { baja: 'Baja', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  return map[p] || p || 'Normal';
}

export function etiquetaEstadoIncidencia(e) {
  const map = {
    abierta: 'Abierta',
    en_revision: 'En revisión',
    resuelta: 'Resuelta',
    cerrada: 'Cerrada',
  };
  return map[e] || e || 'Abierta';
}

export async function crearIncidencia(supabase, row) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!String(row.titulo || '').trim()) return { ok: false, error: 'Indica un título.' };

  const payload = {
    sucursal_id: row.sucursal_id || 'MAIN',
    titulo: String(row.titulo).trim(),
    descripcion: row.descripcion?.trim() || null,
    categoria: row.categoria || 'otro',
    prioridad: row.prioridad || 'normal',
    estado: 'abierta',
    reportado_por: row.reportado_por || null,
  };

  const { data, error } = await supabase.from('pos_incidencias').insert([payload]).select('*').single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_INCIDENCIAS };
  if (error) return { ok: false, error: error.message };

  await crearNotificacion(supabase, {
    sucursal_id: payload.sucursal_id,
    tipo: TIPOS_NOTIF.INCIDENCIA,
    ref_tabla: 'pos_incidencias',
    ref_id: data.id,
    titulo: `Incidencia · ${payload.titulo}`,
    mensaje: `${etiquetaCategoriaIncidencia(payload.categoria)} · ${etiquetaPrioridadIncidencia(payload.prioridad)}${payload.reportado_por ? ` · ${payload.reportado_por}` : ''}`,
  });
  emitirRefreshNotificaciones();

  return { ok: true, incidencia: data };
}

export async function listarIncidencias(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, estados, limit = 100, soloAbiertas = false } = opts;
  let q = supabase.from('pos_incidencias').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  if (soloAbiertas) q = q.in('estado', ['abierta', 'en_revision']);
  else if (estados?.length) q = q.in('estado', estados);
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_INCIDENCIAS };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function contarIncidenciasAbiertas(supabase, opts = {}) {
  const res = await listarIncidencias(supabase, { ...opts, soloAbiertas: true, limit: 200 });
  return { count: (res.data || []).length, data: res.data, aviso: res.aviso };
}

export async function actualizarIncidencia(supabase, id, patch, { atendidaPor } = {}) {
  if (!supabase || !id) return { ok: false, error: 'Incidencia inválida.' };
  const body = { ...patch };
  const cierra = ['resuelta', 'cerrada'].includes(patch.estado);
  if (cierra) {
    body.atendida_por = atendidaPor || patch.atendida_por || null;
    body.atendida_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from('pos_incidencias').update(body).eq('id', id).select('*').single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_INCIDENCIAS };
  if (error) return { ok: false, error: error.message };
  if (cierra) {
    await marcarNotificacionAtendida(supabase, 'pos_incidencias', id, atendidaPor);
    emitirRefreshNotificaciones();
  }
  return { ok: true, incidencia: data };
}
