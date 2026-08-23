/**
 * Catálogo Cont Virtual / IE: Categoría → Subcategoría → Detalle (admin).
 * Supabase + respaldo localStorage si falta la tabla.
 */
const LS_CAT = 'pos3b_cont_virtual_catalogo';
export const EVENTO_CONT_VIRTUAL_CATALOGO = 'pos3b-cont-virtual-catalogo';

export const AVISO_FALTA_CONT_VIRTUAL =
  'Ejecuta supabase/fix_cont_virtual.sql, fix_cont_virtual_detalle.sql, fix_cont_virtual_ingresos.sql y fix_cont_virtual_cortes_sucursales.sql en Supabase (categorías IE + detalle + ingresos + cortes por tienda).';

export const AVISO_FALTA_CORTES_SUCURSALES =
  'Ejecuta supabase/fix_cont_virtual_cortes_sucursales.sql en Supabase para enviar categorías a tiendas específicas.';

/** Categorías de EGRESO (sistema). flujo = 'egreso' implícito. */
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

/** Categorías de INGRESO (independientes de egresos). mismo formato cat→sub→detalle. */
export const CATEGORIAS_INGRESOS_CONT_VIRTUAL_DEFAULT = [
  {
    id: 'ing-recoleccion',
    nombre: 'Recolección / caja',
    orden: 10,
    activo: true,
    fijo: true,
    flujo: 'ingreso',
    subcategorias: [
      { id: 'ing-recoleccion-efectivo', nombre: 'Efectivo', orden: 10, activo: true, fijo: true },
      { id: 'ing-recoleccion-otros', nombre: 'Otros', orden: 20, activo: true, fijo: true },
    ],
  },
  {
    id: 'ing-ventas',
    nombre: 'Ventas / otros',
    orden: 20,
    activo: true,
    fijo: true,
    flujo: 'ingreso',
    subcategorias: [{ id: 'ing-ventas-varios', nombre: 'Varios', orden: 10, activo: true, fijo: true }],
  },
  {
    id: 'ing-manual',
    nombre: 'Otros ingresos',
    orden: 90,
    activo: true,
    fijo: true,
    flujo: 'ingreso',
    subcategorias: [{ id: 'ing-manual-otros', nombre: 'Otros', orden: 10, activo: true, fijo: true }],
  },
];

export function normalizarFlujoCatalogo(flujo) {
  return String(flujo || 'egreso').toLowerCase() === 'ingreso' ? 'ingreso' : 'egreso';
}

export function filtrarCatalogoPorFlujo(catalogo, flujo) {
  const f = normalizarFlujoCatalogo(flujo);
  return (catalogo || []).filter((c) => normalizarFlujoCatalogo(c.flujo) === f && c.activo !== false);
}

/** Normaliza lista de tiendas para cortes: null = todas. */
export function normalizarCortesSucursales(lista) {
  if (lista == null) return null;
  if (!Array.isArray(lista)) return null;
  const out = [...new Set(
    lista.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean),
  )];
  return out.length ? out : null;
}

/** ¿La sucursal está en el alcance? null/[] = todas. */
export function sucursalEnAlcanceCortes(lista, sucursal) {
  if (!sucursal) return true;
  const alcance = normalizarCortesSucursales(lista);
  if (!alcance) return true;
  const suc = String(sucursal).trim().toUpperCase();
  return alcance.includes(suc);
}

/** Etiqueta corta del alcance (para UI). */
export function etiquetaAlcanceCortes(lista) {
  const alcance = normalizarCortesSucursales(lista);
  if (!alcance) return 'todas las tiendas';
  if (alcance.length <= 3) return alcance.join(', ');
  return `${alcance.slice(0, 2).join(', ')} +${alcance.length - 2}`;
}

/** ¿Debe aparecer en el catálogo de gastos de cortes? Empleado siempre sí. */
export function categoriaEnCatalogoCortes(c, { sucursal = null } = {}) {
  if (!c || c.activo === false) return false;
  if (String(c.id || '').toLowerCase() === 'empleado') return true;
  const nom = String(c.nombre || '').trim().toUpperCase();
  if (nom === 'EMPLEADO' || nom.startsWith('EMPLEADO ')) return true;
  if (normalizarFlujoCatalogo(c.flujo) === 'ingreso') return false;
  // null/undefined = true (catálogo previo a la columna)
  if (c.en_catalogo_cortes === false) return false;
  return sucursalEnAlcanceCortes(c.cortes_sucursales, sucursal);
}

