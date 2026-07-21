/**
 * Catálogo Cont Virtual: categorías y subcategorías (admin).
 * Supabase + respaldo localStorage si falta la tabla.
 */
const LS_CAT = 'pos3b_cont_virtual_catalogo';
export const EVENTO_CONT_VIRTUAL_CATALOGO = 'pos3b-cont-virtual-catalogo';

export const AVISO_FALTA_CONT_VIRTUAL =
  'Ejecuta supabase/fix_cont_virtual.sql en Supabase para categorías, egresos y columna cuenta (virtual/garage) de IE VIRTUAL.';

export const CATEGORIAS_CONT_VIRTUAL_DEFAULT = [
  {
    id: 'vales',
    nombre: 'Vales',
    orden: 10,
    activo: true,
    fijo: true,
    subcategorias: [
      { id: 'vales-gasolina', nombre: 'Gasolina', orden: 10, activo: true, fijo: true },
      { id: 'vales-herramienta', nombre: 'Herramienta', orden: 20, activo: true, fijo: true },
      { id: 'vales-accesorios', nombre: 'Accesorios', orden: 30, activo: true, fijo: true },
      { id: 'vales-consumo', nombre: 'Consumo / personal', orden: 40, activo: true, fijo: true },
    ],
  },
  {
    id: 'consumo',
    nombre: 'Consumo',
    orden: 20,
    activo: true,
    fijo: true,
    subcategorias: [
      { id: 'consumo-empleado', nombre: 'Empleado', orden: 10, activo: true, fijo: true },
      { id: 'consumo-oficina', nombre: 'Oficina', orden: 20, activo: true, fijo: true },
    ],
  },
  {
    id: 'operativos',
    nombre: 'Gastos operativos',
    orden: 30,
    activo: true,
    fijo: true,
    subcategorias: [
      { id: 'operativos-suministros', nombre: 'Suministros', orden: 10, activo: true, fijo: true },
      { id: 'operativos-servicios', nombre: 'Servicios', orden: 20, activo: true, fijo: true },
      { id: 'operativos-mantenimiento', nombre: 'Mantenimiento', orden: 30, activo: true, fijo: true },
      { id: 'operativos-otros', nombre: 'Otros', orden: 40, activo: true, fijo: true },
    ],
  },
  {
    id: 'cubre-turno',
    nombre: 'Cubre turno',
    orden: 35,
    activo: true,
    fijo: true,
    subcategorias: [{ id: 'cubre-turno-pago', nombre: 'Pago', orden: 10, activo: true, fijo: true }],
  },
  {
    id: 'taxis',
    nombre: 'Taxis',
    orden: 36,
    activo: true,
    fijo: true,
    subcategorias: [{ id: 'taxis-servicio', nombre: 'Servicio', orden: 10, activo: true, fijo: true }],
  },
  {
    id: 'prestamos',
    nombre: 'Préstamos',
    orden: 40,
    activo: true,
    fijo: true,
    subcategorias: [{ id: 'prestamos-desembolso', nombre: 'Desembolso', orden: 10, activo: true, fijo: true }],
  },
  {
    id: 'manual',
    nombre: 'Otros / manual',
    orden: 90,
    activo: true,
    fijo: true,
    subcategorias: [{ id: 'manual-otros', nombre: 'Otros', orden: 10, activo: true, fijo: true }],
  },
];

/** Mapeo categoría de vale → subcategoría Cont Virtual. */
export const VALE_A_CONT_VIRTUAL = {
  gasolina: { categoriaId: 'vales', subcategoriaId: 'vales-gasolina' },
  herramienta: { categoriaId: 'vales', subcategoriaId: 'vales-herramienta' },
  accesorios: { categoriaId: 'vales', subcategoriaId: 'vales-accesorios' },
  consumo: { categoriaId: 'vales', subcategoriaId: 'vales-consumo' },
};

