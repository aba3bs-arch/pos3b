/**
 * Limpia datos temporales del POS en localStorage sin cerrar sesión ni borrar la app del navegador.
 */

export const EVENTO_CACHE_LIMPIADO = 'pos3b-cache-limpiado';

/** Claves que NO se eliminan (tienda, config, turnos, branding, privilegios, equipo). */
const CLAVES_PRESERVAR = new Set([
  'pos3b_sucursal',
  'pos3b_tienda_bloqueada',
  'pos3b_sucursales_extra',
  'pos3b_tipo_cambio',
  'pos3b_tipo_cambio_updated_at',
  'pos3b_metodos_pago',
  'pos3b_perifericos',
  'pos3b_config_impresion',
  'pos3b_config_audio',
  'pos3b_privilegios',
  'pos3b_turnos_caja',
  'pos3b_tipo_horario',
  'pos3b_patrones_rotacion_3',
  'pos3b_tolerancia_turnos',
  'pos3b_autorizacion_turno_fh',
  'pos3b_negocio',
  'pos3b_ticket_footer',
  'pos3b_logo_url',
  'pos3b_departamentos_extra',
  'pos3b_nomina_sueldos_default',
  'pos3b_nomina_salario_dia',
  'pos3b_nomina_borrador',
  'pos3b_nomina_saldos_arrastre',
  'pos3b_vales_categorias_extra',
  'pos3b_dispositivo_id',
  'pos3b_ajustes_inventario_espera',
  'pos3b_ajuste_libre_prefs',
  'pos3b_vales_tiendas_permitidas',
  'pos3b_anuncios_pos',
  'pos3b_ventana_recoleccion',
  'pos3b_cont_virtual_catalogo',
  'pos3b_cont_virtual_egresos',
]);


/** sessionStorage temporal (no afecta la sesión de PIN en memoria). */
const SESSION_TEMPORAL = new Set(['pos3b_anuncios_vistos']);

function debePreservar(clave) {
  if (CLAVES_PRESERVAR.has(clave)) return true;
  return false;
}

function esTemporalPos3b(clave) {
  return clave.startsWith('pos3b_') && !debePreservar(clave);
}

/**
 * Elimina datos locales temporales y la Cache API del navegador (JS/CSS viejos).
 * Fuerza recarga para que el celular/PC tome el build nuevo de Netlify.
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

  let session = 0;
  for (const key of [...SESSION_TEMPORAL]) {
    if (!sessionStorage.getItem(key)) continue;
    sessionStorage.removeItem(key);
    session += 1;
    detalle.push(`session:${key}`);
  }

  let cachesBorrados = 0;
  try {
    if (typeof caches !== 'undefined' && caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(async (k) => {
          await caches.delete(k);
          cachesBorrados += 1;
          detalle.push(`cache:${k}`);
        }),
      );
    }
  } catch {
    /* ignore */
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(EVENTO_CACHE_LIMPIADO, { detail: { claves, bytes, session, cachesBorrados } }),
    );
  }

  return { claves, bytes, session, cachesBorrados, detalle, recargar: true };
}

export function formatoBytesAprox(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const TEXTO_AYUDA_LIMPIEZA =
  'Se borran copias locales temporales y caché del navegador, y la pantalla se recarga para cargar la versión nueva. ' +
  'No se borran: tienda activa, tipo de cambio, turnos, impresión, branding, privilegios ni vínculo del equipo.';
