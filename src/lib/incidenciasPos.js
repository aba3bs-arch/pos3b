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

  const dup = await buscarIncidenciaDuplicadaAbierta(supabase, row);
  if (dup.duplicada) {
    return {
      ok: false,
      duplicada: true,
      incidencia: dup.duplicada,
      error:
        `Ya existe un reporte abierto igual en ${dup.duplicada.sucursal_id || 'esta tienda'}: «${dup.duplicada.titulo}» ` +
        `(${etiquetaEstadoIncidencia(dup.duplicada.estado)} · ${dup.duplicada.responsable || 'sin responsable'}). ` +
        'No se puede enviar de nuevo hasta que se resuelva o cierre.',
    };
  }

  const AREAS_BUZON = new Set(['virtual', 'abarrotes', 'garage']);
  const areaSel = String(row.area || '').toLowerCase().trim();
  if (!AREAS_BUZON.has(areaSel)) {
    return { ok: false, error: 'Selecciona el área del buzón: Virtual, Abarrotes o Garage.' };
  }

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
    area: areaSel,
  };

  let { data, error } = await supabase.from('pos_incidencias').insert([payload]).select('*').single();
  // Columna area aún no migrada: reintentar sin ella (el buzón sigue en la notificación).
  if (error && /area|schema cache|column/i.test(String(error.message || ''))) {
    const sinArea = { ...payload };
    delete sinArea.area;
    ({ data, error } = await supabase.from('pos_incidencias').insert([sinArea]).select('*').single());
    if (!error && data) data = { ...data, area: areaSel };
  }
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_INCIDENCIAS };
  if (error) return { ok: false, error: error.message };

  const etiquetaArea = { virtual: 'Virtual', abarrotes: 'Abarrotes', garage: 'Garage' }[areaSel] || areaSel;

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
      `Área: ${etiquetaArea}`,
      `Responsable: ${payload.responsable}`,
      etiquetaCategoriaIncidencia(payload.categoria),
      payload.subcategoria || null,
      etiquetaPrioridadIncidencia(payload.prioridad),
      payload.reportado_por,
    ]
      .filter(Boolean)
      .join(' · '),
    area_buzon: areaSel,
  });
  emitirRefreshNotificaciones();

  return { ok: true, incidencia: data };
}

/** Clave para detectar reportes duplicados abiertos. */
export function claveIncidenciaDuplicada(row) {
  const titulo = String(row?.titulo || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  const suc = String(row?.sucursal_id || '').trim().toUpperCase();
  const cat = String(row?.categoria || '').trim().toLowerCase();
  const sub = String(row?.subcategoria || '').trim().toLowerCase();
  const resp = String(row?.responsable || '').trim().toLowerCase();
  return `${suc}|${titulo}|${cat}|${sub}|${resp}`;
}

const ESTADOS_ABIERTOS = new Set(['abierta', 'en_revision']);

/** Busca incidencia abierta equivalente (misma tienda, título, categoría, responsable). */
export async function buscarIncidenciaDuplicadaAbierta(supabase, row) {
  if (!supabase) return { duplicada: null };
  const suc = row.sucursal_id || 'MAIN';
  const titulo = String(row.titulo || '').trim();
  if (!titulo) return { duplicada: null };

  const { data, error } = await supabase
    .from('pos_incidencias')
    .select('*')
    .eq('sucursal_id', suc)
    .in('estado', ['abierta', 'en_revision'])
    .order('created_at', { ascending: true })
    .limit(80);
  if (error && faltaTabla(error)) return { duplicada: null, aviso: AVISO_FALTA_INCIDENCIAS };
  if (error) return { duplicada: null, error: error.message };

  const clave = claveIncidenciaDuplicada({ ...row, sucursal_id: suc, titulo });
  const hit = (data || []).find((inc) => claveIncidenciaDuplicada(inc) === clave);
  return { duplicada: hit || null };
}

/** Elimina una incidencia (solo admin en UI). */
export async function eliminarIncidencia(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'Incidencia inválida.' };
  const { error } = await supabase.from('pos_incidencias').delete().eq('id', id);
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_INCIDENCIAS };
  if (error) return { ok: false, error: error.message };
  try {
    await marcarNotificacionAtendida(supabase, 'pos_incidencias', id, 'admin');
  } catch {
    /* ignore */
  }
  emitirRefreshNotificaciones();
  return { ok: true };
}

/**
 * Deja una sola incidencia abierta por clave duplicada (conserva la más antigua).
 */
export async function depurarIncidenciasDuplicadas(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', eliminadas: 0, grupos: 0 };
  const { sucursal = null, limit = 500 } = opts;
  let q = supabase
    .from('pos_incidencias')
    .select('*')
    .in('estado', ['abierta', 'en_revision'])
    .order('created_at', { ascending: true })
    .limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_INCIDENCIAS, eliminadas: 0, grupos: 0 };
  if (error) return { ok: false, error: error.message, eliminadas: 0, grupos: 0 };

  const grupos = new Map();
  for (const inc of data || []) {
    if (!ESTADOS_ABIERTOS.has(inc.estado)) continue;
    const k = claveIncidenciaDuplicada(inc);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(inc);
  }

  let eliminadas = 0;
  let gruposDup = 0;
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;
    gruposDup += 1;
    for (const inc of lista.slice(1)) {
      const r = await eliminarIncidencia(supabase, inc.id);
      if (r.ok) eliminadas += 1;
    }
  }

  return { ok: true, eliminadas, grupos: gruposDup };
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
