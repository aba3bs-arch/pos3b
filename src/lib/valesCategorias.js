/** Catálogo de tipos de vale: fijos (consumo, gasolina…) + extras permanentes del admin. */

export const EVENTO_VALES_CATEGORIAS = 'pos3b-vales-categorias';
const LS_EXTRA = 'pos3b_vales_categorias_extra';

/** Tipos fijos del sistema (igual que gasolina / consumo). */
export const CATEGORIAS_VALE_FIJAS = [
  { id: 'consumo', label: 'Consumo / personal', descuentaNomina: true, fijo: true },
  { id: 'gasolina', label: 'Gasolina', descuentaNomina: false, fijo: true },
  { id: 'herramienta', label: 'Herramienta', descuentaNomina: false, fijo: true },
  { id: 'accesorios', label: 'Accesorios', descuentaNomina: false, fijo: true },
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
  };
}

export function leerCategoriasValeExtra() {
  try {
    const raw = localStorage.getItem(LS_EXTRA);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizarExtra).filter(Boolean);
  } catch {
    return [];
  }
}

export function guardarCategoriasValeExtraLocal(lista) {
  const limpia = (lista || []).map(normalizarExtra).filter(Boolean);
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

/** Todas las categorías activas (fijas + extras del admin). */
export function listarCategoriasVale() {
  const extras = leerCategoriasValeExtra().filter((c) => c.activo !== false);
  const vistos = new Set(CATEGORIAS_VALE_FIJAS.map((c) => c.id));
  const out = CATEGORIAS_VALE_FIJAS.map((c) => ({ ...c }));
  for (const e of extras) {
    if (vistos.has(e.id)) continue;
    vistos.add(e.id);
    out.push({ ...e, fijo: false });
  }
  return out;
}

export function categoriaValePorId(id) {
  const key = String(id || '').toLowerCase();
  return listarCategoriasVale().find((c) => c.id === key) || CATEGORIAS_VALE_FIJAS[0];
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

function filaNubeALocal(row) {
  return normalizarExtra({
    id: row.id,
    label: row.label,
    descuenta_nomina: row.descuenta_nomina,
    activo: row.activo,
  });
}

export async function sincronizarCategoriasValeDesdeNube(supabase) {
  if (!supabase) return { ok: true, cambio: false };
  const { data, error } = await supabase
    .from('vales_categorias')
    .select('id, label, descuenta_nomina, activo, fijo')
    .eq('activo', true)
    .eq('fijo', false)
    .order('label');
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || msg.includes('vales_categorias')) {
      return { ok: true, aviso: AVISO_FALTA_VALES_CATEGORIAS, sinTabla: true, cambio: false };
    }
    return { ok: false, error: error.message, cambio: false };
  }
  const remotas = (data || []).map(filaNubeALocal).filter(Boolean);
  const local = leerCategoriasValeExtra();
  const mismo =
    remotas.length === local.length &&
    remotas.every((r) => {
      const l = local.find((x) => x.id === r.id);
      return l && l.label === r.label && l.descuentaNomina === r.descuentaNomina && l.activo === r.activo;
    });
  if (!mismo) guardarCategoriasValeExtraLocal(remotas);
  return { ok: true, cambio: !mismo, data: remotas };
}

export async function crearCategoriaValePermanente(supabase, { label, descuentaNomina = false, createdBy } = {}) {
  const nombre = String(label || '').trim();
  if (!nombre) return { ok: false, error: 'Indica el nombre del tipo de vale.' };
  let id = slugCategoria(nombre);
  if (idsFijos().has(id)) id = `${id}-extra`;
  const existentes = leerCategoriasValeExtra();
  if (existentes.some((c) => c.id === id) || idsFijos().has(id)) {
    return { ok: false, error: 'Ya existe un tipo de vale con ese nombre.' };
  }
  const cat = { id, label: nombre, descuentaNomina: Boolean(descuentaNomina), activo: true, fijo: false };

  if (supabase) {
    const { error } = await supabase.from('vales_categorias').upsert(
      {
        id: cat.id,
        label: cat.label,
        descuenta_nomina: cat.descuentaNomina,
        activo: true,
        fijo: false,
        created_by: createdBy || null,
      },
      { onConflict: 'id' },
    );
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (error.code === '42P01' || msg.includes('vales_categorias')) {
        guardarCategoriasValeExtraLocal([...existentes, cat]);
        return { ok: true, categoria: cat, aviso: AVISO_FALTA_VALES_CATEGORIAS, soloLocal: true };
      }
      return { ok: false, error: error.message };
    }
  }

  guardarCategoriasValeExtraLocal([...existentes.filter((c) => c.id !== id), cat]);
  return { ok: true, categoria: cat };
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
