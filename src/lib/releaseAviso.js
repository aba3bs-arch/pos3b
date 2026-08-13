/**
 * Aviso de cambios de versión (local).
 * Se muestra a todos los usuarios aunque version.json / Netlify no disparen el overlay de build.
 * Cambia `id` en cada release importante para volver a notificar.
 */
export const RELEASE_AVISO_ACTUAL = {
  id: '2026-08-13-vales-rif-prestamos-nomina',
  titulo: 'Actualización del POS',
  resumen:
    'Hay cambios nuevos. Pulsa Actualizar para cargar la versión reciente (limpia caché y recarga).',
  cambios: [
    'Vales: solo botón Eliminar en el listado',
    'RIF: Abonar / Liquidar; abono parcial pide nueva promesa; Imprimir RIF',
    'Préstamos empleados: cuota semanal $500 (o resto) se descuenta en Contabilidad → Nómina',
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
