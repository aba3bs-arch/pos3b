const LS_CAT = 'pos3b_corte_catalogo';

/** Catálogo compartido entre todas las sucursales. */
export const CATALOGO_GASTOS_GLOBAL = 'GLOBAL';

function lsKey(modulo) {
  return `${LS_CAT}_${modulo}_global`;
}

const DEFAULTS = {
  virtual: [
    { categoria: 'CONSUMO', subcategorias: ['EMPLEADO', 'OFICINA'] },
    { categoria: 'GASTOS OPERATIVOS', subcategorias: ['SUMINISTROS', 'SERVICIOS', 'MANTENIMIENTO', 'OTROS'] },
    { categoria: 'TARJETA', subcategorias: ['PAGOS TARJETA'] },
    { categoria: 'FALTANTE', subcategorias: ['FALTANTE'] },
    { categoria: 'PREMIOS', subcategorias: ['PAGO DE PREMIO'] },
  ],
  abarrotes: [
    { categoria: 'CONSUMO', subcategorias: ['EMPLEADO', 'LIMPIEZA'] },
    { categoria: 'GASTOS OPERATIVOS', subcategorias: ['SUMINISTROS', 'SERVICIOS', 'MANTENIMIENTO', 'OTROS'] },
  ],
  garage: [
    { categoria: 'CONSUMO', subcategorias: ['EMPLEADO', 'MANTENIMIENTO'] },
    { categoria: 'GASTOS OPERATIVOS', subcategorias: ['SUMINISTROS', 'SERVICIOS', 'MANTENIMIENTO', 'OTROS'] },
  ],
};

/** Solo CONSUMO descuenta nómina al empleado asignado; demás gastos afectan el corte pero no nómina. */
export function gastoDescuentaNomina(_modulo, categoria) {
  const cat = String(categoria || '').trim().toUpperCase();
  return cat === 'CONSUMO';
}

export function gastoRequiereEmpleado(modulo, categoria) {
  return gastoDescuentaNomina(modulo, categoria);
}

function leerLocal(modulo) {
  try {
    const raw = localStorage.getItem(lsKey(modulo));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return DEFAULTS[modulo] || [];
}

function guardarLocal(modulo, lista) {
  localStorage.setItem(lsKey(modulo), JSON.stringify(lista));
}

function mapRows(data) {
  return (data || []).map((r) => ({
    id: r.id,
    categoria: r.categoria,
    subcategorias: Array.isArray(r.subcategorias) ? r.subcategorias : [],
  }));
}

async function listarDesdeNube(supabase, sucursalId, modulo) {
  return supabase
    .from('cortes_gasto_catalogo')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .eq('modulo', modulo)
    .order('categoria');
}

/** Lista catálogo global; si no hay filas globales, usa legado de la sucursal activa. */
export async function listarCatalogoGastos(supabase, sucursal, modulo) {
  if (!supabase) return { data: leerLocal(modulo) };

  const globalRes = await listarDesdeNube(supabase, CATALOGO_GASTOS_GLOBAL, modulo);
  if (globalRes.error) {
    if (globalRes.error.code === '42P01') return { data: leerLocal(modulo), aviso: 'Ejecuta fix_contabilidad_ampliacion.sql' };
    return { data: leerLocal(modulo), error: globalRes.error.message };
  }
  if (globalRes.data?.length) return { data: mapRows(globalRes.data), fuente: 'global' };

  const legacyRes = await listarDesdeNube(supabase, sucursal || 'MAIN', modulo);
  if (legacyRes.error) return { data: leerLocal(modulo), error: legacyRes.error.message };
  if (legacyRes.data?.length) return { data: mapRows(legacyRes.data), fuente: 'legacy' };

  return { data: DEFAULTS[modulo] || [] };
}

export async function guardarCategoriaGasto(supabase, sucursal, modulo, categoria, subcategorias = []) {
  const cat = String(categoria || '').trim().toUpperCase();
  if (!cat) return { ok: false, error: 'Categoría vacía.' };
  const subs = (subcategorias || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);

  if (!supabase) {
    const lista = leerLocal(modulo).filter((x) => x.categoria !== cat);
    lista.push({ categoria: cat, subcategorias: subs });
    guardarLocal(modulo, lista);
    return { ok: true };
  }

  const { error } = await supabase.from('cortes_gasto_catalogo').upsert(
    {
      sucursal_id: CATALOGO_GASTOS_GLOBAL,
      modulo,
      categoria: cat,
      subcategorias: subs,
    },
    { onConflict: 'sucursal_id,modulo,categoria' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function agregarSubcategoriaGasto(supabase, sucursal, modulo, categoria, subcategoria) {
  const res = await listarCatalogoGastos(supabase, sucursal, modulo);
  const cat = String(categoria || '').trim().toUpperCase();
  const sub = String(subcategoria || '').trim().toUpperCase();
  if (!cat || !sub) return { ok: false, error: 'Datos incompletos.' };
  const row = (res.data || []).find((x) => x.categoria === cat);
  const subs = row ? [...new Set([...(row.subcategorias || []), sub])] : [sub];
  return guardarCategoriaGasto(supabase, sucursal, modulo, cat, subs);
}

export async function eliminarCategoriaGasto(supabase, sucursal, modulo, categoria) {
  const cat = String(categoria || '').trim().toUpperCase();
  if (!supabase) {
    guardarLocal(
      modulo,
      leerLocal(modulo).filter((x) => x.categoria !== cat),
    );
    return { ok: true };
  }
  const { error } = await supabase
    .from('cortes_gasto_catalogo')
    .delete()
    .eq('sucursal_id', CATALOGO_GASTOS_GLOBAL)
    .eq('modulo', modulo)
    .eq('categoria', cat);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function renombrarCategoriaGasto(supabase, sucursal, modulo, categoriaVieja, categoriaNueva, subcategorias) {
  const vieja = String(categoriaVieja || '').trim().toUpperCase();
  const nueva = String(categoriaNueva || '').trim().toUpperCase();
  if (!vieja || !nueva) return { ok: false, error: 'Nombre de categoría inválido.' };
  if (vieja === nueva) {
    return guardarCategoriaGasto(supabase, sucursal, modulo, nueva, subcategorias);
  }
  const del = await eliminarCategoriaGasto(supabase, sucursal, modulo, vieja);
  if (!del.ok) return del;
  return guardarCategoriaGasto(supabase, sucursal, modulo, nueva, subcategorias);
}

export async function actualizarSubcategoriasGasto(supabase, sucursal, modulo, categoria, subcategorias) {
  return guardarCategoriaGasto(supabase, sucursal, modulo, categoria, subcategorias);
}

export async function eliminarSubcategoriaGasto(supabase, sucursal, modulo, categoria, subcategoria) {
  const res = await listarCatalogoGastos(supabase, sucursal, modulo);
  const cat = String(categoria || '').trim().toUpperCase();
  const sub = String(subcategoria || '').trim().toUpperCase();
  const row = (res.data || []).find((x) => x.categoria === cat);
  if (!row) return { ok: false, error: 'Categoría no encontrada.' };
  const subs = (row.subcategorias || []).filter((s) => s !== sub);
  return guardarCategoriaGasto(supabase, sucursal, modulo, cat, subs);
}
