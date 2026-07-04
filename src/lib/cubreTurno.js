import { normalizarCodigoTienda } from '../constants/sucursales.js';

export const LS_PIN_CUBRE_TURNO = 'pos3b_pin_cubre_turno';
export const EVENTO_PIN_CUBRE_TURNO = 'pos3b-pin-cubre-turno';

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_PIN_CUBRE_TURNO));
  } catch {
    /* ignore */
  }
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

export function guardarPinCubreTurno(sucursal, pin) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: false, error: 'Sucursal no válida.' };
  const p = String(pin || '').trim();
  const map = { ...leerPinsCubreTurno() };
  if (!p) delete map[suc];
  else map[suc] = p;
  localStorage.setItem(LS_PIN_CUBRE_TURNO, JSON.stringify(map));
  emit();
  return { ok: true };
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
  const n = String(nombre || '').trim();
  const t = String(telefono || '').replace(/\D/g, '');
  if (n.length < 3) return { ok: false, error: 'Escribe el nombre completo de quien cubre el turno.' };
  if (t.length < 10) return { ok: false, error: 'Indica un teléfono de contacto (10 dígitos mínimo).' };
  return { ok: true, nombre: n, telefono: t };
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
