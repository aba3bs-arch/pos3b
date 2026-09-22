/** Catálogo de tipos de vale: fijos (consumo, gasolina…) + extras permanentes del admin (con subcategorías). */

export const EVENTO_VALES_CATEGORIAS = 'pos3b-vales-categorias';
const LS_EXTRA = 'pos3b_vales_categorias_extra';

/** Tipos fijos del sistema (igual que gasolina / consumo). */
export const CATEGORIAS_VALE_FIJAS = [
  { id: 'consumo', label: 'Consumo / personal', descuentaNomina: true, fijo: true, subcategorias: [] },
  { id: 'gasolina', label: 'Gasolina', descuentaNomina: false, fijo: true, subcategorias: [] },
  { id: 'herramienta', label: 'Herramienta', descuentaNomina: false, fijo: true, subcategorias: [] },
  { id: 'accesorios', label: 'Accesorios', descuentaNomina: false, fijo: true, subcategorias: [] },
];

/** @deprecated usar CATEGORIAS_VALE_FIJAS + listarCategoriasVale() */
export const CATEGORIAS_VALE = CATEGORIAS_VALE_FIJAS;

export const AVISO_FALTA_VALES_CATEGORIAS =
  'Opcional: ejecuta supabase/fix_vales_categorias.sql para sincronizar tipos de vale entre sucursales.';

function slugCategoria(label) {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return base || `tipo-${Date.now().toString(36)}`;
}

function idsFijos() {
  return new Set(CATEGORIAS_VALE_FIJAS.map((c) => c.id));
}

function normalizarSub(s) {
  if (s == null) return null;
  if (typeof s === 'string') {
    const label = s.trim();
    if (!label) return null;
    return { id: slugCategoria(label), label };
  }
  const label = String(s.label || s.nombre || s.id || '').trim();
  if (!label) return null;
  const id = String(s.id || slugCategoria(label)).trim().toLowerCase() || slugCategoria(label);
  return { id, label };
}

