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
];

export const PLANTILLA_COLUMNAS = COLUMNAS_CATALOGO.map((c) => c.label).join(',');

const ALIAS = {
  codigo: ['codigo', 'código', 'code', 'id', 'barras', 'barcode', 'sku', 'clave', 'ean', 'upc'],
  nombre: ['nombre', 'descripcion_corta', 'producto', 'articulo', 'artículo', 'item'],
  descripcion: ['descripcion', 'descripción', 'desc', 'detalle'],
  categoria: ['categoria', 'categoría', 'cat', 'departamento', 'depto', 'dept'],
  clave_sat: ['clave_sat', 'sat', 'clave sat'],
  impuesto: ['impuesto', 'iva', 'tax'],
  precio_compra_sin: ['precio_compra_sin', 'costo_sin', 'compra_sin', 'costo_sin_iva'],
  precio_compra_con: ['precio_compra_con', 'costo_con', 'compra_con', 'costo'],
  ganancia_pct: ['ganancia_pct', 'ganancia', 'margen', 'margen_pct', 'utilidad_pct'],
  precio_venta: ['precio_venta', 'precio', 'price', 'pvp', 'precio_publico'],
  stock_piso: ['stock_piso', 'stock', 'inventario', 'existencia', 'piso', 'cantidad', 'qty'],
  stock_cedis: ['stock_cedis', 'cedis', 'bodega', 'almacen'],
  stock_minimo: ['stock_minimo', 'stock minimo', 'stock_mínimo', 'minimo', 'mínimo', 'min', 'min_stock'],
  en_venta: ['en_venta', 'venta', 'activo', 'disponible'],
  en_favoritos: ['en_favoritos', 'favorito', 'favoritos', 'destacado'],
};

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
  if (['1', 'si', 'sí', 'yes', 'true', 'verdadero', 'x'].includes(s)) return true;
  if (['0', 'no', 'false', 'falso'].includes(s)) return false;
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
  const imp = impRaw !== '' && impRaw != null ? Math.max(0, Number(impRaw)) : IVA_DEFAULT;
  const impuesto = impuestoEfectivo(imp);
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
  };
}

export function parsearFilasCrudas(rows) {
  return (rows || []).map(filaAProducto).filter(Boolean);
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
  const { sucursal = 'MAIN' } = opts;
  const productos = (filas || []).filter((p) => p?.id && p?.nombre);
  if (!productos.length) return { ok: false, error: 'No hay productos válidos para importar (código + nombre obligatorios).' };

  const BATCH = 40;
  let total = 0;
  const errores = [];

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
        impuesto: impuestoEfectivo(p.impuesto),
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
  }

  if (!total) return { ok: false, error: errores.join('\n') || 'No se importó ningún producto.' };
  return {
    ok: true,
    count: total,
    errores,
    mensaje: errores.length ? `Importados ${total} producto(s). Algunos lotes fallaron.` : undefined,
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
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
  // Columna codigo como texto (evita que Excel corrompa códigos de barras)
  for (let r = 1; r <= 500; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: 0 });
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].z = '@';
    ws[ref].t = 's';
  }
  ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catalogo');
  XLSX.writeFile(wb, 'plantilla_catalogo_3b.xlsx');
}
