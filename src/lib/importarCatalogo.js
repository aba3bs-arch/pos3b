import * as XLSX from 'xlsx';
import { round2, sinImpuesto, conImpuesto, gananciaDesdePrecios, IVA_DEFAULT, GANANCIA_DEFAULT, precioConsumidor, precioVentaConDesdeCompra } from './productoForm.js';
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
  { key: 'stock_cedis', label: 'stock_cedis', required: false, desc: 'Unidades en CEDIS (tienda activa)' },
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
  const aliases = [campo, ...(ALIAS[campo] || [])];
  for (const k of keys) {
    const nk = normKey(k);
    if (aliases.includes(nk) || aliases.some((a) => nk.includes(a))) {
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

export function filaAProducto(row) {
  const id = String(valorCampo(row, 'codigo') || '').trim();
  const nombre = String(valorCampo(row, 'nombre') || '').trim();
  if (!id || !nombre) return null;

  const imp = Math.max(0, Number(valorCampo(row, 'impuesto')) || IVA_DEFAULT);
  let compraSin = Number(valorCampo(row, 'precio_compra_sin')) || 0;
  let compraCon = Number(valorCampo(row, 'precio_compra_con')) || 0;
  if (compraSin <= 0 && compraCon > 0) compraSin = sinImpuesto(compraCon, imp);
  if (compraCon <= 0 && compraSin > 0) compraCon = conImpuesto(compraSin, imp);

  let precioVenta = Number(valorCampo(row, 'precio_venta')) || 0;
  let ganancia = Number(valorCampo(row, 'ganancia_pct'));
  if (!ganancia) ganancia = GANANCIA_DEFAULT;
  if (!precioVenta && compraSin > 0) {
    precioVenta = precioVentaConDesdeCompra(compraSin, ganancia, imp);
  } else if (precioVenta) {
    precioVenta = precioConsumidor(precioVenta);
  }
  if (compraSin > 0 && precioVenta > 0 && !valorCampo(row, 'ganancia_pct')) {
    ganancia = gananciaDesdePrecios(compraSin, sinImpuesto(precioVenta, imp));
  }

  return {
    id,
    nombre,
    descripcion: String(valorCampo(row, 'descripcion') || '').trim() || null,
    cat: String(valorCampo(row, 'categoria') || 'GENERAL')
      .trim()
      .toUpperCase() || 'GENERAL',
    clave_sat: String(valorCampo(row, 'clave_sat') || '').trim() || null,
    impuesto: imp,
    precio_compra_sin: round2(compraSin),
    precio_compra_con: round2(compraCon),
    costo: round2(compraCon),
    ganancia_pct: round2(ganancia),
    precio_venta_sin: round2(sinImpuesto(precioVenta, imp)),
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
      return { ok: true, filas, origen: name };
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const filas = parsearFilasCrudas(json);
      return { ok: true, filas, origen: name };
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
  if (!productos.length) return { ok: false, error: 'No hay productos válidos para importar.' };

  const ids = productos.map((p) => p.id);
  const { data: existentes, error: e0 } = await supabase.from('productos').select('*').in('id', ids);
  if (e0) return { ok: false, error: e0.message };
  const porId = new Map((existentes || []).map((p) => [p.id, p]));

  const payloads = productos.map((p) => {
    const db = porId.get(p.id) || {};
    const stockPatch = buildPatchStockTienda(db, sucursal, p.stock_piso, p.stock_cedis, sucursal);
    return {
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      cat: p.cat,
      clave_sat: p.clave_sat,
      impuesto: p.impuesto,
      precio_compra_sin: p.precio_compra_sin,
      precio_compra_con: p.precio_compra_con,
      costo: p.costo,
      ganancia_pct: p.ganancia_pct,
      precio_venta_sin: p.precio_venta_sin,
      precio: p.precio,
      stock_minimo: p.stock_minimo,
      en_venta: p.en_venta,
      en_favoritos: p.en_favoritos,
      ...stockPatch,
    };
  });

  const { error } = await supabase.from('productos').upsert(payloads);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: payloads.length };
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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catalogo');
  XLSX.writeFile(wb, 'plantilla_catalogo_3b.xlsx');
}
