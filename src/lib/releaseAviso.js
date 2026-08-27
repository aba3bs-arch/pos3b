/**
 * Aviso de cambios de versión (local).
 * Se muestra a todos los usuarios aunque version.json / Netlify no disparen el overlay de build.
 * Cambia `id` en cada release importante para volver a notificar.
 */
export const RELEASE_AVISO_ACTUAL = {
  id: '2026-08-27-tutorial-cobrar-rif-mercancia',
  titulo: 'Actualización del POS',
  resumen:
    'Nuevo tutorial de cobro y RIF para comprar mercancía en la misma tienda. Pulsa Actualizar para cargar la versión reciente.',
  cambios: [
    'Tutorial → «Cómo cobrar en el POS» (efectivo MXN/USD y tarjeta, con pantallas reales)',
    'Vales y Préstamos → RIF → botón «Misma tienda · compra mercancía» (fondo para mercancía en tu tienda)',
    'RIF entre tiendas sigue igual; elige el tipo arriba del formulario',
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
