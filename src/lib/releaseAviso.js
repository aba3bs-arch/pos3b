/**
 * Aviso de cambios de versión (local).
 * Se muestra a todos los usuarios aunque version.json / Netlify no disparen el overlay de build.
 * Cambia `id` en cada release importante para volver a notificar.
 */
export const RELEASE_AVISO_ACTUAL = {
  id: '2026-08-28-ventas-modo-offline',
  titulo: 'Actualización del POS',
  resumen:
    'Nuevo MODO OFFLINE: si se cae internet, solo Ventas sigue operando; el resto se bloquea y las ventas se sincronizan al volver la red.',
  cambios: [
    'Etiqueta visible MODO OFFLINE en la caja',
    'Solo módulo Ventas habilitado sin internet (inventario y cortes bloqueados)',
    'Ventas pendientes se suben solas al recuperar conexión',
  ],
};

const LS_VISTO = 'pos3b_release_aviso_visto';

export function releaseAvisoFueVisto(id = RELEASE_AVISO_ACTUAL.id) {
  try {
    return String(localStorage.getItem(LS_VISTO) || '') === String(id);
  } catch {
    return false;
  }
}

export function marcarReleaseAvisoVisto(id = RELEASE_AVISO_ACTUAL.id) {
  try {
    localStorage.setItem(LS_VISTO, String(id));
  } catch {
    /* ignore */
  }
}

export function debeMostrarReleaseAviso() {
  return !releaseAvisoFueVisto(RELEASE_AVISO_ACTUAL.id);
}
