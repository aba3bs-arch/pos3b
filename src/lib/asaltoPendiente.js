/**
 * Alarma de asalto pendiente en el dispositivo (push con app cerrada / sin sesión).
 * El SW y notificationclick guardan el payload; la app lo lee al abrir.
 */
export const LS_ASALTO_PENDIENTE = 'pos3b_asalto_pendiente_v1';
export const EVENTO_ASALTO_PENDIENTE = 'pos-asalto-pendiente';
const MAX_AGE_MS = 1000 * 60 * 60 * 2; // 2 h

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function guardarAsaltoPendiente(detail = {}) {
  if (typeof localStorage === 'undefined') return null;
  const payload = {
    id: detail.id != null ? String(detail.id) : null,
    titulo: detail.titulo || 'ASALTO EN PROCESO',
    mensaje: detail.mensaje || '',
    tipo: detail.tipo || 'asalto_en_proceso',
    sucursal_id: detail.sucursal_id || null,
    at: detail.at || new Date().toISOString(),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(LS_ASALTO_PENDIENTE, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_ASALTO_PENDIENTE, { detail: payload }));
  }
  return payload;
}

export function leerAsaltoPendiente() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const data = safeParse(localStorage.getItem(LS_ASALTO_PENDIENTE));
    if (!data?.savedAt) return null;
    if (Date.now() - Number(data.savedAt) > MAX_AGE_MS) {
      limpiarAsaltoPendiente();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function limpiarAsaltoPendiente() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LS_ASALTO_PENDIENTE);
  } catch {
    /* ignore */
  }
}

/** ¿La URL pide abrir la pantalla de asalto? (?alerta=asalto) */
export function urlPideAlertaAsalto(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const q = new URLSearchParams(search || '');
    const v = String(q.get('alerta') || q.get('asalto') || '').toLowerCase();
    return v === 'asalto' || v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** Quita ?alerta=… de la barra sin recargar. */
export function limpiarQueryAlertaAsalto() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('alerta') && !url.searchParams.has('asalto')) return;
    url.searchParams.delete('alerta');
    url.searchParams.delete('asalto');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}
