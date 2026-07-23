import { estadoDefault, normalizarEstadoVirtual } from './calc.js';
import { gastoDescuentaNomina } from './catalogoGastos.js';
import { normalizarRol } from '../roles.js';
import { crearNotificacion, marcarNotificacionAtendida, TIPOS_NOTIF } from '../contabilidadNotificaciones.js';
import { ETIQUETA_AREA } from '../contabilidadConstants.js';

export const AVISO_FALTA_CORTES =
  'Faltan tablas de cortes contabilidad. En Supabase → SQL Editor ejecuta: supabase/fix_cortes_contabilidad.sql';

const PREFIJOS = { virtual: 'V', abarrotes: 'AB', garage: 'G' };

function lsKey(sucursal, modulo, tipo) {
  return `pos3b_corte_${tipo}_${modulo}_${sucursal || 'MAIN'}`;
}

function faltaTabla(error, hint) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes(hint) || (msg.includes('schema cache') && msg.includes(hint));
}

export async function cargarEstadoCorte(supabase, sucursal, modulo) {
  const def = estadoDefault(modulo);
  if (!supabase) {
    try {
      const raw = localStorage.getItem(lsKey(sucursal, modulo, 'estado'));
      let estado = raw ? { ...def, ...JSON.parse(raw) } : def;
      if (modulo === 'virtual') estado = normalizarEstadoVirtual(estado);
      return { estado, soloLocal: true };
    } catch {
      return { estado: def, soloLocal: true };
    }
  }
  const { data, error } = await supabase
    .from('cortes_contabilidad_estado')
    .select('estado')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .maybeSingle();
  if (error && faltaTabla(error, 'cortes_contabilidad')) {
    return { estado: def, aviso: AVISO_FALTA_CORTES, soloLocal: true };
  }
  if (error) return { estado: def, error: error.message };
  const estado = { ...def, ...(data?.estado || {}) };
  if (modulo === 'virtual') {
    return { estado: normalizarEstadoVirtual(estado), soloLocal: false };
  }
  if (modulo === 'garage') {
    const defM = estadoDefault('garage').maquinas;
    const prev = estado.maquinas || {};
    estado.maquinas = Object.fromEntries(Object.keys(defM).map((k) => [k, Number(prev[k]) || 0]));
  }
  return { estado, soloLocal: false };
}

