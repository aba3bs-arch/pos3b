import { useEffect, useRef } from 'react';

/**
 * Guarda un borrador al cambiar datos y al salir de la pestaña (llamada, app switch, etc.).
 * `getDraft` debe devolver el objeto a persistir o null si no hay nada que guardar.
 */
export function useAutoGuardarBorrador(getDraft, guardarFn, { enabled = true, debounceMs = 400 } = {}) {
  const getDraftRef = useRef(getDraft);
  const guardarRef = useRef(guardarFn);
  getDraftRef.current = getDraft;
  guardarRef.current = guardarFn;

  useEffect(() => {
    if (!enabled) return undefined;

    let timer = null;
    const flush = () => {
      try {
        const draft = getDraftRef.current?.();
        if (draft) guardarRef.current?.(draft);
      } catch {
        /* ignore */
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    };

    schedule();

    const onHide = () => {
      if (timer) clearTimeout(timer);
      flush();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide();
    };

    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (timer) clearTimeout(timer);
      flush();
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, debounceMs]);
}
