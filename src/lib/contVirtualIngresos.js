/**
 * Ingresos manuales IE (catálogo independiente de egresos).
 * Las recolecciones de corte siguen viniendo de contVirtualData; esto es captura admin.
 */
import { AVISO_FALTA_CONT_VIRTUAL, listarCatalogoContVirtual, resolverNombresCatalogo } from './contVirtualCatalogo.js';

const LS_INGRESOS = 'pos3b_cont_virtual_ingresos';

export const AVISO_FALTA_INGRESOS_IE =
  'Ejecuta supabase/fix_cont_virtual_ingresos.sql en Supabase (categorías e ingresos manuales).';

function faltaTabla(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('cont_virtual_ingresos') ||
    (msg.includes('schema cache') && msg.includes('cont_virtual_ingresos'))
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizarCuentaIe(raw, fallback = 'virtual') {
  const c = String(raw || fallback).toLowerCase();
  if (c === 'garage') return 'garage';
  if (c === 'abarrotes') return 'abarrotes';
  return 'virtual';
}

function leerLocal() {
  try {
    const raw = localStorage.getItem(LS_INGRESOS);
    if (raw) {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS_INGRESOS, JSON.stringify(lista.slice(0, 2000)));
  } catch {
    /* quota */
  }
}

function ymdEnRango(ymd, desde, hasta) {
  const f = String(ymd || '').slice(0, 10);
  if (!f) return false;
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
}

export async function registrarIngresoContVirtual(supabase, row) {
  const monto = round2(row?.monto);
  if (!(monto > 0)) return { ok: false, error: 'Monto inválido.' };
  if (!row?.categoria_id) return { ok: false, error: 'Indica categoría.' };

  const payload = {
    sucursal_id: row.sucursal_id || 'MAIN',
    fecha: String(row.fecha || new Date().toISOString()).slice(0, 10),
    categoria_id: row.categoria_id,
    categoria_nombre: row.categoria_nombre || row.categoria_id,
    subcategoria_id: row.subcategoria_id || null,
    subcategoria_nombre: row.subcategoria_nombre || null,
    detalle_id: row.detalle_id || null,
    detalle_nombre: row.detalle_nombre || null,
    monto,
    descripcion: String(row.descripcion || '').trim() || null,
    fuente: row.fuente || 'manual',
    cuenta: normalizarCuentaIe(row.cuenta || row.area || row.modulo, 'virtual'),
    usuario_nombre: row.usuario_nombre || null,
  };

  if (!supabase) {
    const lista = leerLocal();
    const id = `local-ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    lista.unshift({ ...payload, id, created_at: new Date().toISOString() });
    guardarLocal(lista);
    return { ok: true, id, soloLocal: true };
  }

  const { data, error } = await supabase.from('cont_virtual_ingresos').insert([payload]).select('id').single();
  if (error) {
    if (faltaTabla(error)) {
      const lista = leerLocal();
      const id = `local-ing-${Date.now()}`;
      lista.unshift({ ...payload, id, created_at: new Date().toISOString() });
      guardarLocal(lista);
      return { ok: true, id, soloLocal: true, aviso: AVISO_FALTA_INGRESOS_IE };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

export async function listarIngresosContVirtual(supabase, { desde, hasta, sucursal = null, cuenta = null } = {}) {
  const filtrar = (lista) =>
    (lista || []).filter((r) => {
      if (!ymdEnRango(r.fecha || r.created_at, desde, hasta)) return false;
      if (sucursal && String(r.sucursal_id || '') !== String(sucursal)) return false;
      if (cuenta && String(r.cuenta || 'virtual') !== String(cuenta)) return false;
      return true;
    });

  if (!supabase) return { data: filtrar(leerLocal()), soloLocal: true };

  let q = supabase.from('cont_virtual_ingresos').select('*').order('fecha', { ascending: false }).limit(2000);
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  if (cuenta) q = q.eq('cuenta', cuenta);

  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) {
      return { data: filtrar(leerLocal()), soloLocal: true, aviso: AVISO_FALTA_INGRESOS_IE };
    }
    return { data: filtrar(leerLocal()), error: error.message, aviso: AVISO_FALTA_CONT_VIRTUAL };
  }
  return { data: data || [] };
}

export async function eliminarIngresoContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'Sin id.' };
  const sid = String(id);
  if (!supabase || sid.startsWith('local-')) {
    guardarLocal(leerLocal().filter((r) => String(r.id) !== sid));
    return { ok: true, soloLocal: true };
  }
  const { error } = await supabase.from('cont_virtual_ingresos').delete().eq('id', sid);
  if (error) {
    if (faltaTabla(error)) {
      guardarLocal(leerLocal().filter((r) => String(r.id) !== sid));
      return { ok: true, soloLocal: true, aviso: AVISO_FALTA_INGRESOS_IE };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Actualiza un ingreso manual (admin). */
export async function actualizarIngresoContVirtual(supabase, id, patch = {}) {
  if (!id) return { ok: false, error: 'Sin id.' };
  const sid = String(id);
  const monto = patch.monto != null ? round2(patch.monto) : undefined;
  if (monto !== undefined && !(monto > 0)) return { ok: false, error: 'Monto inválido.' };

  const payload = {};
  if (patch.sucursal_id != null) payload.sucursal_id = patch.sucursal_id || 'MAIN';
  if (patch.fecha != null) payload.fecha = String(patch.fecha).slice(0, 10);
  if (patch.categoria_id != null) payload.categoria_id = patch.categoria_id;
  if (patch.categoria_nombre != null) payload.categoria_nombre = patch.categoria_nombre;
  if (patch.subcategoria_id !== undefined) payload.subcategoria_id = patch.subcategoria_id || null;
  if (patch.subcategoria_nombre !== undefined) payload.subcategoria_nombre = patch.subcategoria_nombre || null;
  if (patch.detalle_id !== undefined) payload.detalle_id = patch.detalle_id || null;
  if (patch.detalle_nombre !== undefined) payload.detalle_nombre = patch.detalle_nombre || null;
  if (monto !== undefined) payload.monto = monto;
  if (patch.descripcion !== undefined) payload.descripcion = String(patch.descripcion || '').trim() || null;
  if (patch.cuenta != null) payload.cuenta = normalizarCuentaIe(patch.cuenta, 'virtual');
  if (patch.usuario_nombre !== undefined) payload.usuario_nombre = patch.usuario_nombre || null;

  if (!Object.keys(payload).length) return { ok: false, error: 'Nada que actualizar.' };

  if (!supabase || sid.startsWith('local-')) {
    const lista = leerLocal().map((r) => (String(r.id) === sid ? { ...r, ...payload } : r));
    guardarLocal(lista);
    return { ok: true, soloLocal: true, id: sid };
  }

  const { data, error } = await supabase
    .from('cont_virtual_ingresos')
    .update(payload)
    .eq('id', sid)
    .select('id')
    .single();
  if (error) {
    if (faltaTabla(error)) {
      const lista = leerLocal().map((r) => (String(r.id) === sid ? { ...r, ...payload } : r));
      guardarLocal(lista);
      return { ok: true, soloLocal: true, id: sid, aviso: AVISO_FALTA_INGRESOS_IE };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id || sid };
}

/** Normaliza fila de ingreso manual al shape del panel (ingresosPorDia). */
export function itemIngresoManualDesdeFila(row) {
  const cuenta = normalizarCuentaIe(row.cuenta, 'virtual');
  const cuentaLbl = cuenta === 'garage' ? 'Garage' : cuenta === 'abarrotes' ? 'Abarrotes' : 'Virtual';
  const partes = [
    row.categoria_nombre || row.categoria_id,
    row.subcategoria_nombre || null,
    row.detalle_nombre || null,
  ].filter(Boolean);
  return {
    id: row.id,
    fecha: String(row.fecha || '').slice(0, 10),
    monto: round2(row.monto),
    comentario: `${partes.join(' · ')}${row.descripcion ? ` · ${row.descripcion}` : ''}`.trim() || 'Ingreso manual',
    cuenta,
    cuenta_label: cuentaLbl,
    tienda: row.sucursal_id || 'MAIN',
    tipo_mov: 'manual',
    fuente: row.fuente || 'manual',
    categoria: row.categoria_nombre || row.categoria_id,
    subcategoria: row.subcategoria_nombre || null,
    empleado: row.usuario_nombre || null,
    manual: true,
    // Campos para editar desde el panel IE
    categoria_id: row.categoria_id || null,
    subcategoria_id: row.subcategoria_id || null,
    detalle_id: row.detalle_id || null,
    descripcion: row.descripcion || '',
    sucursal_id: row.sucursal_id || 'MAIN',
  };
}

// re-export helpers used by callers that resolve names against catalog
export { listarCatalogoContVirtual, resolverNombresCatalogo };