export async function guardarEstadoCorte(supabase, sucursal, modulo, estado) {
  if (!supabase) {
    localStorage.setItem(lsKey(sucursal, modulo, 'estado'), JSON.stringify(estado));
    return { ok: true, soloLocal: true };
  }
  const row = {
    sucursal_id: sucursal || 'MAIN',
    modulo,
    estado,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('cortes_contabilidad_estado').upsert(row, { onConflict: 'sucursal_id,modulo' });
  if (error && faltaTabla(error, 'cortes_contabilidad')) {
    localStorage.setItem(lsKey(sucursal, modulo, 'estado'), JSON.stringify(estado));
    return { ok: true, aviso: AVISO_FALTA_CORTES, soloLocal: true };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listarGastosTurno(supabase, sucursal, modulo) {
  const sid = sucursal || 'MAIN';
  if (!supabase) {
    try {
      const raw = localStorage.getItem(lsKey(sid, modulo, 'gastos'));
      return { data: raw ? JSON.parse(raw) : [] };
    } catch {
      return { data: [] };
    }
  }
  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo)
    .order('created_at', { ascending: true });
  if (error && faltaTabla(error, 'cortes_contabilidad_gastos')) {
    try {
      const raw = localStorage.getItem(lsKey(sid, modulo, 'gastos'));
      return { data: raw ? JSON.parse(raw) : [], aviso: AVISO_FALTA_CORTES };
    } catch {
      return { data: [], aviso: AVISO_FALTA_CORTES };
    }
  }
  if (error) return { data: [], error: error.message };

  // Solo gastos del turno abierto (cerrado !== true; incluye null legacy).
  const abiertos = (data || []).filter((g) => g.cerrado !== true);
  try {
    localStorage.setItem(lsKey(sid, modulo, 'gastos'), JSON.stringify(abiertos));
  } catch {
    /* ignore */
  }
  return { data: abiertos, error: null };
}

export async function agregarGastoTurno(supabase, sucursal, modulo, gasto, opts = {}) {
  const esConsumo = gastoDescuentaNomina(modulo, gasto.categoria, gasto.subcategoria);
  const esAdmin = normalizarRol(opts.rolActor) === 'Administrador';
  const catUpper = String(gasto.categoria || '').toUpperCase();
  // No van a IE: recuperación inversión, envío MAIN→tienda (solo bajan caja del corte).
  const omitirIe =
    opts.omitirIe === true ||
    catUpper === 'INVERSION OFICINA' ||
    catUpper === 'ENVIO MAIN' ||
    catUpper === 'VALE MAIN';
  const autoAprobar = opts.autoAprobar === true || omitirIe;
  const requiereAprobacion = !autoAprobar && !esAdmin && (modulo === 'virtual' || esConsumo);
  const estadoAprobacion = requiereAprobacion ? 'pendiente_admin' : 'aprobado';
  const row = {
    sucursal_id: sucursal || 'MAIN',
    modulo,
    categoria: gasto.categoria || 'GENERAL',
    subcategoria: gasto.subcategoria || '',
    comentario: gasto.comentario || '',
    monto: Number(gasto.monto) || 0,
    usuario_id: gasto.usuario_id || null,
    usuario_nombre: gasto.usuario_nombre || null,
    cerrado: false,
    estado_aprobacion: estadoAprobacion,
    solicitado_por: opts.nombreActor || null,
  };
  if (!supabase) {
    const { data: prev } = await listarGastosTurno(null, sucursal, modulo);
    const next = [...(prev || []), { ...row, id: `local-${Date.now()}`, created_at: new Date().toISOString() }];
    localStorage.setItem(lsKey(sucursal, modulo, 'gastos'), JSON.stringify(next));
    return { ok: true, data: next };
  }
  const { data, error } = await supabase.from('cortes_contabilidad_gastos').insert([row]).select('*').single();
  if (error) return { ok: false, error: error.message };
  if (estadoAprobacion === 'pendiente_admin') {
    const areaLbl = ETIQUETA_AREA[modulo] || modulo;
    await crearNotificacion(supabase, {
      sucursal_id: sucursal || 'MAIN',
      tipo: TIPOS_NOTIF.CONSUMO_CORTE,
      ref_tabla: 'cortes_contabilidad_gastos',
      ref_id: data.id,
      titulo: `Gasto pendiente · ${gasto.categoria || 'corte'}`,
      mensaje: `${areaLbl} · $${Number(gasto.monto).toFixed(2)} · ${gasto.categoria || 'GASTO'}${gasto.usuario_nombre ? ` · ${gasto.usuario_nombre}` : ''}`,
    });
    return {
      ok: true,
      data,
      pendiente: true,
      mensaje: 'Gasto enviado. El administrador debe aprobar antes de descontarlo en el corte.',
    };
  }
  if (modulo === 'virtual' && data && !omitirIe) {
    try {
      const { registrarEgresoDesdeGastoCorte } = await import('../contVirtualEgresos.js');
      await registrarEgresoDesdeGastoCorte(supabase, data);
    } catch {
      /* IE sync no debe bloquear el corte */
    }
  }
  return { ok: true, data };
}

export async function aprobarGastoTurno(supabase, gastoId, { nombre } = {}) {
  if (!supabase || !gastoId) return { ok: false, error: 'Gasto inválido.' };
  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .update({
      estado_aprobacion: 'aprobado',
      aprobado_por: nombre || null,
      aprobado_at: new Date().toISOString(),
    })
    .eq('id', gastoId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'cortes_contabilidad_gastos', gastoId, nombre);
  if (data && String(data.modulo || '').toLowerCase() === 'virtual') {
    try {
      const { registrarEgresoDesdeGastoCorte } = await import('../contVirtualEgresos.js');
      await registrarEgresoDesdeGastoCorte(supabase, data);
    } catch {
      /* IE sync no debe bloquear la aprobación */
    }
  }
  return { ok: true, gasto: data };
}

export async function rechazarGastoTurno(supabase, gastoId, { nombre } = {}) {
  if (!supabase || !gastoId) return { ok: false, error: 'Gasto inválido.' };
  const { error } = await supabase
    .from('cortes_contabilidad_gastos')
    .update({ estado_aprobacion: 'rechazado', aprobado_por: nombre || null, aprobado_at: new Date().toISOString() })
    .eq('id', gastoId);
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'cortes_contabilidad_gastos', gastoId, nombre);
  return { ok: true };
}

/** Lista gastos pendientes de aprobación (admin) para un módulo/sucursal. */
export async function listarGastosPendientesAprobacion(supabase, sucursal, modulo) {
  if (!supabase) return { data: [], error: null };
  let q = supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('estado_aprobacion', 'pendiente_admin')
    .order('created_at', { ascending: true });
  if (sucursal) q = q.eq('sucursal_id', sucursal || 'MAIN');
  if (modulo) q = q.eq('modulo', modulo);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

/**
 * Aprueba todos los gastos pendientes del módulo (p. ej. virtual) y los refleja en IE.
 * Si sucursal es null, aprueba de todas las tiendas del módulo.
 */
export async function aprobarTodosGastosPendientes(supabase, { sucursal, modulo, nombre } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', aprobados: 0 };
  const { data, error } = await listarGastosPendientesAprobacion(supabase, sucursal, modulo);
  if (error) return { ok: false, error, aprobados: 0 };
  if (!data.length) return { ok: true, aprobados: 0, pendientes: 0 };

  let okCount = 0;
  const fallos = [];
  for (const g of data) {
    const res = await aprobarGastoTurno(supabase, g.id, { nombre });
    if (res.ok) okCount += 1;
    else fallos.push(res.error || g.id);
  }
  return {
    ok: fallos.length === 0,
    aprobados: okCount,
    pendientes: data.length,
    error: fallos.length ? fallos[0] : null,
  };
}

export function gastoCuentaEnCorte(gasto) {
  const est = gasto?.estado_aprobacion || 'aprobado';
  return est === 'aprobado';
}

export async function eliminarGastoTurno(supabase, id, sucursal, modulo) {
  if (!supabase) {
    const { data: prev } = await listarGastosTurno(null, sucursal, modulo);
    const next = (prev || []).filter((g) => String(g.id) !== String(id));
    localStorage.setItem(lsKey(sucursal, modulo, 'gastos'), JSON.stringify(next));
    return { ok: true };
  }
  const { error } = await supabase.from('cortes_contabilidad_gastos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function actualizarGastoTurno(supabase, id, patch, sucursal, modulo) {
  if (!id) return { ok: false, error: 'Sin ID de gasto.' };
  const row = {};
  if (patch.monto != null) row.monto = Number(patch.monto) || 0;
  if (patch.categoria != null) row.categoria = String(patch.categoria).trim().toUpperCase();
  if (patch.subcategoria != null) row.subcategoria = String(patch.subcategoria).trim().toUpperCase();
  if (patch.comentario != null) row.comentario = String(patch.comentario).trim().toUpperCase();
  if (patch.usuario_id != null) row.usuario_id = patch.usuario_id;
  if (patch.usuario_nombre != null) row.usuario_nombre = patch.usuario_nombre;

  if (!supabase) {
    const { data: prev } = await listarGastosTurno(null, sucursal, modulo);
    const next = (prev || []).map((g) => (String(g.id) === String(id) ? { ...g, ...row } : g));
    localStorage.setItem(lsKey(sucursal, modulo, 'gastos'), JSON.stringify(next));
    return { ok: true };
  }
  const { error } = await supabase.from('cortes_contabilidad_gastos').update(row).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Cierra los gastos del turno abierto para que el siguiente corte arranque en $0.
 * Los registros permanecen (historial / nómina) con cerrado=true.
 * @param {string[]|null} idsOpcionales — IDs en memoria del corte actual (más fiable).
 */
export async function limpiarGastosTurno(supabase, sucursal, modulo, idsOpcionales = null) {
  const sid = sucursal || 'MAIN';
  try {
    localStorage.setItem(lsKey(sid, modulo, 'gastos'), '[]');
  } catch {
    /* ignore */
  }

  if (!supabase) {
    return { ok: true, count: 0, soloLocal: true };
  }

  const idsSet = new Set(
    (idsOpcionales || []).map((id) => String(id)).filter((id) => id && !id.startsWith('local-')),
  );

  // Captura también cualquier gasto abierto que no esté en memoria (otro dispositivo / race).
  const { data: rows, error: eList } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('id, cerrado')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo);

  if (eList) {
    if (faltaTabla(eList, 'cortes_contabilidad_gastos')) {
      return { ok: true, count: 0, aviso: AVISO_FALTA_CORTES, soloLocal: true };
    }
    return { ok: false, error: eList.message, count: 0 };
  }

  for (const g of rows || []) {
    if (g.cerrado !== true) idsSet.add(String(g.id));
  }

  const ids = [...idsSet];
  if (!ids.length) return { ok: true, count: 0 };

  const { data: updated, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .update({ cerrado: true })
    .in('id', ids)
    .select('id');

  if (error) return { ok: false, error: error.message, count: 0 };

  // Verificación: no debe quedar ninguno abierto en esta sucursal/módulo.
  const { data: quedan, error: eCheck } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('id, cerrado')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo);

  if (eCheck) return { ok: false, error: eCheck.message, count: (updated || []).length };

  const abiertos = (quedan || []).filter((g) => g.cerrado !== true);
  if (abiertos.length > 0) {
    // Segundo intento por si el primer update no aplicó a todos.
    const retryIds = abiertos.map((g) => g.id);
    const { error: e2 } = await supabase
      .from('cortes_contabilidad_gastos')
      .update({ cerrado: true })
      .in('id', retryIds)
      .select('id');
    if (e2) {
      return {
        ok: false,
        error: `Quedaron ${abiertos.length} gastos abiertos: ${e2.message}`,
        count: (updated || []).length,
      };
    }
    return { ok: true, count: ids.length, retried: retryIds.length };
  }

  return { ok: true, count: (updated || ids).length };
}

/**
 * Cierra gastos huérfanos: siguen abiertos pero ya están en el detalle de un cierre.
 * Corrige turnos donde limpiarGastosTurno falló o se ignoró el error.
 */
export async function cerrarGastosHuerfanosTrasCierre(supabase, sucursal, modulo) {
  const sid = sucursal || 'MAIN';
  if (!supabase) return { ok: true, count: 0 };

  const [{ data: abiertos, error: eAb }, { data: cierres, error: eCi }] = await Promise.all([
    supabase
      .from('cortes_contabilidad_gastos')
      .select('id, cerrado')
      .eq('sucursal_id', sid)
      .eq('modulo', modulo),
    supabase
      .from('cortes_contabilidad_cierres')
      .select('id, detalle, created_at')
      .eq('sucursal_id', sid)
      .eq('modulo', modulo)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (eAb || eCi) return { ok: false, error: (eAb || eCi).message, count: 0 };

  const idsEnCierres = new Set();
  for (const c of cierres || []) {
    const lista = c?.detalle?.gastos;
    if (!Array.isArray(lista)) continue;
    for (const g of lista) {
      if (g?.id) idsEnCierres.add(String(g.id));
    }
  }

  const huerfanos = (abiertos || []).filter(
    (g) => g.cerrado !== true && idsEnCierres.has(String(g.id)),
  );
  if (!huerfanos.length) return { ok: true, count: 0 };

  const ids = huerfanos.map((g) => g.id);
  const limpia = await limpiarGastosTurno(supabase, sid, modulo, ids);
  return { ok: limpia.ok, count: ids.length, error: limpia.error };
}

export async function peekFolio(supabase, sucursal, modulo) {
  const prefijo = PREFIJOS[modulo] || 'X';
  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'folio');
    const n = (Number(localStorage.getItem(key)) || 0) + 1;
    if (modulo === 'abarrotes') return `AB-${String(n).padStart(3, '0')}`;
    return `${prefijo}-${String(n).padStart(3, '0')}`;
  }
  const sid = sucursal || 'MAIN';
  const { data: row } = await supabase
    .from('cortes_contabilidad_folios')
    .select('ultimo')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo)
    .maybeSingle();
  const n = (Number(row?.ultimo) || 0) + 1;
  if (modulo === 'abarrotes') return `AB-${String(n).padStart(3, '0')}`;
  return `${prefijo}-${String(n).padStart(3, '0')}`;
}

export async function siguienteFolio(supabase, sucursal, modulo) {
  const prefijo = PREFIJOS[modulo] || 'X';
  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'folio');
    const n = (Number(localStorage.getItem(key)) || 0) + 1;
    localStorage.setItem(key, String(n));
    if (modulo === 'abarrotes') return `AB-${String(n).padStart(3, '0')}`;
    return `${prefijo}-${String(n).padStart(3, '0')}`;
  }
  const sid = sucursal || 'MAIN';
  const { data: row } = await supabase
    .from('cortes_contabilidad_folios')
    .select('ultimo')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo)
    .maybeSingle();
  const ultimo = (Number(row?.ultimo) || 0) + 1;
  await supabase.from('cortes_contabilidad_folios').upsert(
    { sucursal_id: sid, modulo, ultimo, prefijo },
    { onConflict: 'sucursal_id,modulo' },
  );
  if (modulo === 'abarrotes') return `AB-${String(ultimo).padStart(3, '0')}`;
  return `${prefijo}-${String(ultimo).padStart(3, '0')}`;
}

