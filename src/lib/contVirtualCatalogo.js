/**
 * Catálogo Cont Virtual / IE: Categoría → Subcategoría → Detalle (admin).
 * Supabase + respaldo localStorage si falta la tabla.
 */
const LS_CAT = 'pos3b_cont_virtual_catalogo';
export const EVENTO_CONT_VIRTUAL_CATALOGO = 'pos3b-cont-virtual-catalogo';

export const AVISO_FALTA_CONT_VIRTUAL =
  'Ejecuta supabase/fix_cont_virtual.sql y supabase/fix_cont_virtual_detalle.sql en Supabase (categorías IE + detalle).';

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
    id: 'empleado',
    nombre: 'Empleado 🤵',
    orden: 18,
    activo: true,
    fijo: true,
    subcategorias: [
      { id: 'empleado-consumo', nombre: 'Consumo 🥫', orden: 10, activo: true, fijo: true },
      { id: 'empleado-anticipo', nombre: 'Anticipo $', orden: 20, activo: true, fijo: true },
      { id: 'empleado-cubre', nombre: 'Cubre turnos 👭', orden: 30, activo: true, fijo: true },
      { id: 'empleado-faltante', nombre: 'Faltante ❎', orden: 40, activo: true, fijo: true },
      { id: 'empleado-nomina', nombre: 'Nomina Empleado 💰', orden: 50, activo: true, fijo: true },
      { id: 'empleado-otros', nombre: 'otros ‼️', orden: 60, activo: true, fijo: true },
      { id: 'empleado-recargas', nombre: 'Recargas 📱', orden: 70, activo: true, fijo: true },
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
    id: 'recargas',
    nombre: 'Recargas',
    orden: 22,
    activo: true,
    fijo: true,
    subcategorias: [
      { id: 'recargas-celular', nombre: 'Celular', orden: 10, activo: true, fijo: true },
      { id: 'recargas-otras', nombre: 'Otras', orden: 20, activo: true, fijo: true },
    ],
  },
  {
    id: 'anticipos',
    nombre: 'Anticipos',
    orden: 24,
    activo: true,
    fijo: true,
    subcategorias: [{ id: 'anticipos-empleado', nombre: 'Empleado', orden: 10, activo: true, fijo: true }],
  },
  {
    id: 'faltante',
    nombre: 'Faltante',
    orden: 26,
    activo: true,
    fijo: true,
    subcategorias: [{ id: 'faltante-caja', nombre: 'Faltante', orden: 10, activo: true, fijo: true }],
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
      if (Array.isArray(j) && j.length) {
        return j.map((c) => ({
          ...c,
          subcategorias: (c.subcategorias || []).map((s) => ({
            ...s,
            detalles: (s.detalles || []).map((d) => ({ ...d })),
          })),
        }));
      }
    }
  } catch {
    /* ignore */
  }
  return CATEGORIAS_CONT_VIRTUAL_DEFAULT.map((c) => ({
    ...c,
    subcategorias: (c.subcategorias || []).map((s) => ({ ...s, detalles: s.detalles || [] })),
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

function armarCatalogo(cats, subs, detalles = []) {
  const byCat = {};
  const bySub = {};
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
    const row = {
      id: s.id,
      nombre: s.nombre,
      orden: Number(s.orden) || 0,
      activo: s.activo !== false,
      fijo: Boolean(s.fijo),
      categoria_id: s.categoria_id,
      detalles: [],
    };
    parent.subcategorias.push(row);
    bySub[s.id] = row;
  }
  for (const d of detalles || []) {
    const parent = bySub[d.subcategoria_id];
    if (!parent) continue;
    parent.detalles.push({
      id: d.id,
      nombre: d.nombre,
      orden: Number(d.orden) || 0,
      activo: d.activo !== false,
      fijo: Boolean(d.fijo),
      subcategoria_id: d.subcategoria_id,
    });
  }
  return Object.values(byCat)
    .map((c) => ({
      ...c,
      subcategorias: c.subcategorias
        .map((s) => ({
          ...s,
          detalles: (s.detalles || []).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')),
        }))
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')),
    }))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
}

export async function listarCatalogoContVirtual(supabase) {
  if (!supabase) return { data: leerLocal(), soloLocal: true };
  const [cRes, sRes, dRes] = await Promise.all([
    supabase.from('cont_virtual_categorias').select('*').order('orden'),
    supabase.from('cont_virtual_subcategorias').select('*').order('orden'),
    supabase.from('cont_virtual_detalles').select('*').order('orden'),
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
  const tieneCatEmpleado = (cRes.data || []).some((c) => {
    const id = String(c.id || '').toLowerCase();
    const nom = String(c.nombre || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return id === 'empleado' || nom === 'empleado' || nom.startsWith('empleado ');
  });
  if (
    !ids.has('cubre-turno')
    || !ids.has('taxis')
    || !ids.has('recargas')
    || !ids.has('anticipos')
    || !ids.has('faltante')
    || !tieneCatEmpleado
  ) {
    await sembrarCatalogoDefault(supabase);
    const [c2, s2, d2] = await Promise.all([
      supabase.from('cont_virtual_categorias').select('*').order('orden'),
      supabase.from('cont_virtual_subcategorias').select('*').order('orden'),
      supabase.from('cont_virtual_detalles').select('*').order('orden'),
    ]);
    if (!c2.error) {
      const det = d2.error && faltaTabla(d2.error) ? [] : (d2.data || []);
      const data = armarCatalogo(c2.data, s2.data || [], det);
      guardarLocal(data);
      return { data, aviso: d2.error && faltaTabla(d2.error) ? AVISO_FALTA_CONT_VIRTUAL : undefined };
    }
  }
  const det = dRes.error && faltaTabla(dRes.error) ? [] : (dRes.data || []);
  const data = armarCatalogo(cRes.data, sRes.data || [], det);
  guardarLocal(data);
  return {
    data,
    aviso: dRes.error && faltaTabla(dRes.error) ? AVISO_FALTA_CONT_VIRTUAL : undefined,
  };
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
    cat.subcategorias.push({
      id,
      nombre: label,
      orden: 100,
      activo: true,
      fijo: false,
      categoria_id: categoriaId,
      detalles: [],
    });
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

export async function crearDetalleContVirtual(supabase, { subcategoriaId, nombre }) {
  const label = String(nombre || '').trim();
  if (!subcategoriaId || !label) return { ok: false, error: 'Subcategoría y nombre obligatorios.' };
  const id = slug(`${subcategoriaId}-${label}`, 'det');
  if (!supabase) {
    const lista = leerLocal();
    let found = null;
    for (const c of lista) {
      found = (c.subcategorias || []).find((s) => s.id === subcategoriaId);
      if (found) break;
    }
    if (!found) return { ok: false, error: 'Subcategoría no encontrada.' };
    found.detalles = found.detalles || [];
    if (found.detalles.some((d) => d.id === id)) return { ok: false, error: 'Ya existe ese detalle.' };
    found.detalles.push({
      id,
      nombre: label,
      orden: 100,
      activo: true,
      fijo: false,
      subcategoria_id: subcategoriaId,
    });
    guardarLocal(lista);
    return { ok: true, id };
  }
  const { error } = await supabase.from('cont_virtual_detalles').insert({
    id,
    subcategoria_id: subcategoriaId,
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

export async function editarCategoriaContVirtual(supabase, id, { nombre } = {}) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  const label = String(nombre || '').trim();
  if (!label) return { ok: false, error: 'Nombre obligatorio.' };
  if (!supabase) {
    const lista = leerLocal();
    const cat = lista.find((c) => c.id === id);
    if (!cat) return { ok: false, error: 'Categoría no encontrada.' };
    cat.nombre = label;
    guardarLocal(lista);
    return { ok: true };
  }
  const { error } = await supabase.from('cont_virtual_categorias').update({ nombre: label }).eq('id', id);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONT_VIRTUAL };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function editarSubcategoriaContVirtual(supabase, id, { nombre } = {}) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  const label = String(nombre || '').trim();
  if (!label) return { ok: false, error: 'Nombre obligatorio.' };
  if (!supabase) {
    const lista = leerLocal();
    let found = false;
    for (const c of lista) {
      const s = (c.subcategorias || []).find((x) => x.id === id);
      if (s) {
        s.nombre = label;
        found = true;
        break;
      }
    }
    if (!found) return { ok: false, error: 'Subcategoría no encontrada.' };
    guardarLocal(lista);
    return { ok: true };
  }
  const { error } = await supabase.from('cont_virtual_subcategorias').update({ nombre: label }).eq('id', id);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONT_VIRTUAL };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function editarDetalleContVirtual(supabase, id, { nombre } = {}) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  const label = String(nombre || '').trim();
  if (!label) return { ok: false, error: 'Nombre obligatorio.' };
  if (!supabase) {
    const lista = leerLocal();
    let found = false;
    for (const c of lista) {
      for (const s of c.subcategorias || []) {
        const d = (s.detalles || []).find((x) => x.id === id);
        if (d) {
          d.nombre = label;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) return { ok: false, error: 'Detalle no encontrado.' };
    guardarLocal(lista);
    return { ok: true };
  }
  const { error } = await supabase.from('cont_virtual_detalles').update({ nombre: label }).eq('id', id);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONT_VIRTUAL };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function desactivarCategoriaContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (!supabase) {
    const lista = leerLocal().map((c) => (c.id === id ? { ...c, activo: false } : c));
    guardarLocal(lista);
    return { ok: true };
  }
  const { error } = await supabase.from('cont_virtual_categorias').update({ activo: false }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function desactivarSubcategoriaContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (!supabase) {
    const lista = leerLocal().map((c) => ({
      ...c,
      subcategorias: (c.subcategorias || []).map((s) => (s.id === id ? { ...s, activo: false } : s)),
    }));
    guardarLocal(lista);
    return { ok: true };
  }
  const { error } = await supabase.from('cont_virtual_subcategorias').update({ activo: false }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Elimina categoría. Las del sistema (fijo) solo se desactivan. */
export async function eliminarCategoriaContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (!supabase) {
    const lista = leerLocal();
    const cat = lista.find((c) => c.id === id);
    if (!cat) return { ok: false, error: 'Categoría no encontrada.' };
    if (cat.fijo) {
      cat.activo = false;
      guardarLocal(lista);
      return { ok: true, desactivada: true };
    }
    guardarLocal(lista.filter((c) => c.id !== id));
    return { ok: true };
  }
  const { data: row } = await supabase.from('cont_virtual_categorias').select('fijo').eq('id', id).maybeSingle();
  if (row?.fijo) {
    const { error } = await supabase.from('cont_virtual_categorias').update({ activo: false }).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, desactivada: true };
  }
  const { error } = await supabase.from('cont_virtual_categorias').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Elimina subcategoría. Las del sistema (fijo) solo se desactivan. */
export async function eliminarSubcategoriaContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (!supabase) {
    const lista = leerLocal();
    let desactivada = false;
    for (const c of lista) {
      const s = (c.subcategorias || []).find((x) => x.id === id);
      if (!s) continue;
      if (s.fijo) {
        s.activo = false;
        desactivada = true;
      } else {
        c.subcategorias = (c.subcategorias || []).filter((x) => x.id !== id);
      }
      break;
    }
    guardarLocal(lista);
    return { ok: true, desactivada };
  }
  const { data: row } = await supabase.from('cont_virtual_subcategorias').select('fijo').eq('id', id).maybeSingle();
  if (row?.fijo) {
    const { error } = await supabase.from('cont_virtual_subcategorias').update({ activo: false }).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, desactivada: true };
  }
  const { error } = await supabase.from('cont_virtual_subcategorias').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Elimina detalle (3er nivel). Las del sistema (fijo) solo se desactivan. */
export async function eliminarDetalleContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (!supabase) {
    const lista = leerLocal();
    let desactivada = false;
    for (const c of lista) {
      for (const s of c.subcategorias || []) {
        const d = (s.detalles || []).find((x) => x.id === id);
        if (!d) continue;
        if (d.fijo) {
          d.activo = false;
          desactivada = true;
        } else {
          s.detalles = (s.detalles || []).filter((x) => x.id !== id);
        }
        guardarLocal(lista);
        return { ok: true, desactivada };
      }
    }
    return { ok: false, error: 'Detalle no encontrado.' };
  }
  const { data: row } = await supabase.from('cont_virtual_detalles').select('fijo').eq('id', id).maybeSingle();
  if (row?.fijo) {
    const { error } = await supabase.from('cont_virtual_detalles').update({ activo: false }).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, desactivada: true };
  }
  const { error } = await supabase.from('cont_virtual_detalles').delete().eq('id', id);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONT_VIRTUAL };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function resolverNombresCatalogo(catalogo, categoriaId, subcategoriaId, detalleId = null) {
  const cat = (catalogo || []).find((c) => c.id === categoriaId);
  const sub = (cat?.subcategorias || []).find((s) => s.id === subcategoriaId);
  const det = detalleId
    ? (sub?.detalles || []).find((d) => d.id === detalleId)
    : null;
  return {
    categoria_nombre: cat?.nombre || categoriaId || '—',
    subcategoria_nombre: sub?.nombre || subcategoriaId || '',
    detalle_nombre: det?.nombre || detalleId || '',
  };
}

export function mapearCorteACatalogo(categoria, subcategoria) {
  const cat = String(categoria || '').trim().toUpperCase();
  const sub = String(subcategoria || '').trim().toUpperCase();
  const cubreTaxi = mapearGastoCorteCubreTaxiACatalogo({ categoria: cat, subcategoria: sub });
  if (cubreTaxi) return cubreTaxi;
  if (cat === 'EMPLEADO' || cat.startsWith('EMPLEADO ')) {
    const mapa = [
      ['CONSUMO', 'empleado-consumo'],
      ['ANTICIPO', 'empleado-anticipo'],
      ['CUBRE', 'empleado-cubre'],
      ['FALTANTE', 'empleado-faltante'],
      ['NOMINA', 'empleado-nomina'],
      ['RECARG', 'empleado-recargas'],
      ['OTRO', 'empleado-otros'],
    ];
    for (const [needle, sid] of mapa) {
      if (sub.includes(needle)) return { categoriaId: 'empleado', subcategoriaId: sid };
    }
    return { categoriaId: 'empleado', subcategoriaId: 'empleado-otros' };
  }
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
