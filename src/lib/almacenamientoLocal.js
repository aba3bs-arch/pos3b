/**
 * Escritura segura en localStorage para borradores que no se pueden perder (conteos de inventario).
 * Si el equipo se queda sin espacio (cuota), libera cachés que se regeneran solas y reintenta.
 */

const PREFIJOS_REGENERABLES = ['pos3b_catalogo_offline_'];

export function esErrorCuota(err) {
  const name = String(err?.name || '');
  const msg = String(err?.message || err || '');
  return (
    name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || /quota|exceeded/i.test(msg)
  );
}

function liberarCachesRegenerables(storage) {
  let liberadas = 0;
  const claves = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k && PREFIJOS_REGENERABLES.some((p) => k.startsWith(p))) claves.push(k);
  }
  for (const k of claves) {
    try {
      storage.removeItem(k);
      liberadas += 1;
    } catch {
      /* ignore */
    }
  }
  return liberadas;
}

/** @returns {{ ok: boolean, liberadas: number, error?: string }} */
export function guardarLocalSeguro(clave, valor, storage = globalThis.localStorage) {
  if (!storage) return { ok: false, liberadas: 0, error: 'sin almacenamiento' };
  try {
    storage.setItem(clave, valor);
    return { ok: true, liberadas: 0 };
  } catch (err) {
    if (!esErrorCuota(err)) return { ok: false, liberadas: 0, error: String(err?.message || err) };
    const liberadas = liberarCachesRegenerables(storage);
    try {
      storage.setItem(clave, valor);
      return { ok: true, liberadas };
    } catch (err2) {
      return { ok: false, liberadas, error: String(err2?.message || err2) };
    }
  }
}
