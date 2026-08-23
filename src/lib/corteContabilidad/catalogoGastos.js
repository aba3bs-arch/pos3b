import {
  CATEGORIAS_CONT_VIRTUAL_DEFAULT,
  categoriaEnCatalogoCortes,
  subcategoriaEnCatalogoCortes,
  crearCategoriaContVirtual,
  crearSubcategoriaContVirtual,
  editarCategoriaContVirtual,
  eliminarCategoriaContVirtual,
  eliminarSubcategoriaContVirtual,
  listarCatalogoContVirtual,
  repararCategoriaEmpleado,
} from '../contVirtualCatalogo.js';
import { esCategoriaEmpleado } from '../catalogoEmpleadoGastos.js';

const LS_CAT = 'pos3b_corte_catalogo';

/** Catálogo compartido entre todas las sucursales (legado / proveedores Abarrotes). */
export const CATALOGO_GASTOS_GLOBAL = 'GLOBAL';

function lsKey(modulo) {
  return `${LS_CAT}_${modulo}_global`;
}

/** Categorías de proveedores solo en Corte Abarrotes (no se mueven a IE). */
export const DEFAULT_PROVEEDORES_ABARROTES = {
  categoria: 'PROVEEDORES',
  subcategorias: ['PAGO', 'MERCANCIA', 'OTROS'],
  fuente: 'proveedores',
};

const DEFAULTS = {
  virtual: [],
  abarrotes: [{ ...DEFAULT_PROVEEDORES_ABARROTES }],
  garage: [],
};

/** Solo cargos del empleado que restan en nómina: consumo, recargas, anticipos, faltante. */
export const CATEGORIAS_GASTO_NOMINA = [
  'EMPLEADO',
  'CONSUMO',
  'RECARGAS',
  'RECARGA',
  'ANTICIPOS',
  'ANTICIPO',
  'FALTANTE',
];

function textoGastoNorm(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Subtipos EMPLEADO / legacy que sí van a nómina. */
function subcuentaEnNomina(sub) {
  const s = textoGastoNorm(sub);
  if (!s) return false;
  return (
    s.includes('CONSUMO') ||
    s.includes('RECARG') ||
    s.includes('ANTICIPO') ||
    s.includes('FALTANTE')
  );
}

/** Gastos generados por el empleado (no CubreTurno, Taxi, Nómina empleado, otros). */
export function gastoDescuentaNomina(_modulo, categoria, subcategoria = '') {
  const cat = textoGastoNorm(categoria);
  const sub = textoGastoNorm(subcategoria);

  // Categorías legacy directas
  if (cat === 'CONSUMO' || cat.includes('CONSUMO')) return true;
  if (cat === 'RECARGAS' || cat === 'RECARGA' || cat.includes('RECARG')) return true;
  if (cat === 'ANTICIPOS' || cat === 'ANTICIPO' || cat.includes('ANTICIPO')) return true;
  if (cat === 'FALTANTE' || cat.includes('FALTANTE')) return true;

  // Árbol EMPLEADO: tipos de nómina; si aún no hay sub, igual se pide empleado en captura.
  if (cat === 'EMPLEADO' || cat.startsWith('EMPLEADO ')) {
    if (!sub) return true;
    return subcuentaEnNomina(sub);
  }

  // VALES u otros: mirar subcategoría
  if (subcuentaEnNomina(sub)) return true;

  return false;
}

export function gastoRequiereEmpleado(modulo, categoria, subcategoria = '') {
  return gastoDescuentaNomina(modulo, categoria, subcategoria);
}

export function esCategoriaProveedores(categoria) {
  const cat = String(categoria || '').trim().toUpperCase();
  return cat.includes('PROVEEDOR');
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
    fuente: r.fuente || 'legado',
    ieId: r.ieId || null,
  }));
}

/** CONSUMO primero para que el corte lo auto-seleccione al elegir EMPLEADO. */
function ordenarTiposEmpleadoCorte(tipos) {
  return [...tipos].sort((a, b) => {
    const an = String(a || '').toUpperCase();
    const bn = String(b || '').toUpperCase();
    const ac = an.includes('CONSUMO') ? 0 : 1;
    const bc = bn.includes('CONSUMO') ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return an.localeCompare(bn, 'es');
  });
}

