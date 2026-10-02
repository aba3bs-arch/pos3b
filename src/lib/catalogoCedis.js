/**
 * Catálogo visible en sucursal CEDIS (almacén).
 * Departamentos propios de CEDIS (base + extras), independientes del menú de tiendas.
 * No altera el catálogo global de tiendas: solo filtra/enlaza cuando la sesión opera en CEDIS.
 */

import { etiquetaDepartamento, normalizarDepartamento } from './departamentos.js';
import { esAlmacenCentral } from '../constants/sucursales.js';

export const PROVEEDOR_CEDIS_NOMBRE = 'CEDIS LAS 3B';

const LS_DEPTOS_CEDIS = 'pos3b_departamentos_cedis_extra';
const LS_DEPTOS_CEDIS_OCULTOS = 'pos3b_departamentos_cedis_ocultos';

/** Departamentos base del catálogo CEDIS (nombres de negocio / UI). */
export const DEPARTAMENTOS_CEDIS_UI = [
  'CIGARROS',
  'BLUNTWRAP',
  'ELECTRONICOS',
  'ABARROTES',
  'MEDICAMENTO',
  'ROPA',
];

/**
 * Valores reales (y alias) de `productos.cat` aceptados en el núcleo CEDIS.
 * En producción «electronicos» vive como CIGARRO_ELECTRONICO.
 */
const DEPTOS_CEDIS_CORE = new Set([
  'CIGARROS',
  'BLUNTWRAP',
  'ELECTRONICOS',
  'CIGARRO_ELECTRONICO',
  'ABARROTES',
  'MEDICAMENTO',
  'ROPA',
]);

/** UI «ELECTRONICOS» → valor canónico en BD. */
const CAT_UI_A_DB = {
  ELECTRONICOS: 'CIGARRO_ELECTRONICO',
};

const CAT_DB_A_UI = {
  CIGARRO_ELECTRONICO: 'ELECTRONICOS',
};

export const AVISO_FALTA_DEPTOS_CEDIS_SQL =
  'Ejecuta supabase/fix_departamentos_cedis.sql en Supabase para sincronizar departamentos CEDIS entre cajas.';

function faltaTablaDeptos(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_departamentos_cedis')
    || (msg.includes('schema cache') && msg.includes('departamento'))
  );
}

function leerExtrasCedisLocal() {
  try {
    const raw = localStorage.getItem(LS_DEPTOS_CEDIS);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizarDepartamento).filter(Boolean);
  } catch {
    return [];
  }
}

function escribirExtrasCedisLocal(lista) {
  const clean = [...new Set((lista || []).map(normalizarDepartamento).filter(Boolean))];
  localStorage.setItem(LS_DEPTOS_CEDIS, JSON.stringify(clean));
  return clean;
}

function leerOcultosCedisLocal() {
  try {
    const raw = localStorage.getItem(LS_DEPTOS_CEDIS_OCULTOS);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizarDepartamento).filter(Boolean);
  } catch {
    return [];
  }
}

function escribirOcultosCedisLocal(lista) {
  const clean = [...new Set((lista || []).map(normalizarDepartamento).filter(Boolean))];
  // Normalizar alias BD → UI
  const mapped = clean.map((c) => (c === 'CIGARRO_ELECTRONICO' ? 'ELECTRONICOS' : c));
  localStorage.setItem(LS_DEPTOS_CEDIS_OCULTOS, JSON.stringify([...new Set(mapped)]));
  return [...new Set(mapped)];
}

function codigoUiDeptoCedis(cat) {
  const n = normalizarDepartamento(cat);
  if (!n) return '';
  if (n === 'CIGARRO_ELECTRONICO') return 'ELECTRONICOS';
  return n;
}

function estaOcultoCedis(cat) {
  const ui = codigoUiDeptoCedis(cat);
  if (!ui) return false;
  const ocultos = leerOcultosCedisLocal();
  return ocultos.includes(ui);
}

/** Extras CEDIS solo en este dispositivo (y los que vengan de nube se fusionan al cargar). */
export function listarExtrasDepartamentosCedis() {
  return leerExtrasCedisLocal()
    .filter((d) => !estaOcultoCedis(d))
    .sort((a, b) => a.localeCompare(b, 'es'));
}

/** Departamentos quitados del menú CEDIS (siguen en tiendas / productos). */
export function listarDepartamentosOcultosCedis() {
  return leerOcultosCedisLocal().sort((a, b) => a.localeCompare(b, 'es'));
}

