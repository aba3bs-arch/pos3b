import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { stockEnUbicacion, ubicacionEntradaDefault } from './inventarioMultitienda.js';
import { productosEnDepartamento } from './conteoDepartamento.js';

export const AVISO_FALTA_PREINVENTARIO =
  'Ejecuta supabase/fix_preinventario.sql en Supabase para sincronizar plantillas en la nube.';

const LS_KEY = 'pos3b_preinventario_plantillas';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('pos_preinventario') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  );
}

function leerLocal(sucursal) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const suc = normalizarCodigoTienda(sucursal) || 'MAIN';
    return Array.isArray(all[suc]) ? all[suc] : [];
  } catch {
    return [];
  }
}

function guardarLocal(sucursal, lista) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const suc = normalizarCodigoTienda(sucursal) || 'MAIN';
    all[suc] = lista;
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function uidLocal() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function teoricoProducto(producto, sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  const ubi = ubicacionEntradaDefault(suc);
  return Math.max(0, stockEnUbicacion(producto, suc, ubi, suc));
}

export function construirLineasDesdeProductos(productos, sucursal, conteos = {}) {
  return (productos || []).map((p) => {
    const teorico = teoricoProducto(p, sucursal);
    const raw = conteos[p.id];
    const contado =
      raw === null || raw === undefined || String(raw).trim() === ''
        ? null
        : Math.max(0, Math.floor(Number(raw)));
    const diferencia = contado == null ? null : contado - teorico;
    return {
      id: p.id,
      nombre: p.nombre,
      teorico,
      contado,
      diferencia,
    };
  });
}

export function resumenPreinventario(lineas) {
  const contadas = (lineas || []).filter((l) => l.contado != null);
  let faltante = 0;
  let sobrante = 0;
  for (const l of contadas) {
    const d = Number(l.diferencia) || 0;
    if (d < 0) faltante += -d;
    if (d > 0) sobrante += d;
  }
  return {
    productos: (lineas || []).length,
    contados: contadas.length,
    faltante,
    sobrante,
  };
}

export async function listarPlantillasPreinventario(supabase, sucursal) {
  const suc = normalizarCodigoTienda(sucursal) || 'MAIN';
  if (!supabase) return { data: leerLocal(suc), local: true };

  const { data, error } = await supabase
    .from('pos_preinventario_plantillas')
    .select('*')
    .eq('sucursal_id', suc)
    .order('updated_at', { ascending: false })
    .limit(80);

  if (error && faltaTabla(error)) {
    return { data: leerLocal(suc), local: true, aviso: AVISO_FALTA_PREINVENTARIO };
  }
  if (error) return { data: leerLocal(suc), local: true, error: error.message };
  return { data: data || [], local: false };
}

export async function guardarPlantillaPreinventario(supabase, row) {
  const suc = normalizarCodigoTienda(row.sucursal_id) || 'MAIN';
  const payload = {
    sucursal_id: suc,
    nombre: String(row.nombre || '').trim() || 'Plantilla',
    tipo: row.tipo === 'departamento' ? 'departamento' : 'personal',
    departamento: row.departamento || null,
    creado_por: row.creado_por || null,
    creado_por_id: row.creado_por_id || null,
    productos: Array.isArray(row.productos) ? row.productos : [],
    updated_at: new Date().toISOString(),
  };

  if (!supabase) {
    const lista = leerLocal(suc);
    const id = row.id || uidLocal();
    const next = [{ id, ...payload, created_at: new Date().toISOString() }, ...lista.filter((p) => p.id !== id)];
    guardarLocal(suc, next);
    return { ok: true, plantilla: next[0], local: true };
  }

  if (row.id && !String(row.id).startsWith('local-')) {
    const { data, error } = await supabase
      .from('pos_preinventario_plantillas')
      .update(payload)
      .eq('id', row.id)
      .select('*')
      .single();
    if (error && faltaTabla(error)) {
      const lista = leerLocal(suc);
      const id = row.id || uidLocal();
      const next = [{ id, ...payload, created_at: new Date().toISOString() }, ...lista.filter((p) => p.id !== id)];
      guardarLocal(suc, next);
      return { ok: true, plantilla: next[0], local: true, aviso: AVISO_FALTA_PREINVENTARIO };
    }
    if (error) return { ok: false, error: error.message };
    return { ok: true, plantilla: data };
  }

  const { data, error } = await supabase.from('pos_preinventario_plantillas').insert([payload]).select('*').single();
  if (error && faltaTabla(error)) {
    const lista = leerLocal(suc);
    const id = uidLocal();
    const item = { id, ...payload, created_at: new Date().toISOString() };
    guardarLocal(suc, [item, ...lista]);
    return { ok: true, plantilla: item, local: true, aviso: AVISO_FALTA_PREINVENTARIO };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, plantilla: data };
}

export async function eliminarPlantillaPreinventario(supabase, id, sucursal) {
  if (!id) return { ok: false, error: 'Plantilla inválida.' };
  const suc = normalizarCodigoTienda(sucursal) || 'MAIN';

  if (!supabase || String(id).startsWith('local-')) {
    guardarLocal(
      suc,
      leerLocal(suc).filter((p) => p.id !== id),
    );
    return { ok: true, local: true };
  }

  const { error } = await supabase.from('pos_preinventario_plantillas').delete().eq('id', id);
  if (error && faltaTabla(error)) {
    guardarLocal(
      suc,
      leerLocal(suc).filter((p) => p.id !== id),
    );
    return { ok: true, local: true, aviso: AVISO_FALTA_PREINVENTARIO };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function productosParaPlantilla(inventario, { tipo, departamento, idsSeleccionados }) {
  if (tipo === 'departamento' && departamento) {
    return productosEnDepartamento(inventario, departamento).map((p) => ({
      id: p.id,
      nombre: p.nombre,
    }));
  }
  const set = new Set((idsSeleccionados || []).map(String));
  return (inventario || [])
    .filter((p) => set.has(String(p.id)))
    .map((p) => ({ id: p.id, nombre: p.nombre }));
}

export async function guardarSesionPreinventario(supabase, row) {
  const suc = normalizarCodigoTienda(row.sucursal_id) || 'MAIN';
  const payload = {
    sucursal_id: suc,
    plantilla_id: row.plantilla_id && !String(row.plantilla_id).startsWith('local-') ? row.plantilla_id : null,
    nombre: String(row.nombre || 'Preinventario').trim(),
    creado_por: row.creado_por || null,
    creado_por_id: row.creado_por_id || null,
    lineas: Array.isArray(row.lineas) ? row.lineas : [],
    estado: row.estado || 'cerrada',
    closed_at: row.estado === 'abierta' ? null : new Date().toISOString(),
  };
  if (!supabase) return { ok: true, local: true, sesion: { id: uidLocal(), ...payload } };

  const { data, error } = await supabase.from('pos_preinventario_sesiones').insert([payload]).select('*').single();
  if (error && faltaTabla(error)) return { ok: true, local: true, aviso: AVISO_FALTA_PREINVENTARIO, sesion: { id: uidLocal(), ...payload } };
  if (error) return { ok: false, error: error.message };
  return { ok: true, sesion: data };
}