/** Convierte catálogo IE (Virtual/Abarrotes, compartido) → formato de corte. */
export function catalogoIeAFormatoCorte(ieCats, fuente = 'ie_virtual', { sucursal = null } = {}) {
  const out = [];
  const vistos = new Set();
  for (const c of ieCats || []) {
    if (c?.activo === false) continue;
    const nomRaw = String(c.nombre || '').trim();
    const categoria = nomRaw.toUpperCase();
    if (!categoria || vistos.has(categoria)) continue;
    // Categoría Empleado: en corte las "subs" son los tipos (consumo, faltante…);
    // el empleado se elige en el select aparte (MAIN / tienda).
    const esEmp =
      String(c.id || '').toLowerCase() === 'empleado'
      || esCategoriaEmpleado(c)
      || categoria === 'EMPLEADO'
      || categoria.startsWith('EMPLEADO ');
    if (esEmp) {
      vistos.add(categoria);
      vistos.add('EMPLEADO');
      const plantilla = (c.subcategorias || []).filter((s) => s?.activo !== false && !s.es_empleado_vivo);
      const tipos = plantilla.length
        ? plantilla.map((s) => String(s.nombre || '').trim().toUpperCase()).filter(Boolean)
        : ['CONSUMO', 'ANTICIPO', 'CUBRE TURNOS', 'FALTANTE', 'NOMINA EMPLEADO', 'OTROS', 'RECARGAS'];
      out.push({
        id: c.id || 'empleado',
        ieId: c.id || 'empleado',
        categoria: 'EMPLEADO',
        subcategorias: ordenarTiposEmpleadoCorte([...new Set(tipos)]),
        fuente,
        es_categoria_empleado: true,
        en_catalogo_cortes: true,
      });
      continue;
    }
    // Solo cuentas que el admin marcó para el catálogo de cortes (y alcance de tienda).
    if (!categoriaEnCatalogoCortes(c, { sucursal })) continue;
    vistos.add(categoria);
    const subs = [];
    for (const s of c.subcategorias || []) {
      if (!subcategoriaEnCatalogoCortes(s, { sucursal, categoria: c })) continue;
      const subNom = String(s.nombre || '').trim().toUpperCase();
      if (!subNom) continue;
      const dets = (s.detalles || []).filter((d) => d?.activo !== false);
      if (dets.length) {
        for (const d of dets) {
          const detNom = String(d.nombre || '').trim().toUpperCase();
          if (detNom) subs.push(`${subNom} › ${detNom}`);
        }
      } else {
        subs.push(subNom);
      }
    }
    // Si la categoría está en cortes pero ninguna sub quedó, igual mostrar la categoría
    // con lista vacía (el cajero puede necesitar verla); o saltarla si no hay subs.
    if (!subs.length) continue;
    out.push({
      id: c.id,
      ieId: c.id,
      categoria,
      subcategorias: [...new Set(subs)],
      fuente,
      en_catalogo_cortes: true,
      cortes_sucursales: c.cortes_sucursales || null,
    });
  }
  return out;
}

function catalogoIeConFallback(ieData, fuente = 'ie_virtual', opts = {}) {
  const desdeIe = catalogoIeAFormatoCorte(ieData, fuente, opts);
  if (desdeIe.length) return desdeIe;
  return catalogoIeAFormatoCorte(CATEGORIAS_CONT_VIRTUAL_DEFAULT, fuente, opts);
}

async function listarDesdeNube(supabase, sucursalId, modulo) {
  return supabase
    .from('cortes_gasto_catalogo')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .eq('modulo', modulo)
    .order('categoria');
}

