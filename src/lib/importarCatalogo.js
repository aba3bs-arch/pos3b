import * as XLSX from 'xlsx';
import { round2, sinImpuesto, conImpuesto, gananciaDesdePrecios, IVA_DEFAULT, GANANCIA_DEFAULT, impuestoEfectivo, gananciaEfectiva, precioConsumidor, precioVentaConDesdeCompra, mensajeErrorColumnasProducto } from './productoForm.js';
import { buildPatchStockTienda } from './inventarioMultitienda.js';

/** Columnas oficiales de la plantilla Excel/CSV para catálogo. */
export const COLUMNAS_CATALOGO = [
  { key: 'codigo', label: 'codigo', required: true, desc: 'Código de barras / SKU (único)' },
  { key: 'nombre', label: 'nombre', required: true, desc: 'Nombre del producto' },
  { key: 'descripcion', label: 'descripcion', required: false, desc: 'Descripción larga' },
  { key: 'categoria', label: 'categoria', required: false, desc: 'Departamento (GENERAL, BEBIDAS…)' },
  { key: 'clave_sat', label: 'clave_sat', required: false, desc: 'Clave SAT facturación' },
  { key: 'impuesto', label: 'impuesto', required: false, desc: 'IVA % (default 8)' },
  { key: 'precio_compra_sin', label: 'precio_compra_sin', required: false, desc: 'Costo compra sin IVA' },
  { key: 'precio_compra_con', label: 'precio_compra_con', required: false, desc: 'Costo compra con IVA' },
  { key: 'ganancia_pct', label: 'ganancia_pct', required: false, desc: 'Margen % sobre costo (default 30)' },
  { key: 'precio_venta', label: 'precio_venta', required: false, desc: 'Precio venta al público (con IVA)' },
  { key: 'stock_piso', label: 'stock_piso', required: false, desc: 'Unidades en piso de venta (tienda activa)' },
  { key: 'stock_cedis', label: 'stock_cedis', required: false, desc: 'Unidades en CEDIS central (almacén MAIN, único de la empresa)' },
  { key: 'stock_minimo', label: 'stock_minimo', required: false, desc: 'Mínimo para alertas (default 6)' },
  { key: 'en_venta', label: 'en_venta', required: false, desc: 'si/no — visible en Ventas' },
  { key: 'en_favoritos', label: 'en_favoritos', required: false, desc: 'si/no — botón rápido en Ventas' },
  { key: 'proveedor', label: 'proveedor', required: false, desc: 'Nombre del proveedor (se crea si no existe y se vincula)' },
  { key: 'sku_proveedor', label: 'sku_proveedor', required: false, desc: 'SKU / clave del proveedor' },
];

export const PLANTILLA_COLUMNAS = COLUMNAS_CATALOGO.map((c) => c.label).join(',');

const ALIAS = {
  codigo: ['codigo', 'código', 'code', 'id', 'barras', 'barcode', 'sku', 'clave', 'ean', 'upc'],
  nombre: ['nombre', 'descripcion_corta', 'producto', 'articulo', 'artículo', 'item'],
  descripcion: ['descripcion', 'descripción', 'desc', 'detalle'],
  // Nota: en plantilla POS, departamento ≈ categoría. En SICAR, departamento = proveedor (se remapea aparte).
  categoria: ['categoria', 'categoría', 'cat', 'departamento', 'depto', 'dept'],
  clave_sat: ['clave_sat', 'sat', 'clave sat'],
  impuesto: ['impuesto', 'iva', 'tax'],
  precio_compra_sin: ['precio_compra_sin', 'costo_sin', 'compra_sin', 'costo_sin_iva'],
  precio_compra_con: ['precio_compra_con', 'costo_con', 'compra_con', 'costo'],
  ganancia_pct: ['ganancia_pct', 'ganancia', 'margen', 'margen_pct', 'utilidad_pct'],
  precio_venta: ['precio_venta', 'precio', 'price', 'pvp', 'precio_publico', 'precio1', 'precio_1'],
  stock_piso: ['stock_piso', 'stock', 'inventario', 'existencia', 'piso', 'cantidad', 'qty'],
  stock_cedis: ['stock_cedis', 'cedis', 'bodega', 'almacen'],
  stock_minimo: ['stock_minimo', 'stock minimo', 'stock_mínimo', 'minimo', 'mínimo', 'min', 'min_stock', 'inv_min'],
  en_venta: ['en_venta', 'venta', 'activo', 'disponible'],
  en_favoritos: ['en_favoritos', 'favorito', 'favoritos', 'destacado', '(s/n) favorito'],
  proveedor: ['proveedor', 'proveedores', 'supplier', 'distribuidor', 'vendor', 'casa', 'marca_proveedor'],
  sku_proveedor: ['sku_proveedor', 'sku_prov', 'clave_proveedor', 'codigo_proveedor', 'cod_proveedor'],
};

