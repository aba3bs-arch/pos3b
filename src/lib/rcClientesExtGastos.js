/**
 * Gastos de RC/Clientes ext.
 * El catálogo tiene tres niveles: categoría, subcategoría y detalle.
 * Cada gasto se resta de la venta (efectivo + crédito) de este submódulo.
 */

export const AVISO_FALTA_GASTOS_EXT =
  'Falta el catálogo de gastos. En Supabase → SQL Editor ejecuta supabase/fix_ruta_rc_ext_gastos.sql.';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function faltaTabla(error) {
  const m = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || m.includes('does not exist')
    || m.includes('schema cache')
    || m.includes('ruta_rc_ext_');
}

export function limpiarNombre(nombre) {
  return String(nombre || '').trim().replace(/\s+/g, ' ');
}

/** Arma categoría → subcategoría → detalle a partir de filas planas. */
export function armarCatalogoGastosExt(filas = []) {
  const cats = (filas || [])
    .filter((f) => Number(f.nivel) === 1 && !f.parent_id)
    .sort(porOrden);
  const subs = (filas || []).filter((f) => Number(f.nivel) === 2 && f.parent_id);
  const dets = (filas || []).filter((f) => Number(f.nivel) === 3 && f.parent_id);
  return cats.map((cat) => ({
    id: String(cat.id),
    nombre: cat.nombre,
    subcategorias: subs
      .filter((s) => String(s.parent_id) === String(cat.id))
      .sort(porOrden)
      .map((sub) => ({
        id: String(sub.id),
        nombre: sub.nombre,
        detalles: dets
          .filter((d) => String(d.parent_id) === String(sub.id))
          .sort(porOrden)
          .map((det) => ({ id: String(det.id), nombre: det.nombre })),
      })),
  }));
}

function porOrden(a, b) {
  return (Number(a.orden) || 0) - (Number(b.orden) || 0)
    || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
}

/**
 * La venta del submódulo es el efectivo más el crédito dejado.
 * Lo cobrado ya está dentro del crédito, así que no se suma otra vez.
 */
export function resumenVentaConGastos(totales = {}, gastos = []) {
  const venta = round2((Number(totales.efectivo) || 0) + (Number(totales.credito) || 0));
  const suma = round2((gastos || []).reduce((s, g) => s + (Number(g.monto) || 0), 0));
  return { venta, gastos: suma, neta: round2(venta - suma) };
}

export function validarNombreCatalogo(arbol = [], { nivel, parentId, nombre } = {}) {
  const n = limpiarNombre(nombre);
  if (!n) return { ok: false, error: 'Escribe el nombre.' };
  if (n.length > 80) return { ok: false, error: 'Nombre demasiado largo (máx. 80).' };
  const nivelN = Number(nivel);
  if (nivelN === 1) {
    if ((arbol || []).some((c) => c.nombre.toLowerCase() === n.toLowerCase())) {
      return { ok: false, error: 'Ya existe esa categoría.' };
    }
    return { ok: true, nombre: n, nivel: 1, parentId: null };
  }
  const cat = (arbol || []).find((c) => c.id === String(parentId || ''));
  if (nivelN === 2) {
    if (!cat) return { ok: false, error: 'Elige la categoría.' };
    if ((cat.subcategorias || []).some((s) => s.nombre.toLowerCase() === n.toLowerCase())) {
      return { ok: false, error: 'Ya existe esa subcategoría.' };
    }
    return { ok: true, nombre: n, nivel: 2, parentId: cat.id };
  }
  if (nivelN === 3) {
    const sub = (cat?.subcategorias || []).find((s) => s.id === String(parentId || ''));
    const dueno = (arbol || []).find((c) => (c.subcategorias || []).some((s) => s.id === String(parentId || '')));
    const subReal = sub || (dueno?.subcategorias || []).find((s) => s.id === String(parentId || ''));
    if (!subReal) return { ok: false, error: 'Elige la subcategoría.' };
    if ((subReal.detalles || []).some((d) => d.nombre.toLowerCase() === n.toLowerCase())) {
      return { ok: false, error: 'Ya existe ese detalle.' };
    }
    return { ok: true, nombre: n, nivel: 3, parentId: subReal.id };
  }
  return { ok: false, error: 'Nivel de catálogo inválido.' };
}

export function prepararGastoExt({
  categoriaId,
  subcategoriaId,
  detalleId,
  monto,
  nota,
  arbol = [],
} = {}) {
  const cat = (arbol || []).find((c) => c.id === String(categoriaId || ''));
  if (!cat) return { ok: false, error: 'Elige una categoría.' };
  const sub = (cat.subcategorias || []).find((s) => s.id === String(subcategoriaId || ''));
  if (!sub) return { ok: false, error: 'Elige una subcategoría.' };
  const det = (sub.detalles || []).find((d) => d.id === String(detalleId || ''));
  if (!det) return { ok: false, error: 'Elige el detalle, el 3er nivel del gasto.' };
  const m = round2(String(monto ?? '').replace(',', '.'));
  if (!(m > 0)) return { ok: false, error: 'Ingresa un monto mayor a 0.' };
  const notas = limpiarNombre(nota);
  if (notas.length > 160) return { ok: false, error: 'La nota es demasiado larga.' };
  return {
    ok: true,
    gasto: {
      categoria_id: cat.id,
      subcategoria_id: sub.id,
      detalle_id: det.id,
      categoria_nombre: cat.nombre,
      subcategoria_nombre: sub.nombre,
      detalle_nombre: det.nombre,
      monto: m,
      notas: notas || null,
    },
  };
}

