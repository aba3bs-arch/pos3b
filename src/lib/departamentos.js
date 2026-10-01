const LS_EXTRA = 'pos3b_departamentos_extra';
/** Extras solo-CEDIS: no se mezclan en el menú de tiendas (salvo que ya haya productos). */
const LS_EXTRA_CEDIS = 'pos3b_departamentos_cedis_extra';

export const DEPARTAMENTOS_BASE = ['GENERAL', 'FAVORITOS', 'ABARROTES', 'BEBIDAS', 'LIMPIEZA', 'DULCES', 'HIGIENE', 'LACTEOS', 'CARNES', 'VERDURAS'];

export function normalizarDepartamento(s) {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function leerExtras() {
  try {
    const raw = localStorage.getItem(LS_EXTRA);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizarDepartamento).filter(Boolean);
  } catch {
    return [];
  }
}

function leerExtrasCedisSolo() {
  try {
    const raw = localStorage.getItem(LS_EXTRA_CEDIS);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return new Set(arr.map(normalizarDepartamento).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Departamentos del catálogo + base + extras de tienda. No incluye extras vacíos solo-CEDIS. */
export function listarDepartamentos(inventario = []) {
  const seen = new Set();
  const out = [];
  const extrasCedis = leerExtrasCedisSolo();
  const catsEnInventario = new Set(
    (inventario || []).map((p) => normalizarDepartamento(p?.cat)).filter(Boolean),
  );
  const add = (d) => {
    const n = normalizarDepartamento(d);
    if (!n || seen.has(n)) return;
    // Evitar que deptos creados solo en CEDIS aparezcan vacíos en menú de tienda.
    if (extrasCedis.has(n) && !catsEnInventario.has(n) && !DEPARTAMENTOS_BASE.includes(n)) return;
    seen.add(n);
    out.push(n);
  };
  for (const d of DEPARTAMENTOS_BASE) add(d);
  for (const p of inventario || []) add(p.cat);
  for (const d of leerExtras()) add(d);
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

export function etiquetaDepartamento(codigo) {
  const c = normalizarDepartamento(codigo);
  if (c === 'FAVORITOS') return 'Favoritos (ventas rápidas)';
  return c.replace(/_/g, ' ');
}

export function agregarDepartamentoExtra(raw) {
  const codigo = normalizarDepartamento(raw);
  if (!codigo) return { ok: false, error: 'Escribe un nombre de departamento.' };
  if (codigo.length > 32) return { ok: false, error: 'Máximo 32 caracteres.' };
  const extras = leerExtras();
  if (DEPARTAMENTOS_BASE.includes(codigo) || extras.includes(codigo)) {
    return { ok: false, error: 'Ese departamento ya existe.' };
  }
  extras.push(codigo);
  localStorage.setItem(LS_EXTRA, JSON.stringify(extras));
  return { ok: true, codigo };
}