/** Detecta plantilla SICAR (CODIGO/NOMBRE/departamento/precio1/costo). */
export function esPlantillaSicar(rowOrHeaders) {
  const keys = Array.isArray(rowOrHeaders)
    ? rowOrHeaders.map((h) => normKey(h))
    : Object.keys(rowOrHeaders || {}).map((h) => normKey(h));
  const set = new Set(keys);
  const tieneCodigo = set.has('codigo');
  const tieneNombre = set.has('nombre');
  const tieneDepto = set.has('departamento');
  const tienePrecio1 = set.has('precio1') || set.has('precio_1');
  const tieneCosto = set.has('costo');
  const tieneFlagIva = [...set].some((k) => k.includes('imp_iva') || k.includes('iva_16') || k.includes('iva_8'));
  return tieneCodigo && tieneNombre && tieneDepto && (tienePrecio1 || tieneCosto) && (tieneFlagIva || tienePrecio1);
}

function valorRawPorClave(row, predicado) {
  for (const k of Object.keys(row || {})) {
    if (predicado(normKey(k))) {
      const v = row[k];
      if (v != null && String(v).trim() !== '') return v;
    }
  }
  return '';
}

/** Convierte una fila SICAR al shape que espera filaAProducto. */
export function normalizarFilaSicar(row) {
  const iva16 = parseBool(valorRawPorClave(row, (k) => k.includes('iva') && k.includes('16')), false);
  const iva8 = parseBool(valorRawPorClave(row, (k) => k.includes('iva') && k.includes('8')), false);
  let impuesto = IVA_DEFAULT;
  if (iva16) impuesto = 16;
  else if (iva8) impuesto = 8;

  const depto = String(valorRawPorClave(row, (k) => k === 'departamento') || '').trim();
  const catSicar = String(valorRawPorClave(row, (k) => k === 'categoria' || k === 'categoria') || '').trim();
  // En SICAR el "departamento" es la marca/proveedor; la categoría suele ser C1/C2…
  const catPos = depto
    ? depto.toUpperCase().replace(/\s+/g, '_')
    : catSicar && !/^c\d+$/i.test(catSicar)
      ? catSicar.toUpperCase()
      : 'GENERAL';

  return {
    codigo: valorCampo(row, 'codigo') || valorRawPorClave(row, (k) => k === 'codigo'),
    nombre: valorCampo(row, 'nombre') || valorRawPorClave(row, (k) => k === 'nombre'),
    descripcion: '',
    categoria: catPos,
    clave_sat: valorCampo(row, 'clave_sat') || valorRawPorClave(row, (k) => k.includes('clave') && k.includes('sat')),
    impuesto,
    // SICAR: costo y precio1 vienen con impuestos (flag "(s/n) precio con impuestos" = s)
    precio_compra_con: valorCampo(row, 'precio_compra_con') || valorRawPorClave(row, (k) => k === 'costo'),
    precio_venta: valorCampo(row, 'precio_venta') || valorRawPorClave(row, (k) => k === 'precio1' || k === 'precio_1'),
    stock_piso: valorCampo(row, 'stock_piso') || valorRawPorClave(row, (k) => k === 'existencia'),
    stock_minimo: valorCampo(row, 'stock_minimo') || valorRawPorClave(row, (k) => k === 'inv_min'),
    en_favoritos: valorCampo(row, 'en_favoritos') || valorRawPorClave(row, (k) => k.includes('favorito')),
    en_venta: 'si',
    proveedor: depto,
    sku_proveedor: '',
  };
}

function normKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function valorCampo(row, campo) {
  const keys = Object.keys(row || {});
  const buscados = new Set([normKey(campo), ...(ALIAS[campo] || []).map((a) => normKey(a))]);
  for (const k of keys) {
    if (buscados.has(normKey(k))) {
      const v = row[k];
      if (v != null && String(v).trim() !== '') return v;
    }
  }
  return '';
}

