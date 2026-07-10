import { normalizarCodigoTienda } from '../constants/sucursales.js';

/** Claves antiguas: se borran para que el PIN no quede en el navegador. */
export const LS_PIN_CUBRE_TURNO = 'pos3b_pin_cubre_turno';
export const LS_PIN_CUBRE_TURNO_AT = 'pos3b_pin_cubre_turno_updated_at';
export const EVENTO_PIN_CUBRE_TURNO = 'pos3b-pin-cubre-turno';

/** Solo en memoria de esta sesión: si la tienda tiene PIN activo (sin guardar el valor). */
const activoPorSucursal = new Map();

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_PIN_CUBRE_TURNO));
  } catch {
    /* ignore */
  }
}

/** Elimina copias locales antiguas del PIN (evita que aparezcan en todas las tiendas). */
export function purgarCacheLocalPinCubreTurno() {
  try {
    localStorage.removeItem(LS_PIN_CUBRE_TURNO);
    localStorage.removeItem(LS_PIN_CUBRE_TURNO_AT);
  } catch {
    /* ignore */
  }
}

purgarCacheLocalPinCubreTurno();

export function marcarPinCubreTurnoActivo(sucursal, activo) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return;
  if (activo) activoPorSucursal.set(suc, true);
  else activoPorSucursal.delete(suc);
  emit();
}

export function pinCubreTurnoActivo(sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return false;
  return Boolean(activoPorSucursal.get(suc));
}

/** @deprecated Ya no se guardan PIN en localStorage; siempre {}. */
export function leerPinsCubreTurno() {
  return {};
}

/** @deprecated Sin cache local del valor del PIN. */
export function leerPinCubreTurno() {
  return '';
}

export function leerPinCubreTurnoMeta() {
  return null;
}

/** Actualiza solo el flag en memoria (el valor vive en Supabase). */
export function guardarPinCubreTurno(sucursal, pin, { silencioso = false } = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: false, error: 'Sucursal no válida.' };
  const p = String(pin || '').trim();
  marcarPinCubreTurnoActivo(suc, Boolean(p));
  if (!silencioso) emit();
  return { ok: true };
}

/** Guarda solo en Supabase (no en el navegador). */
export async function persistirPinCubreTurno(sucursal, pin, supabase) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: false, error: 'Sucursal no válida.' };
  const p = String(pin || '').trim();
  if (!supabase) {
    return { ok: false, error: 'Sin conexión a Supabase; el PIN de cubre turno solo se guarda en la nube.' };
  }
  const { subirPinCubreTurnoANube } = await import('./cubreTurnoSync.js');
  const remoto = await subirPinCubreTurnoANube(supabase, suc, p);
  if (remoto.ok) {
    marcarPinCubreTurnoActivo(suc, Boolean(remoto.pin ?? p));
  }
  return { ok: Boolean(remoto.ok), remoto };
}

export function generarPinCubreTurnoAleatorio() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Genera un PIN nuevo de 4 dígitos, lo sube a la nube y lo devuelve (para mostrar una vez). */
export async function reiniciarPinCubreTurno(sucursal, supabase) {
  let pin = generarPinCubreTurnoAleatorio();
  if (supabase) {
    try {
      const { pinUsuarioOcupadoEnSucursal } = await import('./usuariosAuth.js');
      for (let i = 0; i < 12; i += 1) {
        const choque = await pinUsuarioOcupadoEnSucursal(supabase, pin, sucursal);
        if (!choque.ocupado) break;
        pin = generarPinCubreTurnoAleatorio();
      }
    } catch {
      /* si falla la consulta, igual se intenta subir el PIN generado */
    }
  }
  const res = await persistirPinCubreTurno(sucursal, pin, supabase);
  if (!res.ok) return { ...res, pin: null };
  return { ok: true, pin, remoto: res.remoto };
}

export function esPinCubreTurno(pin, pinConfigurado) {
  const configurado = String(pinConfigurado || '').trim();
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
