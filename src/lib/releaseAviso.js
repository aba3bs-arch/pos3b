/**
 * Aviso de cambios de versión (local).
 * Se muestra a todos los usuarios aunque version.json / Netlify no disparen el overlay de build.
 * Cambia `id` en cada release importante para volver a notificar.
 */
export const RELEASE_AVISO_ACTUAL = {
  id: '2026-07-31-prestamos-garage-ie',
  titulo: 'Actualización del POS',
  resumen:
    'Hay cambios nuevos. Pulsa Actualizar para cargar la versión reciente (limpia caché y recarga).',
  cambios: [
    'Préstamos empleados: Editar, Eliminar, Abonar y Liquidar (cargo a Virtual / Abarrotes / Garage)',
    'IE Virtual: al tocar el monto de una recolección ves el desglose de gastos',
    'Corte Garage: gastos y faltantes se conservan hasta la recolección con máquinas en cero',
    'Recibo Corte Virtual con tienda, folio, turno, tipo, fecha y cajero',
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