function parseBool(v, defaultVal = true) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return defaultVal;
  // SICAR usa s/n
  if (['1', 'si', 'sí', 'yes', 'true', 'verdadero', 'x', 's'].includes(s)) return true;
  if (['0', 'no', 'false', 'falso', 'n'].includes(s)) return false;
  return defaultVal;
}

function normalizarCodigoImport(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    if (Number.isSafeInteger(v)) return String(v);
    const red = Math.round(v);
    if (Math.abs(v - red) < 1e-6) return String(red);
  }
  let s = String(v).trim();
  if (/e[+-]/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n));
  }
  if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
  return s;
}

export function filaAProducto(row) {
  const id = normalizarCodigoImport(valorCampo(row, 'codigo'));
  const nombre = String(valorCampo(row, 'nombre') || '').trim();
  if (!id || !nombre) return null;

  const impRaw = valorCampo(row, 'impuesto');
  // En importación se respeta 0 / 8 / 16 del archivo (SICAR marca IVA real).
  // No usar impuestoEfectivo aquí: ese remapea 16→8 por datos legacy del POS.
  const impuesto =
    impRaw !== '' && impRaw != null && Number.isFinite(Number(impRaw))
      ? Math.max(0, Number(impRaw))
      : IVA_DEFAULT;
  let compraSin = Number(valorCampo(row, 'precio_compra_sin')) || 0;
  let compraCon = Number(valorCampo(row, 'precio_compra_con')) || 0;
  if (compraSin <= 0 && compraCon > 0) compraSin = sinImpuesto(compraCon, impuesto);
  if (compraCon <= 0 && compraSin > 0) compraCon = conImpuesto(compraSin, impuesto);

  let precioVenta = Number(valorCampo(row, 'precio_venta')) || 0;
  let ganancia = valorCampo(row, 'ganancia_pct') !== '' ? Number(valorCampo(row, 'ganancia_pct')) : null;
  ganancia = gananciaEfectiva(ganancia);
  if (!precioVenta && compraSin > 0) {
    precioVenta = precioVentaConDesdeCompra(compraSin, ganancia, impuesto);
  } else if (precioVenta) {
    precioVenta = precioConsumidor(precioVenta);
  }
  if (compraSin > 0 && precioVenta > 0 && valorCampo(row, 'ganancia_pct') === '') {
    ganancia = gananciaDesdePrecios(compraSin, sinImpuesto(precioVenta, impuesto));
  }

  return {
    id,
    nombre,
    descripcion: String(valorCampo(row, 'descripcion') || '').trim() || null,
    cat: String(valorCampo(row, 'categoria') || 'GENERAL')
      .trim()
      .toUpperCase() || 'GENERAL',
    clave_sat: String(valorCampo(row, 'clave_sat') || '').trim() || null,
    impuesto,
    precio_compra_sin: round2(compraSin),
    precio_compra_con: round2(compraCon),
    costo: round2(compraCon),
    ganancia_pct: round2(ganancia),
    precio_venta_sin: round2(sinImpuesto(precioVenta, impuesto)),
    precio: precioVenta,
    stock_piso: Math.max(0, parseInt(String(valorCampo(row, 'stock_piso') || '0'), 10) || 0),
    stock_cedis: Math.max(0, parseInt(String(valorCampo(row, 'stock_cedis') || '0'), 10) || 0),
    stock_minimo: Math.max(0, parseInt(String(valorCampo(row, 'stock_minimo') || '6'), 10) || 6),
    en_venta: parseBool(valorCampo(row, 'en_venta'), true),
    en_favoritos: parseBool(valorCampo(row, 'en_favoritos'), false),
    proveedor: String(valorCampo(row, 'proveedor') || '').trim(),
    sku_proveedor: String(valorCampo(row, 'sku_proveedor') || '').trim() || null,
  };
}

