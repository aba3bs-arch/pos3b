import * as XLSX from 'xlsx';

const ALIAS = {
  id: ['codigo', 'código', 'code', 'id', 'barras', 'barcode', 'sku', 'clave', 'ean', 'upc'],
  nombre: ['nombre', 'descripcion', 'descripción', 'producto', 'articulo', 'artículo', 'item'],
  precio: ['precio', 'price', 'pvp', 'costo', 'precio_venta'],
  stock: ['stock', 'inventario', 'existencia', 'cantidad', 'qty'],
  stock_minimo: ['stock_minimo', 'stock minimo', 'stock_mínimo', 'minimo', 'mínimo', 'min', 'min_stock'],
  cat: ['categoria', 'categoría', 'cat', 'departamento', 'depto', 'dept'],
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

export function filaAProducto(row) {
  const id = String(valorCampo(row, 'id') || '').trim();
  const nombre = String(valorCampo(row, 'nombre') || '').trim();
  if (!id || !nombre) return null;
  return {
    id,
    nombre,
    precio: Math.max(0, Number(valorCampo(row, 'precio')) || 0),
    stock: Math.max(0, parseInt(String(valorCampo(row, 'stock') || '0'), 10) || 0),
    stock_minimo: Math.max(0, parseInt(String(valorCampo(row, 'stock_minimo') || '6'), 10) || 6),
    cat: String(valorCampo(row, 'cat') || 'GENERAL')
      .trim()
      .toUpperCase() || 'GENERAL',
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

export async function importarCatalogoSupabase(supabase, filas) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const productos = (filas || []).filter((p) => p?.id && p?.nombre);
  if (!productos.length) return { ok: false, error: 'No hay productos válidos para importar.' };
  const { error } = await supabase.from('productos').upsert(productos);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: productos.length };
}

export const PLANTILLA_COLUMNAS = 'codigo,nombre,precio,stock,stock_minimo,categoria';

export function descargarPlantillaCsv() {
  const csv = `${PLANTILLA_COLUMNAS}\n7501234567890,Refresco Cola 600ml,18.50,24,6,BEBIDAS\n12345,Sabritas Original 45g,15.00,30,10,ABARROTE`;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_catalogo_3b.csv';
  a.click();
  URL.revokeObjectURL(url);
}
