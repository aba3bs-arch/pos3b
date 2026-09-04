/**
 * Tiendas base:
 * - MAIN  = Central de administración (panel admin; no es almacén)
 * - CEDIS = Almacén central / inventario de la cadena
 * - FUSION, 3Bn = tiendas de venta
 */
export const SUCURSALES_BASE = ['MAIN', 'CEDIS', 'FUSION', '3B2', '3B5', '3B6', '3B7', '3B9', '3B10'];

/** Panel administrativo (login hub, no fijable como caja). */
export const CENTRAL_ADMIN = 'MAIN';

/** Almacén / CEDIS de la empresa (inventario central). */
export const ALMACEN_CENTRAL = 'CEDIS';

/** Quita acentos/diacríticos (FUSIÓN → FUSION) para códigos de tienda. */
export function sinAcentosTexto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Alias de captura → código canónico. */
const ALIAS_A_CODIGO = {
  CEDIS_CENTRAL: 'CEDIS',
  ALMACEN_CENTRAL: 'CEDIS',
  ALMACEN: 'CEDIS',
  CENTRAL: 'MAIN',
  CENTRAL_ADMIN: 'MAIN',
  ADMINISTRACION: 'MAIN',
  // Histórico: recolecciones guardaban "Fusión" / "FUSIÓN" y no cuadraban con FUSION.
  FUSION: 'FUSION',
};

export function normalizarCodigoTienda(s) {
  const c = sinAcentosTexto(s)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (!c) return '';
  return ALIAS_A_CODIGO[c] || c;
}

/**
 * Variantes históricas del mismo código (p. ej. Fusión vs FUSION)
 * para consultas .in() sobre datos ya guardados.
 */
export function equivalentesCodigoTienda(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!c) return [];
  const out = new Set([c, String(codigo || '').trim()].filter(Boolean));
  if (c === 'FUSION') {
    out.add('Fusión');
    out.add('FUSIÓN');
    out.add('Fusion');
    out.add('fusion');
  }
  return [...out];
}

/** Central de administración (MAIN). */
export function esCentralAdmin(codigo) {
  return normalizarCodigoTienda(codigo) === CENTRAL_ADMIN;
}

/** Almacén CEDIS (inventario). */
export function esAlmacenCentral(codigo) {
  return normalizarCodigoTienda(codigo) === ALMACEN_CENTRAL;
}

/** MAIN o CEDIS: no son tiendas de venta al público. */
export function esSucursalNoVenta(codigo) {
  return esCentralAdmin(codigo) || esAlmacenCentral(codigo);
}

/** Tiendas de venta (sin MAIN ni CEDIS). */
export function listarSucursalesOperativas() {
  return listarSucursales().filter((s) => !esSucursalNoVenta(s));
}

export const LS_SUCURSAL = 'pos3b_sucursal';
const LS_EXTRA = 'pos3b_sucursales_extra';
const LS_TIENDA_BLOQUEADA = 'pos3b_tienda_bloqueada';

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
  const s = normalizarCodigoTienda(codigo);
  if (esCentralAdmin(s)) return 'Central de administración (MAIN)';
  if (esAlmacenCentral(s)) return 'CEDIS · almacén central';
  if (s === 'FUSION') return s;
  if (/^3B\d+$/i.test(s)) return `Sucursal ${s}`;
  return s || String(codigo || '');
}

export function agregarSucursalExtra(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!c || c.length > 32) return { ok: false, error: 'Código vacío o demasiado largo (máx. 32).' };
  if (!/^[A-Z0-9._-]+$/.test(c)) return { ok: false, error: 'Solo letras, números, punto, guion y guion bajo.' };
  if (listarSucursales().includes(c)) {
    return { ok: false, error: 'Esa tienda ya está en la lista.' };
  }
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
  return CENTRAL_ADMIN;
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
    if (!codigoTiendaValido(c)) return null;
    // Locks antiguos a MAIN no cuentan (central admin libre).
    if (esCentralAdmin(c)) {
      desbloquearTiendaEnEsteEquipo();
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

/** Caja física fijada por env (tiendas de venta o CEDIS; MAIN no bloquea el selector). */
export function sucursalFijaEsCajaFisica() {
  const env = sucursalFijaPorEntorno();
  return Boolean(env && !esCentralAdmin(env));
}

export function bloquearTiendaEnEsteEquipo(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!codigoTiendaValido(c)) return;
  // MAIN es panel administrativo: nunca se “fijera” como caja de una sola tienda.
  // CEDIS sí se puede fijar (PC de almacén).
  if (esCentralAdmin(c)) return;
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
