/**
 * Limpia caché y datos temporales del navegador sin borrar configuración del POS.
 */

/** Claves que NO se eliminan (tienda, config, turnos, branding, privilegios). */
const CLAVES_PRESERVAR = new Set([
  'pos3b_sucursal',
  'pos3b_tienda_bloqueada',
  'pos3b_sucursales_extra',
  'pos3b_tipo_cambio',
  'pos3b_metodos_pago',
  'pos3b_perifericos',
  'pos3b_config_impresion',
  'pos3b_config_audio',
  'pos3b_privilegios',
  'pos3b_turnos_caja',
  'pos3b_tipo_horario',
  'pos3b_patrones_rotacion_3',
  'pos3b_tolerancia_turnos',
  'pos3b_negocio',
  'pos3b_ticket_footer',
  'pos3b_logo_url',
  'pos3b_departamentos_extra',
  'pos3b_nomina_sueldos_default',
]);

function debePreservar(clave) {
  if (CLAVES_PRESERVAR.has(clave)) return true;
  return false;
}

function esTemporalPos3b(clave) {
  return clave.startsWith('pos3b_') && !debePreservar(clave);
}

/**
 * Elimina datos locales temporales (cortes en caché, movimientos, contabilidad offline, etc.).
 * @returns {Promise<{ claves: number, bytes: number, session: number, caches: number, detalle: string[] }>}
 */
export async function limpiarCacheTemporal() {
  const detalle = [];
  let bytes = 0;
  let claves = 0;

  for (const key of Object.keys(localStorage)) {
    if (!esTemporalPos3b(key)) continue;
    const val = localStorage.getItem(key);
    bytes += (val?.length || 0) * 2;
    localStorage.removeItem(key);
    claves += 1;
    detalle.push(key);
  }

  const session = sessionStorage.length;
  sessionStorage.clear();

  let cachesLimpiadas = 0;
  if (typeof window !== 'undefined' && window.caches?.keys) {
    try {
      const nombres = await window.caches.keys();
      const resultados = await Promise.all(nombres.map((n) => window.caches.delete(n)));
      cachesLimpiadas = resultados.filter(Boolean).length;
    } catch {
      /* ignorar si el navegador bloquea caches */
    }
  }

  return { claves, bytes, session, caches: cachesLimpiadas, detalle };
}

export function formatoBytesAprox(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const TEXTO_AYUDA_LIMPIEZA =
  'Se borran copias locales temporales (cortes en caché, movimientos, ajustes, datos offline de contabilidad). ' +
  'No se borran: tienda activa, tipo de cambio, turnos, impresión, branding ni privilegios. ' +
  'La sesión actual se mantiene; se recomienda recargar la página después.';
