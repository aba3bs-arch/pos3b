/**
 * Almacenamiento del carrito en curso: localStorage con respaldo en sessionStorage.
 * Si localStorage está lleno (catálogo offline, fotos) el guardado ya no falla en silencio.
 */

export function leerCarritoAlmacenado(clave) {
  if (!clave) return null;
  for (const area of ['localStorage', 'sessionStorage']) {
    try {
      const raw = globalThis[area]?.getItem(clave);
      if (raw) return raw;
    } catch {
      /* siguiente área */
    }
  }
  return null;
}

export function borrarCarritoAlmacenado(clave) {
  if (!clave) return;
  for (const area of ['localStorage', 'sessionStorage']) {
    try {
      globalThis[area]?.removeItem(clave);
    } catch {
      /* ignore */
    }
  }
}

/** @returns {boolean} true si quedó guardado en alguna de las dos áreas. */
export function guardarCarritoAlmacenado(clave, texto) {
  if (!clave) return false;
  try {
    localStorage.setItem(clave, texto);
    try {
      sessionStorage.removeItem(clave);
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    /* cuota llena: respaldo en sessionStorage */
  }
  try {
    sessionStorage.setItem(clave, texto);
    return true;
  } catch {
    return false;
  }
}

/** Foto ligera para persistir: nunca data: URI ni URLs largas (llenan la cuota). */
export function fotoLigeraParaCarrito(url) {
  const s = typeof url === 'string' ? url.trim() : '';
  if (!s || s.startsWith('data:') || s.length > 500) return null;
  return s;
}
