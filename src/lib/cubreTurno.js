import { normalizarCodigoTienda } from '../constants/sucursales.js';

export const LS_PIN_CUBRE_TURNO = 'pos3b_pin_cubre_turno';
export const LS_PIN_CUBRE_TURNO_AT = 'pos3b_pin_cubre_turno_updated_at';
export const EVENTO_PIN_CUBRE_TURNO = 'pos3b-pin-cubre-turno';

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_PIN_CUBRE_TURNO));
  } catch {
    /* ignore */
  }
}

function leerMetaMap() {
  try {
    const raw = localStorage.getItem(LS_PIN_CUBRE_TURNO_AT);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function guardarMetaMap(map) {
  localStorage.setItem(LS_PIN_CUBRE_TURNO_AT, JSON.stringify(map || {}));
}

export function leerPinsCubreTurno() {
  try {
    const raw = localStorage.getItem(LS_PIN_CUBRE_TURNO);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function leerPinCubreTurno(sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return '';
  return String(leerPinsCubreTurno()[suc] || '').trim();
}

export function leerPinCubreTurnoMeta(sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return null;
  return leerMetaMap()[suc] || null;
}

export function guardarPinCubreTurno(sucursal, pin, { updatedAt, silencioso = false } = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: false, error: 'Sucursal no válida.' };
  const p = String(pin || '').trim();
  const map = { ...leerPinsCubreTurno() };
  const meta = { ...leerMetaMap() };
  if (!p) delete map[suc];
  else map[suc] = p;
  meta[suc] = updatedAt || new Date().toISOString();
  localStorage.setItem(LS_PIN_CUBRE_TURNO, JSON.stringify(map));
  guardarMetaMap(meta);
  if (!silencioso) emit();
  return { ok: true };
}

/** Guarda local y sincroniza a Supabase (todas las cajas de esa sucursal). */
export async function persistirPinCubreTurno(sucursal, pin, supabase) {
  const local = guardarPinCubreTurno(sucursal, pin);
  if (!local.ok) return local;
  if (!supabase) return { ok: true, local };
  const { subirPinCubreTurnoANube } = await import('./cubreTurnoSync.js');
  const remoto = await subirPinCubreTurnoANube(supabase, sucursal, pin);
  if (remoto.ok && remoto.updated_at) {
    guardarPinCubreTurno(sucursal, remoto.pin ?? pin, { updatedAt: remoto.updated_at, silencioso: true });
  }
  // Local siempre queda; el caller debe revisar `remoto` para sync entre cajas.
  return { ok: true, local, remoto };
}

export function pinCubreTurnoActivo(sucursal) {
  return Boolean(leerPinCubreTurno(sucursal));
}

export function esPinCubreTurno(pin, sucursal) {
  const configurado = leerPinCubreTurno(sucursal);
  if (!configurado) return false;
  return String(pin || '').trim() === configurado;
}

export function esUsuarioCubreTurno(user) {
  return Boolean(user?.esCubreTurno);
}

export function validarDatosCubreTurno({ nombre, telefono }) {
  const n = String(nombre || '').trim().replace(/\s+/g, ' ');
  const t = String(telefono || '').replace(/\D/g, '');
  const partes = n.split(' ').filter(Boolean);
  if (n.length < 5 || partes.length < 2) {
    return { ok: false, error: 'Escribe nombre y apellido completos de quien cubre el turno.' };
  }
  if (t.length < 10) return { ok: false, error: 'Indica un teléfono de contacto (10 dígitos mínimo).' };
  return { ok: true, nombre: n, telefono: t };
}

/** True si nombre+teléfono ya permiten entrar (misma regla que validarDatosCubreTurno). */
export function datosCubreTurnoCompletos({ nombre, telefono }) {
  return validarDatosCubreTurno({ nombre, telefono }).ok;
}

/** Sesión temporal con privilegios de cajero (sin usuario en BD). */
export function construirUsuarioCubreTurno({ nombre, telefono, sucursal }) {
  const suc = normalizarCodigoTienda(sucursal) || 'MAIN';
  return {
    id: null,
    nombre: String(nombre).trim(),
    telefono: String(telefono).replace(/\D/g, ''),
    rol: 'Cajero',
    sucursal_id: suc,
    esCubreTurno: true,
    turno_id: null,
    turno_horario: null,
    dispositivo_id: null,
  };
}
