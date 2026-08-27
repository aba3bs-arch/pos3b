/**
 * Aviso de cambios de versión (local).
 * Se muestra a todos los usuarios aunque version.json / Netlify no disparen el overlay de build.
 * Cambia `id` en cada release importante para volver a notificar.
 */
export const RELEASE_AVISO_ACTUAL = {
  id: '2026-08-27-tutorial-corte-abarrotes-negativos',
  titulo: 'Actualización del POS',
  resumen:
    'Nuevo tutorial interactivo de Corte Abarrotes con ejemplos de negativo, Abono, Liquidar y Pagaré. Pulsa Actualizar para cargar la versión reciente.',
  cambios: [
    'Tutorial → «Corte Abarrotes y negativos» (paso a paso, pantallas, ejemplos editables y preguntas)',
    'Practica el cálculo de caja chica y el flujo DINERO EN RECUPERACIÓN en Abarrotes',
    'Regla: Pagaré solo si el negativo sigue presente en la recolección; el cajero recupera',
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