/** Normaliza nombre de proveedor para comparar (sin acentos, mayúsculas). */
export function normalizarNombreProveedor(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Lista proveedores únicos presentes en filas de importación. */
export function listarProveedoresEnFilas(filas) {
  const map = new Map();
  for (const f of filas || []) {
    const nombre = String(f?.proveedor || '').trim();
    if (!nombre) continue;
    const key = normalizarNombreProveedor(nombre);
    if (!map.has(key)) map.set(key, { nombre, count: 0 });
    map.get(key).count += 1;
  }
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function filtrarFilasPorProveedores(filas, nombresSeleccionados) {
  const list = filas || [];
  if (!nombresSeleccionados || !nombresSeleccionados.length) return list;
  const set = new Set(nombresSeleccionados.map(normalizarNombreProveedor));
  return list.filter((f) => {
    const p = String(f?.proveedor || '').trim();
    if (!p) return false;
    return set.has(normalizarNombreProveedor(p));
  });
}

async function asegurarProveedoresPorNombre(supabase, nombres) {
  const unicos = [...new Set((nombres || []).map((n) => String(n || '').trim()).filter(Boolean))];
  if (!unicos.length) return { ok: true, porNombre: new Map(), creados: 0 };

  const { data: existentes, error } = await supabase.from('proveedores').select('id, nombre');
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('relation') || error.code === '42P01') {
      return { ok: false, error: 'Falta la tabla proveedores. Ejecuta supabase/schema.sql o migracion_completa.sql.' };
    }
    return { ok: false, error: error.message };
  }

  const porNombre = new Map();
  for (const p of existentes || []) {
    const key = normalizarNombreProveedor(p.nombre);
    if (key && !porNombre.has(key)) porNombre.set(key, p.id);
  }

  let creados = 0;
  for (const nombre of unicos) {
    const key = normalizarNombreProveedor(nombre);
    if (porNombre.has(key)) continue;
    const { data, error: errIns } = await supabase.from('proveedores').insert([{ nombre }]).select('id, nombre').maybeSingle();
    if (errIns) {
      // Carrera / duplicado: reintentar lectura
      const { data: otra } = await supabase.from('proveedores').select('id, nombre').ilike('nombre', nombre).limit(1);
      const hit = (otra || []).find((x) => normalizarNombreProveedor(x.nombre) === key);
      if (hit) {
        porNombre.set(key, hit.id);
        continue;
      }
      return { ok: false, error: `No se pudo crear proveedor «${nombre}»: ${errIns.message}` };
    }
    if (data?.id) {
      porNombre.set(key, data.id);
      creados += 1;
    }
  }

  return { ok: true, porNombre, creados };
}

async function vincularProductosProveedor(supabase, vinculos) {
  if (!vinculos?.length) return { ok: true, vinculados: 0, errores: [] };
  const errores = [];
  let vinculados = 0;
  const BATCH = 40;

  for (let i = 0; i < vinculos.length; i += BATCH) {
    const chunk = vinculos.slice(i, i + BATCH);
    const { error } = await supabase.from('proveedor_producto').upsert(chunk, {
      onConflict: 'proveedor_id,producto_id',
      ignoreDuplicates: true,
    });
    if (error) {
      // Fallback fila a fila si upsert con constraint no está disponible
      for (const v of chunk) {
        const { data: existe } = await supabase
          .from('proveedor_producto')
          .select('id')
          .eq('proveedor_id', v.proveedor_id)
          .eq('producto_id', v.producto_id)
          .maybeSingle();
        if (existe?.id) {
          if (v.sku_proveedor) {
            await supabase.from('proveedor_producto').update({ sku_proveedor: v.sku_proveedor }).eq('id', existe.id);
          }
          vinculados += 1;
          continue;
        }
        const { error: e2 } = await supabase.from('proveedor_producto').insert([v]);
        if (e2) {
          if (e2.code === '23505') vinculados += 1;
          else errores.push(`${v.producto_id}: ${e2.message}`);
        } else {
          vinculados += 1;
        }
      }
      continue;
    }
    vinculados += chunk.length;
  }

  return { ok: errores.length === 0, vinculados, errores };
}

export function parsearFilasCrudas(rows) {
  const list = rows || [];
  if (!list.length) return [];
  const sicar = esPlantillaSicar(list[0]);
  return list
    .map((row) => filaAProducto(sicar ? normalizarFilaSicar(row) : row))
    .filter(Boolean);
}

/** Convierte hoja Excel a filas, detectando encabezados aunque no estén en fila 1. */
function hojaExcelAFilas(sheet) {
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (!matrix.length) return [];

  const esFilaEncabezado = (row) =>
    (row || []).some((c) => {
      const nk = normKey(c);
      return nk === 'codigo' || nk === 'sku' || nk === 'barras' || nk === 'code' || nk === 'ean';
    });

  let headerIdx = matrix.findIndex(esFilaEncabezado);
  if (headerIdx < 0) {
    // Sin encabezados: asumir orden de plantilla oficial
    return matrix
      .filter((row) => row?.some((c) => String(c ?? '').trim() !== ''))
      .map((row) => {
        const obj = {};
        COLUMNAS_CATALOGO.forEach((col, i) => {
          obj[col.label] = row[i] ?? '';
        });
        return obj;
      });
  }

  const headers = (matrix[headerIdx] || []).map((h) => String(h ?? '').trim());
  // SICAR: no mapear "departamento" a categoría genérica; se trata en normalizarFilaSicar
  return matrix.slice(headerIdx + 1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i] ?? '';
    });
    return obj;
  });
}