export function puedeQuitarDelCatalogo(arbol = [], id, gastos = []) {
  const buscado = String(id || '');
  if (!buscado) return { ok: false, error: 'Elige qué quitar.' };
  for (const cat of arbol || []) {
    if (cat.id === buscado) {
      if ((cat.subcategorias || []).length) return { ok: false, error: 'Quita primero las subcategorías.' };
      if ((gastos || []).some((g) => String(g.categoria_id) === buscado)) {
        return { ok: false, error: 'Hay gastos con esta categoría.' };
      }
      return { ok: true };
    }
    for (const sub of cat.subcategorias || []) {
      if (sub.id === buscado) {
        if ((sub.detalles || []).length) return { ok: false, error: 'Quita primero los detalles.' };
        if ((gastos || []).some((g) => String(g.subcategoria_id) === buscado)) {
          return { ok: false, error: 'Hay gastos con esta subcategoría.' };
        }
        return { ok: true };
      }
      for (const det of sub.detalles || []) {
        if (det.id !== buscado) continue;
        if ((gastos || []).some((g) => String(g.detalle_id) === buscado)) {
          return { ok: false, error: 'Hay gastos con este detalle.' };
        }
        return { ok: true };
      }
    }
  }
  return { ok: false, error: 'No se encontró en el catálogo.' };
}

export async function listarGastosClientesExt(supabase) {
  const vacio = { ok: true, arbol: [], gastos: [], aviso: '' };
  if (!supabase) return { ...vacio, ok: false, aviso: 'Sin conexión.' };
  const catalogo = await supabase
    .from('ruta_rc_ext_catalogo')
    .select('id,parent_id,nivel,nombre,orden,created_at')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (catalogo.error) {
    if (faltaTabla(catalogo.error)) return { ...vacio, ok: false, aviso: AVISO_FALTA_GASTOS_EXT };
    return { ...vacio, ok: false, aviso: catalogo.error.message };
  }
  const gastos = await supabase
    .from('ruta_rc_ext_gastos')
    .select('id,categoria_id,subcategoria_id,detalle_id,categoria_nombre,subcategoria_nombre,detalle_nombre,monto,notas,usuario_nombre,created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (gastos.error) {
    if (faltaTabla(gastos.error)) return { ...vacio, ok: false, aviso: AVISO_FALTA_GASTOS_EXT };
    return { ok: false, arbol: armarCatalogoGastosExt(catalogo.data), gastos: [], aviso: gastos.error.message };
  }
  return {
    ok: true,
    arbol: armarCatalogoGastosExt(catalogo.data),
    gastos: gastos.data || [],
    aviso: '',
  };
}

export async function crearNodoCatalogoExt(supabase, { nivel, parentId, nombre, arbol } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const val = validarNombreCatalogo(arbol, { nivel, parentId, nombre });
  if (!val.ok) return val;
  const { data, error } = await supabase
    .from('ruta_rc_ext_catalogo')
    .insert([{ nivel: val.nivel, parent_id: val.parentId, nombre: val.nombre, orden: 0 }])
    .select('id,parent_id,nivel,nombre')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_GASTOS_EXT };
    if (/unique|duplicate/i.test(String(error.message || ''))) return { ok: false, error: 'Ese nombre ya existe.' };
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function quitarNodoCatalogoExt(supabase, { id, arbol, gastos } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const puede = puedeQuitarDelCatalogo(arbol, id, gastos);
  if (!puede.ok) return puede;
  const { error } = await supabase.from('ruta_rc_ext_catalogo').delete().eq('id', id);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_GASTOS_EXT };
    if (/foreign key|violates/i.test(String(error.message || ''))) {
      return { ok: false, error: 'Todavía tiene subniveles o gastos. Quítalos primero.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function registrarGastoClienteExt(supabase, {
  categoriaId,
  subcategoriaId,
  detalleId,
  monto,
  nota,
  arbol,
  usuarioNombre,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const listo = prepararGastoExt({ categoriaId, subcategoriaId, detalleId, monto, nota, arbol });
  if (!listo.ok) return listo;
  const { data, error } = await supabase
    .from('ruta_rc_ext_gastos')
    .insert([{ ...listo.gasto, usuario_nombre: limpiarNombre(usuarioNombre) || null }])
    .select('id,monto,categoria_nombre,subcategoria_nombre,detalle_nombre')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_GASTOS_EXT };
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function editarGastoClienteExt(supabase, {
  id,
  categoriaId,
  subcategoriaId,
  detalleId,
  monto,
  nota,
  arbol,
} = {}) {
  if (!supabase || !id) return { ok: false, error: 'Gasto inválido.' };
  const listo = prepararGastoExt({ categoriaId, subcategoriaId, detalleId, monto, nota, arbol });
  if (!listo.ok) return listo;
  const { data, error } = await supabase
    .from('ruta_rc_ext_gastos')
    .update(listo.gasto)
    .eq('id', id)
    .select('id,monto,categoria_nombre,subcategoria_nombre,detalle_nombre,usuario_nombre,created_at')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_GASTOS_EXT };
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function quitarGastoClienteExt(supabase, { id } = {}) {
  if (!supabase || !id) return { ok: false, error: 'Gasto inválido.' };
  const { error } = await supabase.from('ruta_rc_ext_gastos').delete().eq('id', id);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_GASTOS_EXT };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