/** Categorías de corte Virtual que se auto-registran en el libro IE VIRTUAL. */
export const CORTE_A_CONT_VIRTUAL = {
  'CUBRE TURNO': { categoriaId: 'cubre-turno', subcategoriaId: 'cubre-turno-pago' },
  CUBRETURNO: { categoriaId: 'cubre-turno', subcategoriaId: 'cubre-turno-pago' },
  TAXIS: { categoriaId: 'taxis', subcategoriaId: 'taxis-servicio' },
  TAXI: { categoriaId: 'taxis', subcategoriaId: 'taxis-servicio' },
};

/** True si el gasto de corte es cubre turno o taxi (por categoría o subcategoría). */
export function esGastoCubreTurnoOTaxi(gasto) {
  const cat = String(gasto?.categoria || '').trim().toUpperCase();
  const sub = String(gasto?.subcategoria || '').trim().toUpperCase();
  if (CORTE_A_CONT_VIRTUAL[cat]) return true;
  if (cat.includes('CUBRE') && cat.includes('TURNO')) return true;
  if (cat === 'TAXI' || cat === 'TAXIS' || cat.includes('TAXI')) return true;
  if (sub.includes('CUBRE') && sub.includes('TURNO')) return true;
  if (sub === 'TAXI' || sub === 'TAXIS' || sub.includes('TAXI')) return true;
  return false;
}

export function mapearGastoCorteCubreTaxiACatalogo(gasto) {
  const cat = String(gasto?.categoria || '').trim().toUpperCase();
  const sub = String(gasto?.subcategoria || '').trim().toUpperCase();
  if (CORTE_A_CONT_VIRTUAL[cat]) return CORTE_A_CONT_VIRTUAL[cat];
  if (cat.includes('CUBRE') && cat.includes('TURNO')) {
    return { categoriaId: 'cubre-turno', subcategoriaId: 'cubre-turno-pago' };
  }
  if (cat === 'TAXI' || cat === 'TAXIS' || cat.includes('TAXI')) {
    return { categoriaId: 'taxis', subcategoriaId: 'taxis-servicio' };
  }
  if (sub.includes('CUBRE') && sub.includes('TURNO')) {
    return { categoriaId: 'cubre-turno', subcategoriaId: 'cubre-turno-pago' };
  }
  if (sub === 'TAXI' || sub === 'TAXIS' || sub.includes('TAXI')) {
    return { categoriaId: 'taxis', subcategoriaId: 'taxis-servicio' };
  }
  return null;
}

function slug(label, prefix = 'cat') {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
  return base || `${prefix}-${Date.now().toString(36)}`;
}