async function listarProveedoresAbarrotes(supabase) {
  if (!supabase) {
    const local = leerLocal('abarrotes').filter((r) => esCategoriaProveedores(r.categoria));
    return local.length ? mapRows(local) : [{ ...DEFAULT_PROVEEDORES_ABARROTES }];
  }

  const globalRes = await listarDesdeNube(supabase, CATALOGO_GASTOS_GLOBAL, 'abarrotes');
  const rows = !globalRes.error && globalRes.data?.length ? mapRows(globalRes.data) : [];
  const proveedores = rows
    .filter((r) => esCategoriaProveedores(r.categoria))
    .map((r) => ({ ...r, fuente: 'proveedores' }));

  if (proveedores.length) return proveedores;

  // Sembrar default de proveedores en catálogo global de abarrotes
  await guardarCategoriaGastoProveedor(
    supabase,
    DEFAULT_PROVEEDORES_ABARROTES.categoria,
    DEFAULT_PROVEEDORES_ABARROTES.subcategorias,
  );
  return [{ ...DEFAULT_PROVEEDORES_ABARROTES }];
}

async function guardarCategoriaGastoProveedor(supabase, categoria, subcategorias = []) {
  const cat = String(categoria || '').trim().toUpperCase();
  if (!cat) return { ok: false, error: 'Categoría vacía.' };
  const subs = (subcategorias || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);

  if (!supabase) {
    const lista = leerLocal('abarrotes').filter((x) => x.categoria !== cat);
    lista.push({ categoria: cat, subcategorias: subs, fuente: 'proveedores' });
    guardarLocal('abarrotes', lista);
    return { ok: true };
  }

  const { error } = await supabase.from('cortes_gasto_catalogo').upsert(
    {
      sucursal_id: CATALOGO_GASTOS_GLOBAL,
      modulo: 'abarrotes',
      categoria: cat,
      subcategorias: subs,
    },
    { onConflict: 'sucursal_id,modulo,categoria' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Catálogo de gastos del corte:
 * - Virtual / Garage → categorías y subcategorías de IE Virtual (compartido).
 * - Abarrotes → mismas categorías/subcategorías de IE Abarrotes (mismo catálogo IE)
 *   + categorías PROVEEDORES propias (no se migran a IE).
 */
export async function listarCatalogoGastos(supabase, sucursal, modulo) {
  const ieRes = await listarCatalogoContVirtual(supabase);
  const fuenteIe = modulo === 'abarrotes' ? 'ie_abarrotes' : 'ie_virtual';
  const optsSuc = { sucursal: sucursal || null };
  let desdeIe = catalogoIeConFallback(ieRes.data || [], fuenteIe, optsSuc);
  // Si Empleado no llegó al corte (catálogo roto / desactivado), reparar y reintentar.
  if (!desdeIe.some((c) => c.es_categoria_empleado || esCategoriaEmpleado(c))) {
    await repararCategoriaEmpleado(supabase);
    const ie2 = await listarCatalogoContVirtual(supabase);
    desdeIe = catalogoIeConFallback(ie2.data || [], fuenteIe, optsSuc);
  }

  if (modulo !== 'abarrotes') {
    return { data: desdeIe, fuente: fuenteIe, aviso: ieRes.aviso, error: ieRes.error };
  }

  // Proveedores: solo desde cortes_gasto_catalogo (no tocar / no mover a IE).
  const proveedores = await listarProveedoresAbarrotes(supabase);
  const catsIe = new Set(desdeIe.map((c) => c.categoria));
  const extraProv = (proveedores || [])
    .filter((p) => esCategoriaProveedores(p.categoria))
    .filter((p) => !catsIe.has(String(p.categoria || '').toUpperCase()))
    .map((p) => ({
      ...p,
      categoria: String(p.categoria || '').trim().toUpperCase(),
      subcategorias: (p.subcategorias || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean),
      fuente: 'proveedores',
    }));

  return {
    data: [...desdeIe, ...extraProv],
    fuente: 'ie_abarrotes+proveedores',
    aviso: ieRes.aviso,
    error: ieRes.error,
  };
}

function filaPorCategoria(lista, categoria) {
  const cat = String(categoria || '').trim().toUpperCase();
  return (lista || []).find((x) => String(x.categoria || '').toUpperCase() === cat) || null;
}

export async function guardarCategoriaGasto(supabase, sucursal, modulo, categoria, subcategorias = []) {
  const cat = String(categoria || '').trim().toUpperCase();
  if (!cat) return { ok: false, error: 'Categoría vacía.' };
  const subs = (subcategorias || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);

  if (modulo === 'abarrotes' && esCategoriaProveedores(cat)) {
    return guardarCategoriaGastoProveedor(supabase, cat, subs);
  }

  const actual = await listarCatalogoGastos(supabase, sucursal, modulo);
  const row = filaPorCategoria(actual.data, cat);
  if (row?.ieId) {
    const edit = await editarCategoriaContVirtual(supabase, row.ieId, { nombre: cat });
    if (!edit.ok) return edit;
    // Reemplazar subcategorías: crear faltantes
    const ie = await listarCatalogoContVirtual(supabase);
    const ieCat = (ie.data || []).find((c) => c.id === row.ieId);
    const existentes = new Set(
      (ieCat?.subcategorias || []).map((s) => String(s.nombre || '').trim().toUpperCase()),
    );
    for (const sub of subs) {
      if (!existentes.has(sub)) {
        const r = await crearSubcategoriaContVirtual(supabase, { categoriaId: row.ieId, nombre: sub });
        if (!r.ok) return r;
      }
    }
    return { ok: true };
  }

  const creada = await crearCategoriaContVirtual(supabase, { nombre: cat });
  if (!creada.ok) return creada;
  for (const sub of subs) {
    const r = await crearSubcategoriaContVirtual(supabase, { categoriaId: creada.id, nombre: sub });
    if (!r.ok) return r;
  }
  return { ok: true, id: creada.id };
}

export async function agregarSubcategoriaGasto(supabase, sucursal, modulo, categoria, subcategoria) {
  const res = await listarCatalogoGastos(supabase, sucursal, modulo);
  const cat = String(categoria || '').trim().toUpperCase();
  const sub = String(subcategoria || '').trim().toUpperCase();
  if (!cat || !sub) return { ok: false, error: 'Datos incompletos.' };
  const row = filaPorCategoria(res.data, cat);
  const subs = row ? [...new Set([...(row.subcategorias || []), sub])] : [sub];

  if (modulo === 'abarrotes' && esCategoriaProveedores(cat)) {
    return guardarCategoriaGastoProveedor(supabase, cat, subs);
  }

  if (row?.ieId) {
    return crearSubcategoriaContVirtual(supabase, { categoriaId: row.ieId, nombre: sub });
  }
  return guardarCategoriaGasto(supabase, sucursal, modulo, cat, subs);
}

export async function eliminarCategoriaGasto(supabase, sucursal, modulo, categoria) {
  const cat = String(categoria || '').trim().toUpperCase();
  const actual = await listarCatalogoGastos(supabase, sucursal, modulo);
  const row = filaPorCategoria(actual.data, cat);
  if (row?.es_categoria_empleado || esCategoriaEmpleado(row || { categoria: cat }) || cat === 'EMPLEADO') {
    return {
      ok: false,
      error: 'La categoría EMPLEADO es del sistema y no se puede eliminar. Usa «Editar tipos» solo para tipos de gasto.',
    };
  }

  if (modulo === 'abarrotes' && esCategoriaProveedores(cat)) {
    if (!supabase) {
      guardarLocal(
        'abarrotes',
        leerLocal('abarrotes').filter((x) => x.categoria !== cat),
      );
      return { ok: true };
    }
    const { error } = await supabase
      .from('cortes_gasto_catalogo')
      .delete()
      .eq('sucursal_id', CATALOGO_GASTOS_GLOBAL)
      .eq('modulo', 'abarrotes')
      .eq('categoria', cat);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (row?.ieId) {
    return eliminarCategoriaContVirtual(supabase, row.ieId);
  }
  return { ok: false, error: 'Categoría no encontrada en IE Virtual.' };
}

export async function renombrarCategoriaGasto(supabase, sucursal, modulo, categoriaVieja, categoriaNueva, subcategorias) {
  const vieja = String(categoriaVieja || '').trim().toUpperCase();
  const nueva = String(categoriaNueva || '').trim().toUpperCase();
  if (!vieja || !nueva) return { ok: false, error: 'Nombre de categoría inválido.' };

  if (modulo === 'abarrotes' && (esCategoriaProveedores(vieja) || esCategoriaProveedores(nueva))) {
    if (vieja !== nueva) {
      const del = await eliminarCategoriaGasto(supabase, sucursal, modulo, vieja);
      if (!del.ok) return del;
    }
    return guardarCategoriaGastoProveedor(supabase, nueva, subcategorias);
  }

  const actual = await listarCatalogoGastos(supabase, sucursal, modulo);
  const row = filaPorCategoria(actual.data, vieja);
  const esEmp = Boolean(
    row?.es_categoria_empleado || esCategoriaEmpleado(row || { categoria: vieja }) || vieja === 'EMPLEADO',
  );

  // EMPLEADO: no se renombra; solo se agregan tipos nuevos (los fijos no se borran).
  if (esEmp) {
    const ieId = row?.ieId || 'empleado';
    await repararCategoriaEmpleado(supabase);
    const want = new Set((subcategorias || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean));
    const after = await listarCatalogoContVirtual(supabase);
    const ieCat2 = (after.data || []).find((c) => c.id === ieId);
    const have = new Set((ieCat2?.subcategorias || []).map((s) => String(s.nombre || '').trim().toUpperCase()));
    for (const sub of want) {
      if (!have.has(sub)) {
        const r = await crearSubcategoriaContVirtual(supabase, { categoriaId: ieId, nombre: sub });
        if (!r.ok) return r;
      }
    }
    return { ok: true };
  }

  if (!row?.ieId) {
    return guardarCategoriaGasto(supabase, sucursal, modulo, nueva, subcategorias);
  }

  if (vieja !== nueva) {
    const edit = await editarCategoriaContVirtual(supabase, row.ieId, { nombre: nueva });
    if (!edit.ok) return edit;
  }

  const ie = await listarCatalogoContVirtual(supabase);
  const ieCat = (ie.data || []).find((c) => c.id === row.ieId);
  const want = new Set((subcategorias || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean));
  for (const s of ieCat?.subcategorias || []) {
    const nom = String(s.nombre || '').trim().toUpperCase();
    if (!want.has(nom) && !s.fijo) {
      await eliminarSubcategoriaContVirtual(supabase, s.id);
    }
  }
  const after = await listarCatalogoContVirtual(supabase);
  const ieCat2 = (after.data || []).find((c) => c.id === row.ieId);
  const have = new Set((ieCat2?.subcategorias || []).map((s) => String(s.nombre || '').trim().toUpperCase()));
  for (const sub of want) {
    if (!have.has(sub)) {
      const r = await crearSubcategoriaContVirtual(supabase, { categoriaId: row.ieId, nombre: sub });
      if (!r.ok) return r;
    }
  }
  return { ok: true };
}

export async function actualizarSubcategoriasGasto(supabase, sucursal, modulo, categoria, subcategorias) {
  return guardarCategoriaGasto(supabase, sucursal, modulo, categoria, subcategorias);
}

export async function eliminarSubcategoriaGasto(supabase, sucursal, modulo, categoria, subcategoria) {
  const res = await listarCatalogoGastos(supabase, sucursal, modulo);
  const cat = String(categoria || '').trim().toUpperCase();
  const sub = String(subcategoria || '').trim().toUpperCase();
  const row = filaPorCategoria(res.data, cat);
  if (!row) return { ok: false, error: 'Categoría no encontrada.' };

  if (modulo === 'abarrotes' && esCategoriaProveedores(cat)) {
    const subs = (row.subcategorias || []).filter((s) => s !== sub);
    return guardarCategoriaGastoProveedor(supabase, cat, subs);
  }

  if (row.ieId) {
    const ie = await listarCatalogoContVirtual(supabase);
    const ieCat = (ie.data || []).find((c) => c.id === row.ieId);
    const subRow = (ieCat?.subcategorias || []).find(
      (s) => String(s.nombre || '').trim().toUpperCase() === sub,
    );
    if (!subRow) return { ok: false, error: 'Subcategoría no encontrada.' };
    return eliminarSubcategoriaContVirtual(supabase, subRow.id);
  }

  const subs = (row.subcategorias || []).filter((s) => s !== sub);
  return guardarCategoriaGasto(supabase, sucursal, modulo, cat, subs);
}