/** Subcategoría visible en cortes (requiere padre en cortes si se pasa categoria). */
export function subcategoriaEnCatalogoCortes(sub, { sucursal = null, categoria = null } = {}) {
  if (!sub || sub.activo === false) return false;
  if (sub.es_empleado_vivo) return false;
  if (categoria && !categoriaEnCatalogoCortes(categoria, { sucursal })) return false;
  // null/undefined = true (previo a la columna)
  if (sub.en_catalogo_cortes === false) return false;
  // Si la sub tiene lista propia, filtra; si no, hereda el alcance del padre (ya validado).
  if (normalizarCortesSucursales(sub.cortes_sucursales)) {
    return sucursalEnAlcanceCortes(sub.cortes_sucursales, sucursal);
  }
  return true;
}

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

function catalogoDefaultCompleto() {
  return [
    ...CATEGORIAS_CONT_VIRTUAL_DEFAULT.map((c) => ({
      ...c,
      flujo: 'egreso',
      en_catalogo_cortes: true,
      subcategorias: (c.subcategorias || []).map((s) => ({ ...s, detalles: s.detalles || [] })),
    })),
    ...CATEGORIAS_INGRESOS_CONT_VIRTUAL_DEFAULT.map((c) => ({
      ...c,
      flujo: 'ingreso',
      en_catalogo_cortes: false,
      subcategorias: (c.subcategorias || []).map((s) => ({ ...s, detalles: s.detalles || [] })),
    })),
  ];
}

/** Plantilla fija de la categoría especial Empleado (tipos de nómina). */
export function plantillaCategoriaEmpleadoDefault() {
  const def = CATEGORIAS_CONT_VIRTUAL_DEFAULT.find((c) => c.id === 'empleado');
  return {
    ...def,
    flujo: 'egreso',
    subcategorias: (def?.subcategorias || []).map((s) => ({ ...s, detalles: s.detalles || [] })),
  };
}

