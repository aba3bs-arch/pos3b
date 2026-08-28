/**
 * Aviso de cambios de versión (local).
 * Se muestra a todos los usuarios aunque version.json / Netlify no disparen el overlay de build.
 * Cambia `id` en cada release importante para volver a notificar.
 */
export const RELEASE_AVISO_ACTUAL = {
  id: '2026-08-28-tutorial-corte-abarrotes-real',
  titulo: 'Actualización del POS',
  resumen:
    'Tutorial de Corte Abarrotes con captura real de tienda: zonas clicables, calculadora y negativo en caja. Pulsa Actualizar.',
  cambios: [
    'Tutorial → «Corte Abarrotes» basado en pantalla real (folio, movimientos, gastos, caja chica)',
    'Mapa interactivo por zonas + práctica de negativo cuando la caja queda en rojo',
    'Preguntas de capacitación con los campos que sí existen en el corte',
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
