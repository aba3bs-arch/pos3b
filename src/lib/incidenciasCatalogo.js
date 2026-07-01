const LS_CATALOGO = 'pos3b_incidencias_catalogo';

export const EVENTO_CATALOGO_INCIDENCIAS = 'pos3b-incidencias-catalogo-updated';

export const AVISO_FALTA_CATALOGO_INCIDENCIAS =
  'Ejecuta supabase/fix_incidencias_categorias.sql en Supabase para el catálogo de incidencias.';

/** Catálogo base; las personalizadas se agregan en Configuración (admin). */
export const CATALOGO_INCIDENCIAS_DEFAULT = [
  { id: 'operacion', label: 'Operación / caja', subcategorias: ['Corte de caja', 'Ventas', 'Cobro'], esPersonalizada: false },
  { id: 'inventario', label: 'Inventario', subcategorias: ['Faltante', 'Producto dañado', 'Conteo'], esPersonalizada: false },
  { id: 'equipo', label: 'Equipo / sistema', subcategorias: ['Impresora', 'POS', 'Red / internet'], esPersonalizada: false },
  { id: 'personal', label: 'Personal', subcategorias: ['Falta', 'Conducta', 'Horario'], esPersonalizada: false },
  { id: 'cliente', label: 'Cliente', subcategorias: ['Queja', 'Devolución'], esPersonalizada: false },
  { id: 'mantenimiento', label: 'Mantenimiento', subcategorias: ['Instalaciones', 'Limpieza', 'Reparación'], esPersonalizada: false },
  { id: 'virtual', label: 'Virtual', subcategorias: ['Recolección', 'Moneda', 'Corte virtual'], esPersonalizada: false },
  { id: 'abarrotes', label: 'Abarrotes', subcategorias: ['Mostrador', 'Bodega'], esPersonalizada: false },
  { id: 'garage', label: 'Garage', subcategorias: ['Servicio', 'Refacciones', 'Mantenimiento'], esPersonalizada: false },
  { id: 'otro', label: 'Otro', subcategorias: [], esPersonalizada: false },
];