export async function registrarCierreCorte(supabase, payload) {
  if (!supabase) {
    const key = lsKey(payload.sucursal_id, payload.modulo, 'historial');
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      hist = [];
    }
    hist.unshift({ ...payload, id: `local-${Date.now()}`, created_at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(hist.slice(0, 100)));
    return { ok: true, soloLocal: true };
  }
  const { error } = await supabase.from('cortes_contabilidad_cierres').insert([payload]);
  if (error && faltaTabla(error, 'cortes_contabilidad_cierres')) {
    return { ok: false, error: AVISO_FALTA_CORTES };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listarCierresCorte(supabase, sucursal, modulo, limit = 30) {
  if (!supabase) {
    try {
      const raw = localStorage.getItem(lsKey(sucursal, modulo, 'historial'));
      return { data: raw ? JSON.parse(raw).slice(0, limit) : [] };
    } catch {
      return { data: [] };
    }
  }
  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error: error?.message || null };
}

export async function actualizarDetalleCierre(supabase, id, patchDetalle, sucursal, modulo) {
  if (!id) return { ok: false, error: 'Cierre inválido.' };
  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'historial');
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      hist = [];
    }
    const next = hist.map((h) =>
      String(h.id) === String(id) ? { ...h, detalle: { ...(h.detalle || {}), ...patchDetalle } } : h,
    );
    localStorage.setItem(key, JSON.stringify(next));
    return { ok: true, soloLocal: true };
  }
  const { data: row, error: errGet } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('detalle')
    .eq('id', id)
    .maybeSingle();
  if (errGet) return { ok: false, error: errGet.message };
  if (!row) return { ok: false, error: 'Cierre no encontrado.' };
  const detalle = { ...(row.detalle || {}), ...patchDetalle };
  const { error } = await supabase.from('cortes_contabilidad_cierres').update({ detalle }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, detalle };
}

/** Elimina un cierre del historial (pruebas / corrección admin). */
export async function eliminarCierreCorte(supabase, id, sucursal, modulo) {
  if (!id) return { ok: false, error: 'Cierre inválido.' };
  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'historial');
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      hist = [];
    }
    const next = hist.filter((h) => String(h.id) !== String(id));
    localStorage.setItem(key, JSON.stringify(next));
    return { ok: true, soloLocal: true };
  }
  const { error } = await supabase.from('cortes_contabilidad_cierres').delete().eq('id', id);
  if (error && faltaTabla(error, 'cortes_contabilidad_cierres')) {
    return { ok: false, error: AVISO_FALTA_CORTES };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
