/**
 * Tiendas base + MAIN (pruebas). Las agregadas en la app se guardan en localStorage.
 */
export const SUCURSALES_BASE = ['MAIN', 'FUSION', '3B2', '3B5', '3B6', '3B7', '3B9', '3B10'];

export const LS_SUCURSAL = 'pos3b_sucursal';
const LS_EXTRA = 'pos3b_sucursales_extra';
const LS_TIENDA_BLOQUEADA = 'pos3b_tienda_bloqueada';

export function normalizarCodigoTienda(s) {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

/** Código en .env (sin validar aún contra catálogo). */
export function codigoSucursalEnEntorno() {
  try {
    const v = normalizarCodigoTienda(import.meta.env?.VITE_SUCURSAL_FIJA);
    return v || null;
  } catch {
    return null;
  }
}

function leerExtras() {
  try {
    const raw = localStorage.getItem(LS_EXTRA);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => normalizarCodigoTienda(x)).filter(Boolean);
  } catch {
    return [];
  }
}

/** Lista completa: base + extras (sin duplicados). */
export function listarSucursales() {
  const seen = new Set(SUCURSALES_BASE);
  const out = [...SUCURSALES_BASE];
  for (const x of leerExtras()) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

export function codigoTiendaValido(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!c) return false;
  const env = codigoSucursalEnEntorno();
  if (env && c === env && /^[A-Z0-9._-]{1,32}$/.test(env)) return true;
  return listarSucursales().includes(c);
}

export function etiquetaTienda(codigo) {
  const s = String(codigo || '');
  if (s === 'MAIN') return 'Almacén central (MAIN)';
  if (s === 'FUSION') return s;
  if (/^3B\d+$/i.test(s)) return `Sucursal ${s}`;
  return s;
}

export function agregarSucursalExtra(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!c || c.length > 32) return { ok: false, error: 'Código vacío o demasiado largo (máx. 32).' };
  if (!/^[A-Z0-9._-]+$/.test(c)) return { ok: false, error: 'Solo letras, números, punto, guion y guion bajo.' };
  if (listarSucursales().includes(c)) return { ok: false, error: 'Esa tienda ya está en la lista.' };
  const extras = leerExtras().filter((x) => !SUCURSALES_BASE.includes(x));
  extras.push(c);
  try {
    localStorage.setItem(LS_EXTRA, JSON.stringify(extras));
  } catch {
    return { ok: false, error: 'No se pudo guardar en el navegador.' };
  }
  return { ok: true, codigo: c };
}

export function quitarSucursalExtra(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!c || SUCURSALES_BASE.includes(c)) return { ok: false, error: 'No se puede quitar una tienda base.' };
  const next = leerExtras().filter((x) => x !== c);
  try {
    localStorage.setItem(LS_EXTRA, JSON.stringify(next));
  } catch {
    return { ok: false, error: 'No se pudo actualizar.' };
  }
  return { ok: true };
}

/** Tienda fijada en build (.env): catálogo o código alfanumérico válido. */
export function sucursalFijaPorEntorno() {
  const v = codigoSucursalEnEntorno();
  if (!v) return null;
  if (listarSucursales().includes(v)) return v;
  if (SUCURSALES_BASE.includes(v)) return v;
  if (/^[A-Z0-9._-]{1,32}$/.test(v)) return v;
  return null;
}

export function leerSucursalGuardada() {
  try {
    const v = localStorage.getItem(LS_SUCURSAL);
    if (v && codigoTiendaValido(v)) return normalizarCodigoTienda(v);
  } catch {
    /* ignore */
  }
  return 'MAIN';
}

export function guardarSucursalLocal(codigo) {
  try {
    const c = normalizarCodigoTienda(codigo);
    if (codigoTiendaValido(c)) localStorage.setItem(LS_SUCURSAL, c);
  } catch {
    /* ignore */
  }
}

export function tiendaBloqueadaEnEsteEquipo() {
  try {
    if (localStorage.getItem(LS_TIENDA_BLOQUEADA) !== '1') return false;
    const c = localStorage.getItem(LS_SUCURSAL);
    return Boolean(c && codigoTiendaValido(c));
  } catch {
    return false;
  }
}

export function codigoTiendaBloqueadaLocal() {
  if (!tiendaBloqueadaEnEsteEquipo()) return null;
  try {
    const c = normalizarCodigoTienda(localStorage.getItem(LS_SUCURSAL));
    return codigoTiendaValido(c) ? c : null;
  } catch {
    return null;
  }
}

export function bloquearTiendaEnEsteEquipo(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!codigoTiendaValido(c)) return;
  try {
    localStorage.setItem(LS_SUCURSAL, c);
    localStorage.setItem(LS_TIENDA_BLOQUEADA, '1');
  } catch {
    /* ignore */
  }
}

export function desbloquearTiendaEnEsteEquipo() {
  try {
    localStorage.removeItem(LS_TIENDA_BLOQUEADA);
  } catch {
    /* ignore */
  }
}

/** Lista para selects: incluye VITE_SUCURSAL_FIJA aunque aún no esté en catálogo local. */
export function listarSucursalesParaUI() {
  const inner = listarSucursales();
  const env = sucursalFijaPorEntorno();
  if (env && !inner.includes(env)) return [env, ...inner];
  return inner;
}

export function sucursalInicial() {
  const env = sucursalFijaPorEntorno();
  if (env) return env;
  const loc = codigoTiendaBloqueadaLocal();
  if (loc) return loc;
  return leerSucursalGuardada();
}
