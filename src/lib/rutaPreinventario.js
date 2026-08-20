/**
 * Preinventario del vendedor de ruta.
 * Plantilla generada del catálogo (stock CEDIS Ruta + productos del sistema).
 * No modifica el inventario teórico.
 */

import { listarStockCedisRuta } from './ventaEnRuta.js';
import { AVISO_FALTA_CUENTAS_RUTA } from './rutaCuentas.js';

const LS_PREINV = 'pos3b_ruta_preinventario_sesiones';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('ruta_preinventario');
}

function leerLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_PREINV) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS_PREINV, JSON.stringify(lista.slice(0, 200)));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `pre_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

/**
 * Genera plantilla desde catálogo: productos con stock en CEDIS Ruta
 * (o todo el inventario si CEDIS está vacío y se pide incluirCatálogo).
 */
export async function generarPlantillaPreinventarioRuta(supabase, inventario = [], { soloConStock = true } = {}) {
  const stockRes = await listarStockCedisRuta(supabase);
  const stockMap = new Map((stockRes.data || []).map((s) => [String(s.producto_id), Number(s.cantidad) || 0]));
  const porId = new Map((inventario || []).map((p) => [String(p.id), p]));

  const ids = soloConStock && stockMap.size
    ? [...stockMap.keys()]
    : [...new Set([...stockMap.keys(), ...(inventario || []).map((p) => String(p.id))])];

  const lineas = ids
    .map((id) => {
      const p = porId.get(id);
      const teorico = round3(stockMap.get(id) || 0);
      if (soloConStock && teorico <= 0 && stockMap.size) return null;
      return {
        producto_id: id,
        nombre: p?.nombre || id,
        teorico,
        contado: null,
        diferencia: null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  return { lineas, aviso: stockRes.aviso };
}

export function resumenPreinventarioRuta(lineas) {
  const contadas = (lineas || []).filter((l) => l.contado != null && l.contado !== '');
  let faltante = 0;
  let sobrante = 0;
  for (const l of contadas) {
    const d = Number(l.diferencia);
    if (Number.isFinite(d) && d < 0) faltante += -d;
    if (Number.isFinite(d) && d > 0) sobrante += d;
  }
  return {
    total: (lineas || []).length,
    contadas: contadas.length,
    faltante: round3(faltante),
    sobrante: round3(sobrante),
  };
}

export function aplicarConteoLinea(linea, contadoRaw) {
  const teorico = round3(linea.teorico);
  const raw = contadoRaw;
  const contado =
    raw === null || raw === undefined || String(raw).trim() === ''
      ? null
      : Math.max(0, round3(Number(raw)));
  const diferencia = contado == null ? null : round3(contado - teorico);
  return { ...linea, contado, diferencia };
}

export async function guardarSesionPreinventarioRuta(supabase, {
  nombre,
  lineas,
  vendedorId,
  vendedorNombre,
  cerrar = true,
} = {}) {
  const resumen = resumenPreinventarioRuta(lineas);
  const row = {
    nombre: String(nombre || 'Preinventario ruta').trim(),
    vendedor_id: vendedorId != null ? String(vendedorId) : null,
    vendedor_nombre: vendedorNombre || null,
    lineas: lineas || [],
    resumen,
    estado: cerrar ? 'cerrada' : 'abierta',
    cerrado_at: cerrar ? new Date().toISOString() : null,
  };

  if (!supabase) {
    const full = { ...row, id: uid(), created_at: new Date().toISOString() };
    const list = leerLocal();
    list.unshift(full);
    guardarLocal(list);
    return { ok: true, data: full, soloLocal: true };
  }
  const { data, error } = await supabase.from('ruta_preinventario_sesiones').insert([row]).select('*').single();
  if (error && faltaTabla(error)) {
    return guardarSesionPreinventarioRuta(null, { nombre, lineas, vendedorId, vendedorNombre, cerrar });
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, data, aviso: AVISO_FALTA_CUENTAS_RUTA && !data ? AVISO_FALTA_CUENTAS_RUTA : null };
}

export async function listarSesionesPreinventarioRuta(supabase, { limit = 40 } = {}) {
  if (!supabase) return { data: leerLocal().slice(0, limit) };
  const { data, error } = await supabase
    .from('ruta_preinventario_sesiones')
    .select('id, nombre, vendedor_nombre, resumen, estado, created_at, cerrado_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error && faltaTabla(error)) {
    return { data: leerLocal().slice(0, limit), aviso: AVISO_FALTA_CUENTAS_RUTA };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}