function faltaTabla(error) {
  const msg = String(error?.message || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('cont_virtual') || (msg.includes('schema cache') && msg.includes('cont_virtual'));
}

function leerLocal() {
  try {
    const raw = localStorage.getItem(LS_CAT);
    if (raw) {
      const j = JSON.parse(raw);
      if (Array.isArray(j) && j.length) return j;
    }
  } catch {
    /* ignore */
  }
  return CATEGORIAS_CONT_VIRTUAL_DEFAULT.map((c) => ({
    ...c,
    subcategorias: (c.subcategorias || []).map((s) => ({ ...s })),
  }));
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS_CAT, JSON.stringify(lista));
  } catch {
    /* quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_CONT_VIRTUAL_CATALOGO, { detail: lista }));
  }
}

function armarCatalogo(cats, subs) {
  const byCat = {};
  for (const c of cats || []) {
    byCat[c.id] = {
      id: c.id,
      nombre: c.nombre,
      orden: Number(c.orden) || 0,
      activo: c.activo !== false,
      fijo: Boolean(c.fijo),
      subcategorias: [],
    };
  }
  for (const s of subs || []) {
    const parent = byCat[s.categoria_id];
    if (!parent) continue;
    parent.subcategorias.push({
      id: s.id,
      nombre: s.nombre,
      orden: Number(s.orden) || 0,
      activo: s.activo !== false,
      fijo: Boolean(s.fijo),
      categoria_id: s.categoria_id,
    });
  }
  return Object.values(byCat)
    .map((c) => ({
      ...c,
      subcategorias: c.subcategorias.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')),
    }))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
}

export async function listarCatalogoContVirtual(supabase) {
  if (!supabase) return { data: leerLocal(), soloLocal: true };
  const [cRes, sRes] = await Promise.all([
    supabase.from('cont_virtual_categorias').select('*').order('orden'),
    supabase.from('cont_virtual_subcategorias').select('*').order('orden'),
  ]);
  if (cRes.error && faltaTabla(cRes.error)) {
    return { data: leerLocal(), soloLocal: true, aviso: AVISO_FALTA_CONT_VIRTUAL };
  }
  if (cRes.error) return { data: leerLocal(), error: cRes.error.message, aviso: AVISO_FALTA_CONT_VIRTUAL };
  if (!cRes.data?.length) {
    await sembrarCatalogoDefault(supabase);
    const again = await listarCatalogoContVirtual(supabase);
    return again;
  }
  const ids = new Set((cRes.data || []).map((c) => c.id));
  if (!ids.has('cubre-turno') || !ids.has('taxis')) {
    await sembrarCatalogoDefault(supabase);
    const [c2, s2] = await Promise.all([
      supabase.from('cont_virtual_categorias').select('*').order('orden'),
      supabase.from('cont_virtual_subcategorias').select('*').order('orden'),
    ]);
    if (!c2.error) {
      const data = armarCatalogo(c2.data, s2.data || []);
      guardarLocal(data);
      return { data };
    }
  }
  const data = armarCatalogo(cRes.data, sRes.data || []);
  guardarLocal(data);
  return { data };
}

export async function sembrarCatalogoDefault(supabase) {
  if (!supabase) {
    guardarLocal(CATEGORIAS_CONT_VIRTUAL_DEFAULT);
    return { ok: true, soloLocal: true };
  }
  const cats = CATEGORIAS_CONT_VIRTUAL_DEFAULT.map(({ id, nombre, orden, activo, fijo }) => ({
    id,
    nombre,
    orden,
    activo,
    fijo,
  }));
  const subs = [];
  for (const c of CATEGORIAS_CONT_VIRTUAL_DEFAULT) {
    for (const s of c.subcategorias || []) {
      subs.push({
        id: s.id,
        categoria_id: c.id,
        nombre: s.nombre,
        orden: s.orden,
        activo: s.activo,
        fijo: s.fijo,
      });
    }
  }
  const { error: e1 } = await supabase.from('cont_virtual_categorias').upsert(cats, { onConflict: 'id' });
  if (e1 && faltaTabla(e1)) {
    guardarLocal(CATEGORIAS_CONT_VIRTUAL_DEFAULT);
    return { ok: true, soloLocal: true, aviso: AVISO_FALTA_CONT_VIRTUAL };
  }
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await supabase.from('cont_virtual_subcategorias').upsert(subs, { onConflict: 'id' });
  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}

export async function crearCategoriaContVirtual(supabase, { nombre }) {
  const label = String(nombre || '').trim();
  if (!label) return { ok: false, error: 'Nombre obligatorio.' };
  const id = slug(label, 'cat');
  if (!supabase) {
    const lista = leerLocal();
    if (lista.some((c) => c.id === id)) return { ok: false, error: 'Ya existe esa categoría.' };
    lista.push({ id, nombre: label, orden: 100, activo: true, fijo: false, subcategorias: [] });
    guardarLocal(lista);
    return { ok: true, id };
  }
  const { error } = await supabase.from('cont_virtual_categorias').insert({
    id,
    nombre: label,
    orden: 100,
    activo: true,
    fijo: false,
  });
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONT_VIRTUAL };
    return { ok: false, error: error.message };
  }
  return { ok: true, id };
}

export async function crearSubcategoriaContVirtual(supabase, { categoriaId, nombre }) {
  const label = String(nombre || '').trim();
  if (!categoriaId || !label) return { ok: false, error: 'Categoría y nombre obligatorios.' };
  const id = slug(`${categoriaId}-${label}`, 'sub');
  if (!supabase) {
    const lista = leerLocal();
    const cat = lista.find((c) => c.id === categoriaId);
    if (!cat) return { ok: false, error: 'Categoría no encontrada.' };
    cat.subcategorias = cat.subcategorias || [];
    if (cat.subcategorias.some((s) => s.id === id)) return { ok: false, error: 'Ya existe esa subcategoría.' };
    cat.subcategorias.push({ id, nombre: label, orden: 100, activo: true, fijo: false, categoria_id: categoriaId });
    guardarLocal(lista);
    return { ok: true, id };
  }
  const { error } = await supabase.from('cont_virtual_subcategorias').insert({
    id,
    categoria_id: categoriaId,
    nombre: label,
    orden: 100,
    activo: true,
    fijo: false,
  });
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONT_VIRTUAL };
    return { ok: false, error: error.message };
  }
  return { ok: true, id };
}

export async function desactivarCategoriaContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (!supabase) {
    const lista = leerLocal().map((c) => (c.id === id && !c.fijo ? { ...c, activo: false } : c));
    guardarLocal(lista);
    return { ok: true };
  }
  const { data: row } = await supabase.from('cont_virtual_categorias').select('fijo').eq('id', id).maybeSingle();
  if (row?.fijo) return { ok: false, error: 'No se puede desactivar una categoría del sistema.' };
  const { error } = await supabase.from('cont_virtual_categorias').update({ activo: false }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function desactivarSubcategoriaContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (!supabase) {
    const lista = leerLocal().map((c) => ({
      ...c,
      subcategorias: (c.subcategorias || []).map((s) => (s.id === id && !s.fijo ? { ...s, activo: false } : s)),
    }));
    guardarLocal(lista);
    return { ok: true };
  }
  const { data: row } = await supabase.from('cont_virtual_subcategorias').select('fijo').eq('id', id).maybeSingle();
  if (row?.fijo) return { ok: false, error: 'No se puede desactivar una subcategoría del sistema.' };
  const { error } = await supabase.from('cont_virtual_subcategorias').update({ activo: false }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function resolverNombresCatalogo(catalogo, categoriaId, subcategoriaId) {
  const cat = (catalogo || []).find((c) => c.id === categoriaId);
  const sub = (cat?.subcategorias || []).find((s) => s.id === subcategoriaId);
  return {
    categoria_nombre: cat?.nombre || categoriaId || '—',
    subcategoria_nombre: sub?.nombre || subcategoriaId || '',
  };
}

export function mapearCorteACatalogo(categoria, subcategoria) {
  const cat = String(categoria || '').trim().toUpperCase();
  const sub = String(subcategoria || '').trim().toUpperCase();
  const cubreTaxi = mapearGastoCorteCubreTaxiACatalogo({ categoria: cat, subcategoria: sub });
  if (cubreTaxi) return cubreTaxi;
  if (cat === 'CONSUMO') {
    if (sub.includes('OFICINA')) return { categoriaId: 'consumo', subcategoriaId: 'consumo-oficina' };
    return { categoriaId: 'consumo', subcategoriaId: 'consumo-empleado' };
  }
  if (cat === 'VALES') {
    if (sub.includes('GASOLINA')) return { categoriaId: 'vales', subcategoriaId: 'vales-gasolina' };
    if (sub.includes('HERRAMIENTA')) return { categoriaId: 'vales', subcategoriaId: 'vales-herramienta' };
    if (sub.includes('ACCESOR')) return { categoriaId: 'vales', subcategoriaId: 'vales-accesorios' };
    return { categoriaId: 'vales', subcategoriaId: 'vales-consumo' };
  }
  if (cat === 'PRESTAMOS') return { categoriaId: 'prestamos', subcategoriaId: 'prestamos-desembolso' };
  if (cat.includes('OPERATIV') || cat === 'GASTOS OPERATIVOS') {
    if (sub.includes('SUMINISTRO')) return { categoriaId: 'operativos', subcategoriaId: 'operativos-suministros' };
    if (sub.includes('SERVICIO')) return { categoriaId: 'operativos', subcategoriaId: 'operativos-servicios' };
    if (sub.includes('MANTEN')) return { categoriaId: 'operativos', subcategoriaId: 'operativos-mantenimiento' };
    return { categoriaId: 'operativos', subcategoriaId: 'operativos-otros' };
  }
  return { categoriaId: 'manual', subcategoriaId: 'manual-otros' };
}
