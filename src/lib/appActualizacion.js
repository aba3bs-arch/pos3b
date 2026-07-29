/**
 * Detección de actualizaciones del POS (build en la nube vs esta sesión).
 */
const LS_ACEPTADO = 'pos3b_app_build_aceptado';
const LS_POSPUESTO = 'pos3b_app_update_pospuesto_hasta';

export const EVENTO_APP_UPDATE = 'pos3b-app-update';

function buildActual() {
  try {
    return String(import.meta.env.VITE_APP_BUILD || '').trim();
  } catch {
    return '';
  }
}

export function buildIdActual() {
  return buildActual();
}

export function leerBuildAceptado() {
  try {
    return String(localStorage.getItem(LS_ACEPTADO) || '').trim();
  } catch {
    return '';
  }
}

export function marcarBuildAceptado(buildId) {
  try {
    if (buildId) localStorage.setItem(LS_ACEPTADO, String(buildId));
  } catch {
    /* ignore */
  }
}

export function posponerActualizacion(minutos = 60) {
  try {
    const hasta = Date.now() + Math.max(5, Number(minutos) || 60) * 60_000;
    sessionStorage.setItem(LS_POSPUESTO, String(hasta));
  } catch {
    /* ignore */
  }
}

function estaPospuesta() {
  try {
    const hasta = Number(sessionStorage.getItem(LS_POSPUESTO) || 0);
    return hasta > Date.now();
  } catch {
    return false;
  }
}

function urlVersionJson() {
  const base = import.meta.env.BASE_URL || '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}version.json?t=${Date.now()}`;
}

/**
 * Consulta public/version.json (no-cache).
 * @returns {Promise<{ pendiente: boolean, remota?: object, actual?: string, motivo?: string }>}
 */
export async function checarActualizacionApp() {
  if (import.meta.env.DEV) {
    return { pendiente: false, motivo: 'dev' };
  }
  if (estaPospuesta()) {
    return { pendiente: false, motivo: 'pospuesta' };
  }

  const actual = buildActual();
  let remota = null;
  try {
    const res = await fetch(urlVersionJson(), { cache: 'no-store' });
    if (!res.ok) return { pendiente: false, motivo: `http_${res.status}`, actual };
    remota = await res.json();
  } catch (e) {
    return { pendiente: false, motivo: e?.message || 'fetch', actual };
  }

  const remotoId = String(remota?.buildId || '').trim();
  if (!remotoId) return { pendiente: false, motivo: 'sin_build', actual, remota };

  // Esta pestaña/caja aún corre un build anterior al desplegado.
  if (actual && remotoId !== actual) {
    return { pendiente: true, remota, actual, motivo: 'build_desfasado' };
  }

  // Primera carga tras deploy: el JS ya es nuevo pero aún no “aceptaron” ver el aviso.
  const aceptado = leerBuildAceptado();
  if (remotoId && remotoId !== aceptado) {
    return { pendiente: true, remota, actual: actual || remotoId, motivo: 'changelog_pendiente' };
  }

  return { pendiente: false, remota, actual, motivo: 'al_dia' };
}

export async function aplicarActualizacionApp(remota) {
  const id = String(remota?.buildId || buildActual() || '').trim();
  if (id) marcarBuildAceptado(id);
  try {
    sessionStorage.removeItem(LS_POSPUESTO);
  } catch {
    /* ignore */
  }

  // Intentar limpiar caches del navegador (PWA / fetch) antes de recargar.
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }

  const url = new URL(window.location.href);
  url.searchParams.set('_upd', String(Date.now()));
  window.location.replace(url.toString());
}

export function emitirChequeoActualizacion() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_APP_UPDATE));
  } catch {
    /* ignore */
  }
}
