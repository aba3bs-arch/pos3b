const RE_CHUNK = /Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk|Loading CSS chunk|Unable to preload CSS|Importing a module script failed/i;

export function esErrorCargaChunk(error) {
  return RE_CHUNK.test(String(error?.message || error || ''));
}

export function resumenErrorPantalla(error, info) {
  return {
    mensaje: String(error?.message || error || 'Error desconocido').slice(0, 400),
    stack: String(error?.stack || '').slice(0, 900),
    componentes: String(info?.componentStack || '').trim().split('\n').slice(0, 8).join('\n').slice(0, 700),
    url: typeof window !== 'undefined' ? window.location.pathname : '',
    build: String(import.meta.env?.VITE_APP_BUILD || ''),
  };
}