function resultadoLectura(filas, origen) {
  if (!filas.length) {
    return {
      ok: false,
      error:
        'No se encontraron productos válidos. La primera columna debe ser codigo y la segunda nombre. Usa la plantilla del botón "Plantilla Excel" o revisa que no haya filas vacías.',
    };
  }
  return { ok: true, filas, origen };
}

function parsearCsvTexto(texto) {
  const lines = String(texto || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

export async function leerArchivoCatalogo(file) {
  if (!file) return { ok: false, error: 'No se eligió archivo.' };
  const name = String(file.name || '').toLowerCase();
  try {
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      const texto = await file.text();
      const filas = parsearFilasCrudas(parsearCsvTexto(texto));
      return resultadoLectura(filas, name);
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      let filas = [];
      for (const sheetName of wb.SheetNames || []) {
        const sheet = wb.Sheets[sheetName];
        const crudas = hojaExcelAFilas(sheet);
        filas = filas.concat(parsearFilasCrudas(crudas));
        if (filas.length) break;
      }
      return resultadoLectura(filas, name);
    }
    return { ok: false, error: 'Formato no soportado. Usa .xlsx, .xls o .csv' };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export function parsearTextoPegado(texto) {
  const filas = parsearFilasCrudas(parsearCsvTexto(texto));
  return { ok: filas.length > 0, filas, error: filas.length ? null : 'No se detectaron filas válidas (código + nombre).' };
}

export async function importarCatalogoSupabase(supabase, filas, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const { sucursal = 'MAIN', proveedoresFiltro = null } = opts;
  let productos = (filas || []).filter((p) => p?.id && p?.nombre);
  if (proveedoresFiltro?.length) {
    productos = filtrarFilasPorProveedores(productos, proveedoresFiltro);
  }
  if (!productos.length) {
    return {
      ok: false,
      error: proveedoresFiltro?.length
        ? 'No hay productos del/los proveedor(es) seleccionado(s) para importar.'
        : 'No hay productos válidos para importar (código + nombre obligatorios).',
    };
  }

  const nombresProv = productos.map((p) => p.proveedor).filter(Boolean);
  let proveedoresCreados = 0;
  let porNombreProv = new Map();
  if (nombresProv.length) {
    const aseg = await asegurarProveedoresPorNombre(supabase, nombresProv);
    if (!aseg.ok) return aseg;
    porNombreProv = aseg.porNombre;
    proveedoresCreados = aseg.creados || 0;
  }

  const BATCH = 40;
  let total = 0;
  const errores = [];
  const vinculos = [];

  for (let i = 0; i < productos.length; i += BATCH) {
    const chunk = productos.slice(i, i + BATCH);
    const ids = chunk.map((p) => p.id);
    const { data: existentes, error: e0 } = await supabase
      .from('productos')
      .select('id, stock_sucursales, stock, stock_cedis')
      .in('id', ids);
    if (e0) {
      const msg = String(e0.message || '');
      const faltaStockMapa = msg.includes('stock_sucursales');
      if (faltaStockMapa) {
        return {
          ok: false,
          error:
            'Falta la columna stock_sucursales en Supabase. Ejecuta supabase/fix_stock_ubicaciones.sql en SQL Editor y vuelve a importar.',
        };
      }
      const aviso = mensajeErrorColumnasProducto(e0);
      return { ok: false, error: aviso || `Error leyendo productos (lote ${Math.floor(i / BATCH) + 1}): ${e0.message}` };
    }
    const porId = new Map((existentes || []).map((p) => [p.id, p]));

    const payloads = chunk.map((p) => {
      const db = porId.get(p.id) || {};
      const stockPatch = buildPatchStockTienda(db, sucursal, p.stock_piso, p.stock_cedis, sucursal);
      return {
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion,
        cat: p.cat,
        clave_sat: p.clave_sat,
        impuesto: Number.isFinite(Number(p.impuesto)) ? Number(p.impuesto) : IVA_DEFAULT,
        precio_compra_sin: p.precio_compra_sin,
        precio_compra_con: p.precio_compra_con,
        costo: p.costo,
        ganancia_pct: gananciaEfectiva(p.ganancia_pct),
        precio_venta_sin: p.precio_venta_sin,
        precio: precioConsumidor(p.precio),
        stock_minimo: p.stock_minimo,
        en_venta: p.en_venta,
        en_favoritos: p.en_favoritos,
        ...stockPatch,
      };
    });

    const { error } = await supabase.from('productos').upsert(payloads, { onConflict: 'id' });
    if (error) {
      const aviso = mensajeErrorColumnasProducto(error);
      const msg = aviso || error.message;
      if (String(msg).includes('stock_sucursales')) {
        return {
          ok: false,
          error: 'Falta stock_sucursales en la tabla productos. Ejecuta supabase/fix_stock_ubicaciones.sql en Supabase.',
        };
      }
      errores.push(msg);
      continue;
    }
    total += payloads.length;

    for (const p of chunk) {
      const nombreP = String(p.proveedor || '').trim();
      if (!nombreP) continue;
      const provId = porNombreProv.get(normalizarNombreProveedor(nombreP));
      if (!provId) continue;
      vinculos.push({
        proveedor_id: provId,
        producto_id: p.id,
        sku_proveedor: p.sku_proveedor || null,
      });
    }
  }

  let vinculados = 0;
  if (vinculos.length) {
    const v = await vincularProductosProveedor(supabase, vinculos);
    vinculados = v.vinculados || 0;
    if (v.errores?.length) errores.push(...v.errores.slice(0, 10));
  }

  if (!total) return { ok: false, error: errores.join('\n') || 'No se importó ningún producto.' };

  const partes = [`Importados ${total} producto(s)`];
  if (proveedoresCreados) partes.push(`${proveedoresCreados} proveedor(es) nuevo(s)`);
  if (vinculados) partes.push(`${vinculados} vínculo(s) proveedor↔producto`);
  if (errores.length) partes.push('Algunos lotes/vínculos fallaron');

  return {
    ok: true,
    count: total,
    proveedoresCreados,
    vinculados,
    errores,
    mensaje: partes.join(' · ') + '.',
  };
}

export function descargarPlantillaCsv() {
  const ejemplo = [
    '7501234567890',
    'Refresco Cola 600ml',
    'Bebida cola 600ml',
    'BEBIDAS',
    '50202306',
    '8',
    '8.50',
    '9.18',
    '30',
    '12',
    '24',
    '48',
    '6',
    'si',
    'no',
    'Coca Cola',
    'CC-600',
  ].join(',');
  const csv = `${PLANTILLA_COLUMNAS}\n${ejemplo}`;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_catalogo_3b.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function exportarCatalogoCsv(inventario) {
  const filas = (inventario || []).map((p) =>
    [
      p.id,
      `"${String(p.nombre || '').replace(/"/g, '""')}"`,
      `"${String(p.descripcion || '').replace(/"/g, '""')}"`,
      p.cat || 'GENERAL',
      p.clave_sat || '',
      Number(p.impuesto ?? IVA_DEFAULT),
      Number(p.precio_compra_sin || 0).toFixed(2),
      Number(p.precio_compra_con || p.costo || 0).toFixed(2),
      Number(p.ganancia_pct || 0).toFixed(2),
      Number(p.precio || 0),
      Number(p.stock || 0),
      Number(p.stock_cedis || 0),
      Number(p.stock_minimo ?? 6),
      p.en_venta !== false ? 'si' : 'no',
      p.en_favoritos ? 'si' : 'no',
    ].join(','),
  );
  const csv = `${PLANTILLA_COLUMNAS}\n${filas.join('\n')}`;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `catalogo_3b_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function descargarPlantillaExcel() {
  const headers = COLUMNAS_CATALOGO.map((c) => c.label);
  const ejemplo = [
    '7501234567890',
    'Refresco Cola 600ml',
    'Bebida cola 600ml',
    'BEBIDAS',
    '50202306',
    8,
    8.5,
    9.18,
    30,
    12,
    24,
    48,
    6,
    'si',
    'no',
    'Coca Cola',
    'CC-600',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
  // Columna codigo como texto (evita que Excel corrompa códigos de barras)
  for (let r = 1; r <= 500; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: 0 });
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].z = '@';
    ws[ref].t = 's';
  }
  ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catalogo');
  XLSX.writeFile(wb, 'plantilla_catalogo_3b.xlsx');
}