function esFilaCategoriaEmpleado(c) {
  if (!c) return false;
  const id = String(c.id || '').trim().toLowerCase();
  const nom = String(c.nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return id === 'empleado' || nom === 'empleado' || nom.startsWith('empleado ');
}

/**
 * En memoria: garantiza categoría `empleado` activa con tipos (Consumo primero).
 * No borra tipos extra que el admin haya agregado.
 */
export function asegurarCategoriaEmpleadoEnLista(lista) {
  const def = plantillaCategoriaEmpleadoDefault();
  const out = (lista || []).map((c) => ({
    ...c,
    subcategorias: (c.subcategorias || []).map((s) => ({
      ...s,
      detalles: (s.detalles || []).map((d) => ({ ...d })),
    })),
  }));
  let idx = out.findIndex((c) => String(c.id || '').toLowerCase() === 'empleado');
  if (idx < 0) idx = out.findIndex((c) => esFilaCategoriaEmpleado(c));

  if (idx < 0) {
    out.push({ ...def });
  } else {
    const actual = out[idx];
    const byId = new Map((actual.subcategorias || []).map((s) => [String(s.id), { ...s }]));
    const defIds = new Set(def.subcategorias.map((s) => s.id));
    for (const sDef of def.subcategorias) {
      const prev = byId.get(sDef.id);
      byId.set(sDef.id, {
        ...(prev || {}),
        ...sDef,
        activo: true,
        fijo: true,
        detalles: prev?.detalles || [],
      });
    }
    // Tipos custom (p. ej. nombres de personas mal guardados como sub) van después de la plantilla.
    for (const [id, s] of byId) {
      if (!defIds.has(id)) {
        byId.set(id, { ...s, orden: 1000 + (Number(s.orden) || 0) });
      }
    }
    const mergedSubs = [...byId.values()].sort(
      (a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'),
    );
    out[idx] = {
      ...actual,
      id: 'empleado',
      nombre: def.nombre,
      orden: def.orden,
      activo: true,
      fijo: true,
      flujo: 'egreso',
      subcategorias: mergedSubs,
    };
  }

  return out.sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

function empleadoNecesitaReparacion(cats, subs) {
  const emp = (cats || []).find((c) => String(c.id || '').toLowerCase() === 'empleado')
    || (cats || []).find((c) => esFilaCategoriaEmpleado(c));
  if (!emp) return true;
  if (emp.activo === false) return true;
  const catId = emp.id;
  const empSubs = (subs || []).filter((s) => s.categoria_id === catId);
  const def = plantillaCategoriaEmpleadoDefault();
  for (const sDef of def.subcategorias) {
    const row = empSubs.find((s) => s.id === sDef.id);
    if (!row || row.activo === false) return true;
  }
  return false;
}

/** Reactiva Empleado + tipos fijos en Supabase (o local). */
export async function repararCategoriaEmpleado(supabase) {
  const def = plantillaCategoriaEmpleadoDefault();
  if (!supabase) {
    const lista = asegurarCategoriaEmpleadoEnLista(leerLocal());
    guardarLocal(lista);
    return { ok: true, soloLocal: true };
  }
  const catRow = {
    id: def.id,
    nombre: def.nombre,
    orden: def.orden,
    activo: true,
    fijo: true,
    flujo: 'egreso',
  };
  let { error: e1 } = await supabase.from('cont_virtual_categorias').upsert(catRow, { onConflict: 'id' });
  if (e1 && String(e1.message || '').toLowerCase().includes('flujo')) {
    const { flujo: _f, ...sinFlujo } = catRow;
    ({ error: e1 } = await supabase.from('cont_virtual_categorias').upsert(sinFlujo, { onConflict: 'id' }));
  }
  if (e1 && faltaTabla(e1)) {
    const lista = asegurarCategoriaEmpleadoEnLista(leerLocal());
    guardarLocal(lista);
    return { ok: true, soloLocal: true, aviso: AVISO_FALTA_CONT_VIRTUAL };
  }
  if (e1) return { ok: false, error: e1.message };

  const subs = def.subcategorias.map((s) => ({
    id: s.id,
    categoria_id: def.id,
    nombre: s.nombre,
    orden: s.orden,
    activo: true,
    fijo: true,
  }));
  const { error: e2 } = await supabase.from('cont_virtual_subcategorias').upsert(subs, { onConflict: 'id' });
  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}

function asegurarIngresosEnLista(lista) {
  const out = (lista || []).map((c) => ({
    ...c,
    flujo: normalizarFlujoCatalogo(c.flujo || (String(c.id || '').startsWith('ing-') ? 'ingreso' : 'egreso')),
    subcategorias: (c.subcategorias || []).map((s) => ({
      ...s,
      detalles: (s.detalles || []).map((d) => ({ ...d })),
    })),
  }));
  const ids = new Set(out.map((c) => c.id));
  for (const c of CATEGORIAS_INGRESOS_CONT_VIRTUAL_DEFAULT) {
    if (!ids.has(c.id)) {
      out.push({
        ...c,
        flujo: 'ingreso',
        subcategorias: (c.subcategorias || []).map((s) => ({ ...s, detalles: [] })),
      });
    }
  }
  return out;
}

function leerLocal() {
  try {
    const raw = localStorage.getItem(LS_CAT);
    if (raw) {
      const j = JSON.parse(raw);
      if (Array.isArray(j) && j.length) {
        return asegurarCategoriaEmpleadoEnLista(asegurarIngresosEnLista(j));
      }
    }
  } catch {
    /* ignore */
  }
  return asegurarCategoriaEmpleadoEnLista(catalogoDefaultCompleto());
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
      flujo: normalizarFlujoCatalogo(c.flujo || (String(c.id || '').startsWith('ing-') ? 'ingreso' : 'egreso')),
      // Si la columna aún no existe / es null → true (comportamiento previo).
      en_catalogo_cortes: c.en_catalogo_cortes !== false,
      cortes_sucursales: normalizarCortesSucursales(c.cortes_sucursales),
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
      en_catalogo_cortes: s.en_catalogo_cortes !== false,
      cortes_sucursales: normalizarCortesSucursales(s.cortes_sucursales),
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
  const faltaSistema =
    !ids.has('cubre-turno')
    || !ids.has('taxis')
    || !ids.has('recargas')
    || !ids.has('anticipos')
    || !ids.has('faltante');
  const empRoto = empleadoNecesitaReparacion(cRes.data || [], sRes.data || []);

  if (faltaSistema || empRoto) {
    if (faltaSistema) await sembrarCatalogoDefault(supabase);
    else await repararCategoriaEmpleado(supabase);
    // Si faltaba sistema, el seed ya trae Empleado; si solo Empleado estaba roto, reparar.
    if (faltaSistema && empRoto) await repararCategoriaEmpleado(supabase);
    const [c2, s2, d2] = await Promise.all([
      supabase.from('cont_virtual_categorias').select('*').order('orden'),
      supabase.from('cont_virtual_subcategorias').select('*').order('orden'),
      supabase.from('cont_virtual_detalles').select('*').order('orden'),
    ]);
    if (!c2.error) {
      const det = d2.error && faltaTabla(d2.error) ? [] : (d2.data || []);
      const data = asegurarCategoriaEmpleadoEnLista(
        asegurarIngresosEnLista(armarCatalogo(c2.data, s2.data || [], det)),
      );
      guardarLocal(data);
      return { data, aviso: d2.error && faltaTabla(d2.error) ? AVISO_FALTA_CONT_VIRTUAL : undefined };
    }
  }
  const det = dRes.error && faltaTabla(dRes.error) ? [] : (dRes.data || []);
  const data = asegurarCategoriaEmpleadoEnLista(
    asegurarIngresosEnLista(armarCatalogo(cRes.data, sRes.data || [], det)),
  );
  guardarLocal(data);
  return {
    data,
    aviso: dRes.error && faltaTabla(dRes.error) ? AVISO_FALTA_CONT_VIRTUAL : undefined,
  };
}

export async function sembrarCatalogoDefault(supabase) {
  const defaults = catalogoDefaultCompleto();
  if (!supabase) {
    guardarLocal(defaults);
    return { ok: true, soloLocal: true };
  }
  const cats = defaults.map(({ id, nombre, orden, activo, fijo, flujo }) => ({
    id,
    nombre,
    orden,
    activo,
    fijo,
    flujo: normalizarFlujoCatalogo(flujo),
  }));
  const subs = [];
  for (const c of defaults) {
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
  let { error: e1 } = await supabase.from('cont_virtual_categorias').upsert(cats, { onConflict: 'id' });
  if (e1 && String(e1.message || '').toLowerCase().includes('flujo')) {
    const sinFlujo = cats.map(({ flujo: _f, ...rest }) => rest);
    ({ error: e1 } = await supabase.from('cont_virtual_categorias').upsert(sinFlujo, { onConflict: 'id' }));
  }
  if (e1 && faltaTabla(e1)) {
    guardarLocal(defaults);
    return { ok: true, soloLocal: true, aviso: AVISO_FALTA_CONT_VIRTUAL };
  }
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await supabase.from('cont_virtual_subcategorias').upsert(subs, { onConflict: 'id' });
  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}

export async function crearCategoriaContVirtual(supabase, { nombre, flujo = 'egreso', enCatalogoCortes } = {}) {
  const label = String(nombre || '').trim();
  if (!label) return { ok: false, error: 'Nombre obligatorio.' };
  const flujoN = normalizarFlujoCatalogo(flujo);
  const id = slug(flujoN === 'ingreso' ? `ing-${label}` : label, flujoN === 'ingreso' ? 'ing' : 'cat');
  // Nuevas cuentas: el admin decide si van a cortes (por defecto no).
  const enCortes = flujoN === 'ingreso'
    ? false
    : (enCatalogoCortes == null ? false : Boolean(enCatalogoCortes));
  if (!supabase) {
    const lista = leerLocal();
    if (lista.some((c) => c.id === id)) return { ok: false, error: 'Ya existe esa categoría.' };
    lista.push({
      id,
      nombre: label,
      orden: 100,
      activo: true,
      fijo: false,
      flujo: flujoN,
      en_catalogo_cortes: enCortes,
      subcategorias: [],
    });
    guardarLocal(lista);
    return { ok: true, id };
  }
  const row = {
    id,
    nombre: label,
    orden: 100,
    activo: true,
    fijo: false,
    flujo: flujoN,
    en_catalogo_cortes: enCortes,
  };
  let { error } = await supabase.from('cont_virtual_categorias').insert(row);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONT_VIRTUAL };
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('en_catalogo_cortes')) {
      const { en_catalogo_cortes: _e, ...sinFlag } = row;
      const retry = await supabase.from('cont_virtual_categorias').insert(sinFlag);
      if (!retry.error) {
        return {
          ok: true,
          id,
          aviso: 'Cuenta creada. Ejecuta supabase/fix_cont_virtual_en_catalogo_cortes.sql para el botón de cortes.',
        };
      }
      error = retry.error;
    }
    if (msg.includes('flujo') || String(error.message || '').toLowerCase().includes('flujo')) {
      const { flujo: _f, en_catalogo_cortes: _e, ...sinExtra } = row;
      const retry = await supabase.from('cont_virtual_categorias').insert(sinExtra);
      if (!retry.error) {
        return {
          ok: true,
          id,
          aviso: 'Categoría creada. Ejecuta los SQL de ingresos y en_catalogo_cortes en Supabase.',
        };
      }
      return { ok: false, error: retry.error.message };
    }
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
  if (String(id).toLowerCase() === 'empleado') {
    return {
      ok: false,
      error: 'La categoría Empleado no se renombra. Solo puedes editar sus tipos (Consumo, Anticipo…).',
    };
  }
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

/**
 * Admin: marca o quita una categoría de egreso del catálogo de gastos de cortes.
 * @param {string[]|null} [sucursales] null = todas las tiendas; lista = solo esas.
 */
export async function setCategoriaEnCatalogoCortes(supabase, id, enabled, { sucursales = null } = {}) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (String(id).toLowerCase() === 'empleado') {
    return { ok: false, error: 'Empleado siempre está en el catálogo de cortes.' };
  }
  const on = Boolean(enabled);
  const alcance = on ? normalizarCortesSucursales(sucursales) : null;
  if (!supabase) {
    const lista = leerLocal();
    const cat = lista.find((c) => c.id === id);
    if (!cat) return { ok: false, error: 'Categoría no encontrada.' };
    if (normalizarFlujoCatalogo(cat.flujo) === 'ingreso') {
      return { ok: false, error: 'Las cuentas de ingreso no van al catálogo de cortes.' };
    }
    cat.en_catalogo_cortes = on;
    cat.cortes_sucursales = alcance;
    guardarLocal(lista);
    return { ok: true, cortes_sucursales: alcance };
  }
  const patch = { en_catalogo_cortes: on, cortes_sucursales: alcance };
  let { error } = await supabase
    .from('cont_virtual_categorias')
    .update(patch)
    .eq('id', id);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('cortes_sucursales') || msg.includes('schema cache')) {
      // Columna de alcance aún no existe: guardar solo el flag.
      const retry = await supabase
        .from('cont_virtual_categorias')
        .update({ en_catalogo_cortes: on })
        .eq('id', id);
      if (!retry.error) {
        return {
          ok: true,
          aviso: AVISO_FALTA_CORTES_SUCURSALES,
          cortes_sucursales: null,
        };
      }
      error = retry.error;
    }
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONT_VIRTUAL };
    if (msg.includes('en_catalogo_cortes') || String(error.message || '').toLowerCase().includes('en_catalogo_cortes')) {
      return {
        ok: false,
        error: 'Falta la columna en_catalogo_cortes. Ejecuta supabase/fix_cont_virtual_en_catalogo_cortes.sql en Supabase.',
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, cortes_sucursales: alcance };
}

/**
 * Admin: marca o quita una subcategoría del catálogo de cortes.
 * @param {string[]|null} [sucursales] null = todas / hereda; lista = solo esas.
 */
export async function setSubcategoriaEnCatalogoCortes(supabase, id, enabled, { sucursales = null } = {}) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  const on = Boolean(enabled);
  const alcance = on ? normalizarCortesSucursales(sucursales) : null;
  if (!supabase) {
    const lista = leerLocal();
    let found = null;
    for (const c of lista) {
      const s = (c.subcategorias || []).find((x) => x.id === id);
      if (s) {
        found = s;
        break;
      }
    }
    if (!found) return { ok: false, error: 'Subcategoría no encontrada.' };
    found.en_catalogo_cortes = on;
    found.cortes_sucursales = alcance;
    guardarLocal(lista);
    return { ok: true, cortes_sucursales: alcance };
  }
  const patch = { en_catalogo_cortes: on, cortes_sucursales: alcance };
  let { error } = await supabase
    .from('cont_virtual_subcategorias')
    .update(patch)
    .eq('id', id);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('en_catalogo_cortes') || msg.includes('cortes_sucursales') || msg.includes('schema cache')) {
      return {
        ok: false,
        error: AVISO_FALTA_CORTES_SUCURSALES,
        aviso: AVISO_FALTA_CORTES_SUCURSALES,
      };
    }
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONT_VIRTUAL };
    return { ok: false, error: error.message };
  }
  return { ok: true, cortes_sucursales: alcance };
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

/** Elimina categoría. Las del sistema (fijo) solo se desactivan. Empleado no se puede quitar. */
export async function eliminarCategoriaContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (String(id).toLowerCase() === 'empleado') {
    return {
      ok: false,
      error: 'La categoría Empleado es del sistema (cortes / nómina) y no se puede eliminar.',
    };
  }
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
  const sid = String(id || '').toLowerCase();
  if (sid.startsWith('empleado-')) {
    return {
      ok: false,
      error: 'Los tipos de Empleado (Consumo, Anticipo, etc.) son del sistema y no se pueden eliminar.',
    };
  }
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