export function esProveedorCedisLas3b(nombreOrRow) {
  const nombre = typeof nombreOrRow === 'string' ? nombreOrRow : nombreOrRow?.nombre;
  return String(nombre || '').trim().toUpperCase() === PROVEEDOR_CEDIS_NOMBRE;
}

/** Valor de select UI a partir de cat en BD. */
export function departamentoCedisUiDesdeCat(cat) {
  const n = normalizarDepartamento(cat);
  if (!n) return '';
  if (CAT_DB_A_UI[n]) return CAT_DB_A_UI[n];
  const lista = listarDepartamentosCatalogoCedis();
  return lista.includes(n) ? n : n;
}

/** Valor a guardar en productos / proveedor_catalogo.cat. */
export function catCedisDesdeUi(deptoUi) {
  const n = normalizarDepartamento(deptoUi);
  return CAT_UI_A_DB[n] || n || 'GENERAL';
}

export function aplicaFiltroCatalogoCedis(sucursal) {
  return esAlmacenCentral(sucursal);
}

/** ¿Este cat pertenece al catálogo CEDIS (núcleo o extra creado en CEDIS)? */
export function esDepartamentoCatalogoCedis(cat) {
  const n = normalizarDepartamento(cat);
  if (!n) return false;
  if (estaOcultoCedis(n)) return false;
  if (DEPTOS_CEDIS_CORE.has(n)) return true;
  if (CAT_DB_A_UI[n] && DEPTOS_CEDIS_CORE.has(CAT_DB_A_UI[n])) return true;
  const extras = leerExtrasCedisLocal();
  return extras.includes(n) || extras.includes(CAT_DB_A_UI[n] || '');
}

/** Coincide filtro UI (ELECTRONICOS) con cat real (CIGARRO_ELECTRONICO). */
export function departamentoFiltroCoincideCedis(catProducto, deptoFiltro) {
  const f = normalizarDepartamento(deptoFiltro);
  if (!f) return true;
  const c = normalizarDepartamento(catProducto);
  if (f === 'ELECTRONICOS') return c === 'ELECTRONICOS' || c === 'CIGARRO_ELECTRONICO';
  return c === f || c === catCedisDesdeUi(f);
}

/**
 * Lista de departamentos del catálogo CEDIS (UI).
 * Base + extras locales + (opcional) cats presentes en inventario que ya son CEDIS.
 */
