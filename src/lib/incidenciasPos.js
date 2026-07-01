import { crearNotificacion, marcarNotificacionAtendida, TIPOS_NOTIF, emitirRefreshNotificaciones } from './contabilidadNotificaciones.js';
import { etiquetaCategoriaCatalogo, etiquetaSubcategoriaIncidencia } from './incidenciasCatalogo.js';

export const AVISO_FALTA_INCIDENCIAS =
  'Ejecuta supabase/fix_buzon_incidencias.sql, fix_incidencias_responsable.sql y fix_incidencias_categorias.sql en Supabase.';

/** Personal al que puede dirigirse un reporte de incidencia. */
export const RESPONSABLES_INCIDENCIA = [
  'Antonio',
  'Francisco',
  'Jose Luis',
  'Andres',
  'Gonzalo',
  'Misael',
  'Luis Enrique',
  'Luz',
];

export function normalizarNombreResponsable(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function esResponsableIncidencia(usuarioNombre, responsableAsignado) {
  const u = normalizarNombreResponsable(usuarioNombre);
  const r = normalizarNombreResponsable(responsableAsignado);
  if (!u || !r) return false;
  if (u === r) return true;
  const partes = r.split(/\s+/).filter(Boolean);
  if (partes.length && partes.every((p) => u.includes(p))) return true;
  return u.includes(r) || r.includes(u);
}

export function puedeRedirigirIncidencia(usuario, incidencia, { esAdmin = false } = {}) {
  if (esAdmin) return true;
  if (!incidencia?.responsable) return false;
  return esResponsableIncidencia(usuario?.nombre, incidencia.responsable);
}

/** @deprecated usar catalogoIncidenciasActivo / etiquetaCategoriaCatalogo */
export const CATEGORIAS_INCIDENCIA = [
  { id: 'operacion', label: 'Operación / caja' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'equipo', label: 'Equipo / sistema' },
  { id: 'personal', label: 'Personal' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'virtual', label: 'Virtual' },
  { id: 'abarrotes', label: 'Abarrotes' },
  { id: 'garage', label: 'Garage' },
  { id: 'otro', label: 'Otro' },
];

export const PRIORIDADES_INCIDENCIA = ['baja', 'normal', 'alta', 'urgente'];

export const ESTADOS_INCIDENCIA = ['abierta', 'en_revision', 'resuelta', 'cerrada'];

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('pos_incidencias');
}

export function etiquetaCategoriaIncidencia(id) {
  return etiquetaCategoriaCatalogo(id);
}

export { etiquetaSubcategoriaIncidencia } from './incidenciasCatalogo.js';

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

export function fechaHoraIncidencia(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const fechaTxt = d.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const horaTxt = d.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return { fechaTxt, horaTxt, iso: d.toISOString() };
}

export function fmtFechaIncidencia(iso) {
  if (!iso) return '—';
  return fechaHoraIncidencia(iso).fechaTxt;
}

export function fmtHoraIncidencia(iso) {
  if (!iso) return '—';
  return fechaHoraIncidencia(iso).horaTxt;
}

export async function crearIncidencia(supabase, row) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!String(row.titulo || '').trim()) return { ok: false, error: 'Indica un título.' };
  if (!String(row.responsable || '').trim()) return { ok: false, error: 'Selecciona a quién dirigir el reporte (Responsable).' };

  const payload = {
    sucursal_id: row.sucursal_id || 'MAIN',
    titulo: String(row.titulo).trim(),
    descripcion: row.descripcion?.trim() || null,
    categoria: row.categoria || 'otro',
    subcategoria: row.subcategoria?.trim() || null,
    prioridad: row.prioridad || 'normal',
    estado: 'abierta',
    reportado_por: row.reportado_por || null,
    responsable: String(row.responsable).trim(),
  };

  const { data, error } = await supabase.from('pos_incidencias').insert([payload]).select('*').single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_INCIDENCIAS };
  if (error) return { ok: false, error: error.message };

  await crearNotificacion(supabase, {
    sucursal_id: payload.sucursal_id,
    tipo: TIPOS_NOTIF.INCIDENCIA,
    ref_tabla: 'pos_incidencias',
    ref_id: data.id,
    titulo: payload.titulo,
    mensaje: [
      row.etiqueta_tienda || payload.sucursal_id,
      row.fecha_reporte,
      row.hora_reporte,
      `Responsable: ${payload.responsable}`,
      etiquetaCategoriaIncidencia(payload.categoria),
      payload.subcategoria || null,
      etiquetaPrioridadIncidencia(payload.prioridad),
      payload.reportado_por,
    ]
      .filter(Boolean)
      .join(' · '),
  });
  emitirRefreshNotificaciones();

  return { ok: true, incidencia: data };
}

export async function redirigirIncidencia(supabase, id, nuevoResponsable, { por, nota } = {}) {
  if (!supabase || !id) return { ok: false, error: 'Incidencia inválida.' };
  const dest = String(nuevoResponsable || '').trim();
  if (!dest) return { ok: false, error: 'Selecciona el nuevo responsable.' };

  const { data: actual, error: eRead } = await supabase.from('pos_incidencias').select('*').eq('id', id).maybeSingle();
  if (eRead && faltaTabla(eRead)) return { ok: false, error: AVISO_FALTA_INCIDENCIAS };
  if (eRead) return { ok: false, error: eRead.message };
  if (!actual) return { ok: false, error: 'Incidencia no encontrada.' };

  const anterior = actual.responsable || '—';
  const notaRedir = nota?.trim()
    ? ` · ${nota.trim()}`
    : '';
  const descripcionExtra = `\n[${new Date().toLocaleString('es-MX')}] Redirigido de ${anterior} a ${dest} por ${por || '—'}${notaRedir}`;

  const body = {
    responsable: dest,
    redirigido_por: por || null,
    redirigido_at: new Date().toISOString(),
    estado: 'abierta',
    descripcion: `${actual.descripcion || ''}${descripcionExtra}`.trim(),
  };

  const { data, error } = await supabase.from('pos_incidencias').update(body).eq('id', id).select('*').single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_INCIDENCIAS };
  if (error) return { ok: false, error: error.message };

  await crearNotificacion(supabase, {
    sucursal_id: actual.sucursal_id,
    tipo: TIPOS_NOTIF.INCIDENCIA,
    ref_tabla: 'pos_incidencias',
    ref_id: id,
    titulo: `Incidencia reasignada: ${actual.titulo}`,
    mensaje: [`Responsable: ${dest}`, `Antes: ${anterior}`, por ? `Por ${por}` : null].filter(Boolean).join(' · '),
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
