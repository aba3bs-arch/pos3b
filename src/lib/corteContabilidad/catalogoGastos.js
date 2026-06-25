const LS_CAT = 'pos3b_corte_catalogo';

function lsKey(sucursal, modulo) {
  return `${LS_CAT}_${modulo}_${sucursal || 'MAIN'}`;
}

const DEFAULTS = {
  virtual: [{ categoria: 'CONSUMO', subcategorias: ['EMPLEADO', 'OFICINA'] }],
  abarrotes: [{ categoria: 'CONSUMO', subcategorias: ['EMPLEADO', 'LIMPIEZA'] }],
  garage: [{ categoria: 'CONSUMO', subcategorias: ['EMPLEADO', 'MANTENIMIENTO'] }],
};

function leerLocal(sucursal, modulo) {
  try {
    const raw = localStorage.getItem(lsKey(sucursal, modulo));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return DEFAULTS[modulo] || [];
}

function guardarLocal(sucursal, modulo, lista) {
  localStorage.setItem(lsKey(sucursal, modulo), JSON.stringify(lista));
}

export async function listarCatalogoGastos(supabase, sucursal, modulo) {
  if (!supabase) return { data: leerLocal(sucursal, modulo) };
  const { data, error } = await supabase
    .from('cortes_gasto_catalogo')
    .select('*')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .order('categoria');
  if (error) {
    if (error.code === '42P01') return { data: leerLocal(sucursal, modulo), aviso: 'Ejecuta fix_contabilidad_ampliacion.sql' };
    return { data: leerLocal(sucursal, modulo), error: error.message };
  }
  if (!data?.length) return { data: DEFAULTS[modulo] || [] };
  return {
    data: data.map((r) => ({
      id: r.id,
      categoria: r.categoria,
      subcategorias: Array.isArray(r.subcategorias) ? r.subcategorias : [],
    })),
  };
}

export async function guardarCategoriaGasto(supabase, sucursal, modulo, categoria, subcategorias = []) {
  const cat = String(categoria || '').trim().toUpperCase();
  if (!cat) return { ok: false, error: 'Categoría vacía.' };
  const subs = (subcategorias || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);

  if (!supabase) {
    const lista = leerLocal(sucursal, modulo).filter((x) => x.categoria !== cat);
    lista.push({ categoria: cat, subcategorias: subs });
    guardarLocal(sucursal, modulo, lista);
    return { ok: true };
  }

  const { error } = await supabase.from('cortes_gasto_catalogo').upsert(
    {
      sucursal_id: sucursal || 'MAIN',
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
      sucursal,
      modulo,
      leerLocal(sucursal, modulo).filter((x) => x.categoria !== cat),
    );
    return { ok: true };
  }
  const { error } = await supabase
    .from('cortes_gasto_catalogo')
    .delete()
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .eq('categoria', cat);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