export function listarDepartamentosCatalogoCedis(inventario = null) {
  const seen = new Set();
  const out = [];
  const add = (d) => {
    const n = normalizarDepartamento(d);
    if (!n || seen.has(n)) return;
    // No listar el alias BD si ya está el UI
    if (n === 'CIGARRO_ELECTRONICO') {
      add('ELECTRONICOS');
      return;
    }
    if (estaOcultoCedis(n)) return;
    seen.add(n);
    out.push(n);
  };
  for (const d of DEPARTAMENTOS_CEDIS_UI) add(d);
  for (const d of leerExtrasCedisLocal()) add(d);
  if (Array.isArray(inventario)) {
    for (const p of inventario) {
      if (esDepartamentoCatalogoCedis(p?.cat)) add(departamentoCedisUiDesdeCat(p.cat) || p.cat);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Crea un departamento solo para CEDIS (no se agrega al menú global de tiendas).
 * Persiste en localStorage y, si hay tabla, en la nube.
 */
export async function agregarDepartamentoCatalogoCedis(raw, supabase = null) {
  const codigo = normalizarDepartamento(raw);
  if (!codigo) return { ok: false, error: 'Escribe un nombre de departamento.' };
  if (codigo.length > 32) return { ok: false, error: 'Máximo 32 caracteres.' };
  if (codigo === 'FAVORITOS' || codigo === 'GENERAL') {
    return { ok: false, error: 'Ese nombre está reservado.' };
  }

  const actuales = listarDepartamentosCatalogoCedis();
  if (actuales.includes(codigo) || codigo === 'CIGARRO_ELECTRONICO') {
    return { ok: false, error: 'Ese departamento ya existe en CEDIS.' };
  }

  // Si estaba oculto, restaurarlo (también sirve como “volver a agregar”).
  if (estaOcultoCedis(codigo)) {
    escribirOcultosCedisLocal(leerOcultosCedisLocal().filter((d) => d !== codigo));
  }

  const extras = leerExtrasCedisLocal();
  if (!DEPARTAMENTOS_CEDIS_UI.includes(codigo) && !extras.includes(codigo)) {
    extras.push(codigo);
    escribirExtrasCedisLocal(extras);
  }

  let aviso = null;
  if (supabase) {
    try {
      const { error } = await supabase.from('pos_departamentos_cedis').upsert(
        {
          codigo,
          etiqueta: etiquetaDepartamento(codigo),
          activo: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'codigo' },
      );
      if (error) {
        if (faltaTablaDeptos(error)) aviso = AVISO_FALTA_DEPTOS_CEDIS_SQL;
        else aviso = error.message;
      }
    } catch (e) {
      aviso = e?.message || String(e);
    }
  }

  return { ok: true, codigo, aviso };
}

/**
 * Quita un departamento del menú CEDIS (base o extra).
 * NO borra productos ni afecta el menú de tiendas.
 * @param {string} raw
 * @param {object|null} supabase
 * @param {{ inventario?: Array }} [opts]
 */
export async function ocultarDepartamentoCatalogoCedis(raw, supabase = null, opts = {}) {
  const codigo = codigoUiDeptoCedis(raw);
  if (!codigo) return { ok: false, error: 'Departamento inválido.' };
  if (codigo === 'FAVORITOS' || codigo === 'GENERAL') {
    return { ok: false, error: 'Ese nombre está reservado.' };
  }

  const visibles = listarDepartamentosCatalogoCedis();
  if (!visibles.includes(codigo) && !DEPARTAMENTOS_CEDIS_UI.includes(codigo) && !leerExtrasCedisLocal().includes(codigo)) {
    return { ok: false, error: 'Ese departamento no está en el catálogo CEDIS.' };
  }

  const inv = Array.isArray(opts.inventario) ? opts.inventario : [];
  const conProductos = inv.filter((p) => departamentoFiltroCoincideCedis(p?.cat, codigo)).length;

  const ocultos = leerOcultosCedisLocal();
  if (!ocultos.includes(codigo)) {
    ocultos.push(codigo);
    escribirOcultosCedisLocal(ocultos);
  }
  // Si era extra, quitarlo de extras activos
  escribirExtrasCedisLocal(leerExtrasCedisLocal().filter((d) => d !== codigo));

  let aviso = null;
  if (supabase) {
    try {
      const { error } = await supabase.from('pos_departamentos_cedis').upsert(
        {
          codigo,
          etiqueta: etiquetaDepartamento(codigo),
          activo: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'codigo' },
      );
      if (error) {
        if (faltaTablaDeptos(error)) aviso = AVISO_FALTA_DEPTOS_CEDIS_SQL;
        else aviso = error.message;
      }
    } catch (e) {
      aviso = e?.message || String(e);
    }
  }

  return {
    ok: true,
    codigo,
    productosAfectados: conProductos,
    aviso,
  };
}

/**
 * Vuelve a mostrar un departamento en CEDIS (no toca tiendas).
 */
export async function restaurarDepartamentoCatalogoCedis(raw, supabase = null) {
  const codigo = codigoUiDeptoCedis(raw);
  if (!codigo) return { ok: false, error: 'Departamento inválido.' };

  escribirOcultosCedisLocal(leerOcultosCedisLocal().filter((d) => d !== codigo));

  // Si no es base, vuelve como extra
  if (!DEPARTAMENTOS_CEDIS_UI.includes(codigo)) {
    const extras = leerExtrasCedisLocal();
    if (!extras.includes(codigo)) {
      extras.push(codigo);
      escribirExtrasCedisLocal(extras);
    }
  }

  let aviso = null;
  if (supabase) {
    try {
      const { error } = await supabase.from('pos_departamentos_cedis').upsert(
        {
          codigo,
          etiqueta: etiquetaDepartamento(codigo),
          activo: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'codigo' },
      );
      if (error) {
        if (faltaTablaDeptos(error)) aviso = AVISO_FALTA_DEPTOS_CEDIS_SQL;
        else aviso = error.message;
      }
    } catch (e) {
      aviso = e?.message || String(e);
    }
  }

  return { ok: true, codigo, aviso };
}

/**
 * Carga extras y ocultos desde la nube y los fusiona con local.
 * Los de la semilla (base) no se duplican como “extra”.
 */
export async function sincronizarDepartamentosCatalogoCedis(supabase) {
  if (!supabase) {
    return {
      ok: true,
      extras: listarExtrasDepartamentosCedis(),
      ocultos: listarDepartamentosOcultosCedis(),
      aviso: null,
    };
  }
  try {
    const { data, error } = await supabase
      .from('pos_departamentos_cedis')
      .select('codigo, activo')
      .limit(500);
    if (error) {
      if (faltaTablaDeptos(error)) {
        return {
          ok: true,
          extras: listarExtrasDepartamentosCedis(),
          ocultos: listarDepartamentosOcultosCedis(),
          aviso: AVISO_FALTA_DEPTOS_CEDIS_SQL,
        };
      }
      return {
        ok: false,
        error: error.message,
        extras: listarExtrasDepartamentosCedis(),
        ocultos: listarDepartamentosOcultosCedis(),
      };
    }
    const base = new Set(DEPARTAMENTOS_CEDIS_UI);
    const extrasNube = [];
    const inactivos = new Set();
    const activosNube = new Set();
    for (const r of data || []) {
      const c = codigoUiDeptoCedis(r.codigo);
      if (!c) continue;
      if (r.activo === false) inactivos.add(c);
      else {
        activosNube.add(c);
        if (!base.has(c)) extrasNube.push(c);
      }
    }
    const ocultosMerged = new Set([...leerOcultosCedisLocal(), ...inactivos]);
    for (const c of activosNube) ocultosMerged.delete(c);
    const ocultosArr = [...ocultosMerged];
    escribirOcultosCedisLocal(ocultosArr);
    const extrasMerged = [...new Set([...leerExtrasCedisLocal(), ...extrasNube])]
      .filter((c) => !ocultosMerged.has(c));
    escribirExtrasCedisLocal(extrasMerged);
    return {
      ok: true,
      extras: extrasMerged.sort((a, b) => a.localeCompare(b, 'es')),
      ocultos: ocultosArr.sort((a, b) => a.localeCompare(b, 'es')),
      aviso: null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      extras: listarExtrasDepartamentosCedis(),
      ocultos: listarDepartamentosOcultosCedis(),
    };
  }
}

/**
 * Filtra inventario para la vista CEDIS.
 * @param {Array} inventario
 * @param {{ idsProveedorCedis?: Set<string>|null, exigirProveedor?: boolean }} opts
 */
export function filtrarInventarioCatalogoCedis(inventario, opts = {}) {
  const { idsProveedorCedis = null, exigirProveedor = true } = opts;
  let list = (inventario || []).filter((p) => esDepartamentoCatalogoCedis(p.cat));
  if (exigirProveedor && idsProveedorCedis) {
    list = list.filter((p) => idsProveedorCedis.has(String(p.id)));
  }
  return list;
}

export async function buscarProveedorCedisLas3b(supabase) {
  if (!supabase) return null;
  const nombre = PROVEEDOR_CEDIS_NOMBRE;
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre')
    .ilike('nombre', nombre)
    .limit(5);
  if (error) return { error: error.message };
  const exact = (data || []).find((p) => String(p.nombre || '').trim().toUpperCase() === nombre);
  const row = exact || (data || [])[0] || null;
  return { proveedor: row };
}

/**
 * Inserta vínculos faltantes producto ↔ CEDIS LAS 3B para los deptos del catálogo CEDIS.
 * No borra vínculos con otros proveedores ni modifica filas de `productos`.
 */
export async function asegurarVinculosCatalogoCedis(supabase, inventario = []) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const found = await buscarProveedorCedisLas3b(supabase);
  if (found?.error) return { ok: false, error: found.error };
  const proveedor = found?.proveedor;
  if (!proveedor?.id) {
    return { ok: false, error: `No existe el proveedor «${PROVEEDOR_CEDIS_NOMBRE}». Créalo en Proveedores.` };
  }

  const candidatos = (inventario || [])
    .filter((p) => esDepartamentoCatalogoCedis(p.cat))
    .map((p) => String(p.id))
    .filter(Boolean);
  if (!candidatos.length) {
    return { ok: true, proveedorId: proveedor.id, vinculados: 0, yaEstaban: 0 };
  }

  const { data: existentes, error: eEx } = await supabase
    .from('proveedor_producto')
    .select('producto_id')
    .eq('proveedor_id', proveedor.id)
    .limit(20000);
  if (eEx) return { ok: false, error: eEx.message };

  const ya = new Set((existentes || []).map((r) => String(r.producto_id)));
  const faltan = candidatos.filter((id) => !ya.has(id));
  if (!faltan.length) {
    return { ok: true, proveedorId: proveedor.id, vinculados: 0, yaEstaban: ya.size };
  }

  const rows = faltan.map((producto_id) => ({
    proveedor_id: proveedor.id,
    producto_id,
    sku_proveedor: null,
  }));

  const chunk = 200;
  let insertados = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from('proveedor_producto').insert(slice);
    if (error) return { ok: false, error: error.message, vinculados: insertados };
    insertados += slice.length;
  }

  return {
    ok: true,
    proveedorId: proveedor.id,
    vinculados: insertados,
    yaEstaban: ya.size,
  };
}