function normalizarSubs(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const s = normalizarSub(raw);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

function normalizarExtra(row) {
  if (!row) return null;
  const id = String(row.id || '').trim().toLowerCase();
  if (!id || idsFijos().has(id)) return null;
  const label = String(row.label || row.id || '').trim();
  if (!label) return null;
  return {
    id,
    label,
    descuentaNomina: Boolean(row.descuentaNomina ?? row.descuenta_nomina),
    activo: row.activo !== false,
    fijo: false,
    subcategorias: normalizarSubs(row.subcategorias),
  };
}

/** Subs de categorías fijas guardadas junto a extras (mismo LS / nube vía fila especial o campo). */
function normalizarFijaConSubs(row) {
  if (!row) return null;
  const id = String(row.id || '').trim().toLowerCase();
  if (!idsFijos().has(id)) return null;
  return {
    id,
    label: String(row.label || id).trim(),
    descuentaNomina: Boolean(row.descuentaNomina ?? row.descuenta_nomina),
    activo: row.activo !== false,
    fijo: true,
    subcategorias: normalizarSubs(row.subcategorias),
    _metaFija: true,
  };
}

export function leerCategoriasValeExtra() {
  try {
    const raw = localStorage.getItem(LS_EXTRA);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((r) => normalizarExtra(r) || normalizarFijaConSubs(r)).filter(Boolean);
  } catch {
    return [];
  }
}

export function guardarCategoriasValeExtraLocal(lista) {
  const limpia = (lista || [])
    .map((r) => normalizarExtra(r) || normalizarFijaConSubs(r))
    .filter(Boolean);
  try {
    localStorage.setItem(LS_EXTRA, JSON.stringify(limpia));
  } catch {
    /* quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_VALES_CATEGORIAS, { detail: limpia }));
  }
  return limpia;
}

function subsDeFijaDesdeExtra(id) {
  const meta = leerCategoriasValeExtra().find((c) => c.id === id && (c.fijo || c._metaFija));
  return meta?.subcategorias || [];
}

/** Todas las categorías activas (fijas + extras del admin). */
export function listarCategoriasVale() {
  const extras = leerCategoriasValeExtra().filter((c) => c.activo !== false && !c._metaFija && !c.fijo);
  const metaFijas = leerCategoriasValeExtra().filter((c) => c._metaFija || (c.fijo && idsFijos().has(c.id)));
  const vistos = new Set(CATEGORIAS_VALE_FIJAS.map((c) => c.id));
  const out = CATEGORIAS_VALE_FIJAS.map((c) => {
    const meta = metaFijas.find((m) => m.id === c.id);
    return {
      ...c,
      subcategorias: meta?.subcategorias?.length ? meta.subcategorias : [],
    };
  });
  for (const e of extras) {
    if (vistos.has(e.id)) continue;
    vistos.add(e.id);
    out.push({ ...e, fijo: false, subcategorias: e.subcategorias || [] });
  }
  return out;
}

export function categoriaValePorId(id) {
  const key = String(id || '').toLowerCase();
  return listarCategoriasVale().find((c) => c.id === key) || CATEGORIAS_VALE_FIJAS[0];
}

export function listarSubcategoriasVale(categoriaId) {
  const cat = categoriaValePorId(categoriaId);
  return cat?.subcategorias || [];
}

export function etiquetaSubcategoriaVale(categoriaId, subId) {
  const key = String(subId || '').trim().toLowerCase();
  if (!key) return '';
  const sub = listarSubcategoriasVale(categoriaId).find(
    (s) => s.id === key || String(s.label).toLowerCase() === key,
  );
  return sub?.label || String(subId || '');
}

export function valeDescuentaNomina(categoria) {
  return Boolean(categoriaValePorId(categoria).descuentaNomina);
}

export function etiquetaCategoriaVale(categoria) {
  const key = String(categoria || '').toLowerCase();
  if (key === 'otro') return 'Otro concepto';
  return categoriaValePorId(categoria).label;
}

export function esCategoriaValeConocida(categoria) {
  const key = String(categoria || '').toLowerCase();
  if (!key) return false;
  if (key === 'otro') return true;
  return listarCategoriasVale().some((c) => c.id === key);
}

export function esSubcategoriaValeValida(categoriaId, subId) {
  const key = String(subId || '').trim().toLowerCase();
  if (!key) return true; // sub opcional
  const subs = listarSubcategoriasVale(categoriaId);
  if (!subs.length) return true;
  return subs.some((s) => s.id === key || String(s.label).toLowerCase() === key);
}

function filaNubeALocal(row) {
  if (row?.fijo) {
    return normalizarFijaConSubs({
      id: row.id,
      label: row.label,
      descuenta_nomina: row.descuenta_nomina,
      activo: row.activo,
      subcategorias: row.subcategorias,
      fijo: true,
    });
  }
  return normalizarExtra({
    id: row.id,
    label: row.label,
    descuenta_nomina: row.descuenta_nomina,
    activo: row.activo,
    subcategorias: row.subcategorias,
  });
}

export async function sincronizarCategoriasValeDesdeNube(supabase) {
  if (!supabase) return { ok: true, cambio: false };
  const { data, error } = await supabase
    .from('vales_categorias')
    .select('id, label, descuenta_nomina, activo, fijo, subcategorias')
    .eq('activo', true)
    .order('label');
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || msg.includes('vales_categorias')) {
      return { ok: true, aviso: AVISO_FALTA_VALES_CATEGORIAS, sinTabla: true, cambio: false };
    }
    // Columna subcategorias puede faltar en installs viejos
    if (msg.includes('subcategorias')) {
      const retry = await supabase
        .from('vales_categorias')
        .select('id, label, descuenta_nomina, activo, fijo')
        .eq('activo', true)
        .eq('fijo', false)
        .order('label');
      if (retry.error) {
        return { ok: false, error: retry.error.message, cambio: false };
      }
      const remotas = (retry.data || []).map(filaNubeALocal).filter(Boolean);
      const local = leerCategoriasValeExtra().filter((c) => !c._metaFija && !c.fijo);
      const mismo =
        remotas.length === local.length &&
        remotas.every((r) => {
          const l = local.find((x) => x.id === r.id);
          return l && l.label === r.label && l.descuentaNomina === r.descuentaNomina && l.activo === r.activo;
        });
      if (!mismo) {
        const metaFijas = leerCategoriasValeExtra().filter((c) => c._metaFija || c.fijo);
        guardarCategoriasValeExtraLocal([...metaFijas, ...remotas]);
      }
      return { ok: true, cambio: !mismo, data: remotas, aviso: AVISO_FALTA_VALES_CATEGORIAS };
    }
    return { ok: false, error: error.message, cambio: false };
  }
  const remotas = (data || [])
    .filter((r) => !r.fijo || (Array.isArray(r.subcategorias) && r.subcategorias.length))
    .map(filaNubeALocal)
    .filter(Boolean);
  const local = leerCategoriasValeExtra();
  const mismo =
    remotas.length === local.length &&
    remotas.every((r) => {
      const l = local.find((x) => x.id === r.id);
      return (
        l &&
        l.label === r.label &&
        l.descuentaNomina === r.descuentaNomina &&
        l.activo === r.activo &&
        JSON.stringify(l.subcategorias || []) === JSON.stringify(r.subcategorias || [])
      );
    });
  if (!mismo) guardarCategoriasValeExtraLocal(remotas);
  return { ok: true, cambio: !mismo, data: remotas };
}

async function upsertCategoriaNube(supabase, cat, createdBy) {
  if (!supabase) return { ok: true, soloLocal: true };
  const payload = {
    id: cat.id,
    label: cat.label,
    descuenta_nomina: cat.descuentaNomina,
    activo: cat.activo !== false,
    fijo: Boolean(cat.fijo || cat._metaFija),
    subcategorias: cat.subcategorias || [],
    created_by: createdBy || null,
  };
  const { error } = await supabase.from('vales_categorias').upsert(payload, { onConflict: 'id' });
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || msg.includes('vales_categorias')) {
      return { ok: true, aviso: AVISO_FALTA_VALES_CATEGORIAS, soloLocal: true };
    }
    if (msg.includes('subcategorias')) {
      const { error: e2 } = await supabase.from('vales_categorias').upsert(
        {
          id: cat.id,
          label: cat.label,
          descuenta_nomina: cat.descuentaNomina,
          activo: cat.activo !== false,
          fijo: Boolean(cat.fijo || cat._metaFija),
          created_by: createdBy || null,
        },
        { onConflict: 'id' },
      );
      if (e2) return { ok: false, error: e2.message };
      return { ok: true, aviso: AVISO_FALTA_VALES_CATEGORIAS };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function crearCategoriaValePermanente(supabase, { label, descuentaNomina = false, createdBy, subcategorias = [] } = {}) {
  const nombre = String(label || '').trim();
  if (!nombre) return { ok: false, error: 'Indica el nombre del tipo de vale.' };
  let id = slugCategoria(nombre);
  if (idsFijos().has(id)) id = `${id}-extra`;
  const existentes = leerCategoriasValeExtra();
  if (existentes.some((c) => c.id === id && !c._metaFija) || idsFijos().has(id)) {
    return { ok: false, error: 'Ya existe un tipo de vale con ese nombre.' };
  }
  const cat = {
    id,
    label: nombre,
    descuentaNomina: Boolean(descuentaNomina),
    activo: true,
    fijo: false,
    subcategorias: normalizarSubs(subcategorias),
  };

  const nube = await upsertCategoriaNube(supabase, cat, createdBy);
  if (!nube.ok) return nube;

  guardarCategoriasValeExtraLocal([...existentes.filter((c) => c.id !== id), cat]);
  return { ok: true, categoria: cat, aviso: nube.aviso, soloLocal: nube.soloLocal };
}

export async function agregarSubcategoriaVale(supabase, categoriaId, label, { createdBy } = {}) {
  const catId = String(categoriaId || '').trim().toLowerCase();
  if (!catId) return { ok: false, error: 'Categoría inválida.' };
  const nombre = String(label || '').trim();
  if (!nombre) return { ok: false, error: 'Indica el nombre de la subcategoría.' };
  const sub = normalizarSub(nombre);
  if (!sub) return { ok: false, error: 'Subcategoría inválida.' };

  const esFija = idsFijos().has(catId);
  const existentes = leerCategoriasValeExtra();
  let cat = existentes.find((c) => c.id === catId);
  if (!cat && esFija) {
    const fija = CATEGORIAS_VALE_FIJAS.find((c) => c.id === catId);
    cat = {
      id: fija.id,
      label: fija.label,
      descuentaNomina: fija.descuentaNomina,
      activo: true,
      fijo: true,
      _metaFija: true,
      subcategorias: [...subsDeFijaDesdeExtra(catId)],
    };
  }
  if (!cat) {
    // Categoría extra debe existir
    const viva = listarCategoriasVale().find((c) => c.id === catId);
    if (!viva) return { ok: false, error: 'No existe esa categoría.' };
    cat = { ...viva, subcategorias: [...(viva.subcategorias || [])] };
  }

  const subs = normalizarSubs(cat.subcategorias || []);
  if (subs.some((s) => s.id === sub.id || s.label.toLowerCase() === sub.label.toLowerCase())) {
    return { ok: false, error: 'Ya existe esa subcategoría.' };
  }
  const next = {
    ...cat,
    subcategorias: [...subs, sub],
    fijo: esFija || Boolean(cat.fijo),
    _metaFija: esFija || Boolean(cat._metaFija),
  };

  const nube = await upsertCategoriaNube(supabase, next, createdBy);
  if (!nube.ok) return nube;

  guardarCategoriasValeExtraLocal([...existentes.filter((c) => c.id !== catId), next]);
  return { ok: true, categoria: next, subcategoria: sub, aviso: nube.aviso };
}

export async function eliminarSubcategoriaVale(supabase, categoriaId, subId) {
  const catId = String(categoriaId || '').trim().toLowerCase();
  const sid = String(subId || '').trim().toLowerCase();
  if (!catId || !sid) return { ok: false, error: 'Datos inválidos.' };

  const existentes = leerCategoriasValeExtra();
  let cat = existentes.find((c) => c.id === catId);
  if (!cat && idsFijos().has(catId)) {
    const fija = CATEGORIAS_VALE_FIJAS.find((c) => c.id === catId);
    cat = {
      id: fija.id,
      label: fija.label,
      descuentaNomina: fija.descuentaNomina,
      activo: true,
      fijo: true,
      _metaFija: true,
      subcategorias: [...subsDeFijaDesdeExtra(catId)],
    };
  }
  if (!cat) return { ok: false, error: 'No existe esa categoría.' };

  const next = {
    ...cat,
    subcategorias: (cat.subcategorias || []).filter((s) => s.id !== sid),
  };

  const nube = await upsertCategoriaNube(supabase, next);
  if (!nube.ok) return nube;

  guardarCategoriasValeExtraLocal([...existentes.filter((c) => c.id !== catId), next]);
  return { ok: true, categoria: next };
}

export async function desactivarCategoriaValePermanente(supabase, id) {
  const key = String(id || '').trim().toLowerCase();
  if (!key) return { ok: false, error: 'Tipo inválido.' };
  if (idsFijos().has(key)) return { ok: false, error: 'No se puede eliminar un tipo fijo del sistema.' };

  if (supabase) {
    const { error } = await supabase.from('vales_categorias').update({ activo: false }).eq('id', key);
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (!(error.code === '42P01' || msg.includes('vales_categorias'))) {
        return { ok: false, error: error.message };
      }
    }
  }

  guardarCategoriasValeExtraLocal(leerCategoriasValeExtra().filter((c) => c.id !== key));
  return { ok: true };
}
