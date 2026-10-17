/**
 * Catálogo de categorías para Venta en Ruta → Gastos.
 * CRUD solo Administrador (la UI también lo restringe).
 */

import { normalizarRol, rolSistemaEfectivo } from './roles.js';

export const AVISO_FALTA_CATEGORIAS_GASTO =
  'Falta la tabla de categorías. En Supabase ejecuta supabase/fix_ruta_gastos_categorias.sql';

function faltaTabla(error) {
  const m = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || error?.code === 'PGRST205'
    || m.includes('does not exist')
    || m.includes('schema cache')
    || m.includes('ruta_gastos_categorias')
  );
}

export function puedeAdministrarCategoriasGastoRuta(rol) {
  return rolSistemaEfectivo(rol) === 'Administrador' || normalizarRol(rol) === 'Administrador';
}

function normNombre(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

/** Activas, para el selector del repartidor. */
export async function listarCategoriasGastoRuta(supabase) {
  if (!supabase) return { data: [], aviso: null };
  const { data, error } = await supabase
    .from('ruta_gastos_categorias')
    .select('id, nombre, activo, orden, created_at')
    .eq('activo', true)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) {
    if (faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_CATEGORIAS_GASTO };
    return { data: [], error: error.message };
  }
  return { data: data || [], aviso: null };
}

/** Todas (activas e inactivas) para panel admin. */
export async function listarCategoriasGastoRutaAdmin(supabase) {
  if (!supabase) return { data: [], aviso: null };
  const { data, error } = await supabase
    .from('ruta_gastos_categorias')
    .select('id, nombre, activo, orden, created_at, updated_at')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) {
    if (faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_CATEGORIAS_GASTO };
    return { data: [], error: error.message };
  }
  return { data: data || [], aviso: null };
}

export async function crearCategoriaGastoRuta(supabase, { nombre, orden = 0, rolActor } = {}) {
  if (!puedeAdministrarCategoriasGastoRuta(rolActor)) {
    return { ok: false, error: 'Solo un administrador puede crear categorías.' };
  }
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const n = normNombre(nombre);
  if (!n) return { ok: false, error: 'Escribe el nombre de la categoría.' };
  if (n.length > 80) return { ok: false, error: 'Nombre demasiado largo (máx. 80).' };

  const { data, error } = await supabase
    .from('ruta_gastos_categorias')
    .insert([{
      nombre: n,
      activo: true,
      orden: Number.isFinite(Number(orden)) ? Number(orden) : 0,
      updated_at: new Date().toISOString(),
    }])
    .select('id, nombre, activo, orden')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CATEGORIAS_GASTO };
    if (/unique|duplicate/i.test(String(error.message || ''))) {
      return { ok: false, error: 'Ya existe una categoría con ese nombre.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function actualizarCategoriaGastoRuta(supabase, {
  id,
  nombre,
  activo,
  orden,
  rolActor,
} = {}) {
  if (!puedeAdministrarCategoriasGastoRuta(rolActor)) {
    return { ok: false, error: 'Solo un administrador puede editar categorías.' };
  }
  if (!supabase || !id) return { ok: false, error: 'Categoría inválida.' };
  const patch = { updated_at: new Date().toISOString() };
  if (nombre != null) {
    const n = normNombre(nombre);
    if (!n) return { ok: false, error: 'Escribe el nombre de la categoría.' };
    if (n.length > 80) return { ok: false, error: 'Nombre demasiado largo (máx. 80).' };
    patch.nombre = n;
  }
  if (activo != null) patch.activo = Boolean(activo);
  if (orden != null && Number.isFinite(Number(orden))) patch.orden = Number(orden);

  const { data, error } = await supabase
    .from('ruta_gastos_categorias')
    .update(patch)
    .eq('id', id)
    .select('id, nombre, activo, orden')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CATEGORIAS_GASTO };
    if (/unique|duplicate/i.test(String(error.message || ''))) {
      return { ok: false, error: 'Ya existe una categoría con ese nombre.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function eliminarCategoriaGastoRuta(supabase, { id, rolActor } = {}) {
  if (!puedeAdministrarCategoriasGastoRuta(rolActor)) {
    return { ok: false, error: 'Solo un administrador puede eliminar categorías.' };
  }
  if (!supabase || !id) return { ok: false, error: 'Categoría inválida.' };
  const { error } = await supabase.from('ruta_gastos_categorias').delete().eq('id', id);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CATEGORIAS_GASTO };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