export function normalizarIdCategoria(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

function normalizarFila(row) {
  const id = normalizarIdCategoria(row?.id || row?.categoria_id || row?.label || row?.etiqueta);
  const label = String(row?.label || row?.etiqueta || id).trim();
  const subs = Array.isArray(row?.subcategorias)
    ? row.subcategorias.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return {
    id,
    label: label || id,
    subcategorias: [...new Set(subs)],
    esPersonalizada: Boolean(row?.esPersonalizada ?? row?.es_personalizada ?? true),
  };
}

function emitir() {
  window.dispatchEvent(new CustomEvent(EVENTO_CATALOGO_INCIDENCIAS));
}

export function leerCatalogoIncidenciasLocal() {
  try {
    const raw = localStorage.getItem(LS_CATALOGO);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.map(normalizarFila);
  } catch {
    return null;
  }
}

function guardarCatalogoIncidenciasLocal(lista) {
  localStorage.setItem(LS_CATALOGO, JSON.stringify(lista));
  emitir();
}

function mapRowsDb(data) {
  return (data || []).map((r) =>
    normalizarFila({
      id: r.categoria_id,
      label: r.etiqueta,
      subcategorias: r.subcategorias,
      esPersonalizada: r.es_personalizada,
    }),
  );
}

function fusionarConDefaults(customRows) {
  const map = new Map(CATALOGO_INCIDENCIAS_DEFAULT.map((c) => [c.id, { ...c }]));
  for (const row of customRows || []) {
    const n = normalizarFila(row);
    if (!n.id) continue;
    const prev = map.get(n.id);
    if (prev && !prev.esPersonalizada && !n.esPersonalizada) {
      map.set(n.id, {
        ...prev,
        subcategorias: n.subcategorias.length ? n.subcategorias : prev.subcategorias,
      });
    } else {
      map.set(n.id, n);
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

export function catalogoIncidenciasActivo() {
  return leerCatalogoIncidenciasLocal() || CATALOGO_INCIDENCIAS_DEFAULT;
}

export function etiquetaCategoriaCatalogo(categoriaId, catalogo = null) {
  const lista = catalogo || catalogoIncidenciasActivo();
  const found = lista.find((c) => c.id === categoriaId);
  return found?.label || categoriaId || 'Otro';
}

export function etiquetaSubcategoriaIncidencia(sub, categoriaId, catalogo = null) {
  if (!sub) return '—';
  return String(sub);
}

export async function listarCatalogoIncidencias(supabase) {
  const local = leerCatalogoIncidenciasLocal();
  if (!supabase) {
    return { data: local || CATALOGO_INCIDENCIAS_DEFAULT, fuente: 'local' };
  }

  const { data, error } = await supabase.from('pos_incidencias_catalogo').select('*').order('etiqueta');
  if (error?.code === '42P01') {
    return {
      data: local || CATALOGO_INCIDENCIAS_DEFAULT,
      aviso: AVISO_FALTA_CATALOGO_INCIDENCIAS,
      fuente: 'default',
    };
  }
  if (error) {
    return { data: local || CATALOGO_INCIDENCIAS_DEFAULT, error: error.message, fuente: 'default' };
  }

  if (!data?.length) {
    const base = local || CATALOGO_INCIDENCIAS_DEFAULT;
    guardarCatalogoIncidenciasLocal(base);
    return { data: base, fuente: local ? 'local' : 'default' };
  }

  const fusionado = fusionarConDefaults(mapRowsDb(data));
  guardarCatalogoIncidenciasLocal(fusionado);
  return { data: fusionado, fuente: 'nube' };
}

async function persistirCatalogo(supabase, lista) {
  guardarCatalogoIncidenciasLocal(lista);
  if (!supabase) return { ok: true, local: true };

  const rows = lista.map((c) => ({
    categoria_id: c.id,
    etiqueta: c.label,
    subcategorias: c.subcategorias,
    es_personalizada: Boolean(c.esPersonalizada),
  }));
  const { error } = await supabase.from('pos_incidencias_catalogo').upsert(rows, { onConflict: 'categoria_id' });
  if (error?.code === '42P01') return { ok: true, local: true, aviso: AVISO_FALTA_CATALOGO_INCIDENCIAS };
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function guardarCatalogoIncidenciasCompleto(supabase, lista) {
  const normalizado = fusionarConDefaults(lista);
  return persistirCatalogo(supabase, normalizado);
}

export async function agregarCategoriaIncidencia(supabase, { label, subcategorias = [] }) {
  const id = normalizarIdCategoria(label);
  if (!id) return { ok: false, error: 'Nombre de categoría inválido.' };
  const lista = catalogoIncidenciasActivo();
  if (lista.some((c) => c.id === id)) return { ok: false, error: 'Ya existe esa categoría.' };
  const subs = (subcategorias || []).map((s) => String(s).trim()).filter(Boolean);
  const next = [...lista, { id, label: String(label).trim(), subcategorias: subs, esPersonalizada: true }].sort((a, b) =>
    a.label.localeCompare(b.label, 'es'),
  );
  const res = await persistirCatalogo(supabase, next);
  if (!res.ok) return res;
  return { ok: true, catalogo: next };
}

export async function agregarSubcategoriaIncidencia(supabase, categoriaId, subcategoria) {
  const id = normalizarIdCategoria(categoriaId);
  const sub = String(subcategoria || '').trim();
  if (!id || !sub) return { ok: false, error: 'Indica categoría y subcategoría.' };
  const lista = catalogoIncidenciasActivo();
  const idx = lista.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: false, error: 'Categoría no encontrada.' };
  const row = { ...lista[idx] };
  if (row.subcategorias.includes(sub)) return { ok: false, error: 'La subcategoría ya existe.' };
  row.subcategorias = [...row.subcategorias, sub].sort((a, b) => a.localeCompare(b, 'es'));
  const next = [...lista];
  next[idx] = row;
  const res = await persistirCatalogo(supabase, next);
  if (!res.ok) return res;
  return { ok: true, catalogo: next };
}

export async function quitarSubcategoriaIncidencia(supabase, categoriaId, subcategoria) {
  const id = normalizarIdCategoria(categoriaId);
  const sub = String(subcategoria || '').trim();
  const lista = catalogoIncidenciasActivo();
  const idx = lista.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: false, error: 'Categoría no encontrada.' };
  const row = { ...lista[idx] };
  row.subcategorias = row.subcategorias.filter((s) => s !== sub);
  const next = [...lista];
  next[idx] = row;
  const res = await persistirCatalogo(supabase, next);
  if (!res.ok) return res;
  return { ok: true, catalogo: next };
}

export async function quitarCategoriaIncidencia(supabase, categoriaId) {
  const id = normalizarIdCategoria(categoriaId);
  const lista = catalogoIncidenciasActivo();
  const row = lista.find((c) => c.id === id);
  if (!row) return { ok: false, error: 'Categoría no encontrada.' };
  if (!row.esPersonalizada) return { ok: false, error: 'No se pueden quitar categorías del sistema.' };
  const next = lista.filter((c) => c.id !== id);
  const res = await persistirCatalogo(supabase, next);
  if (!res.ok) return res;
  if (supabase) {
    await supabase.from('pos_incidencias_catalogo').delete().eq('categoria_id', id);
  }
  return { ok: true, catalogo: next };
}
