/**
 * Candado síncrono anti doble-clic / doble tap.
 * React `setState` es asíncrono: dos clicks seguidos pueden pasar el
 * `disabled={guardando}` antes de que el botón se deshabilite.
 */

/** @returns {{ busy: () => boolean, tryBegin: () => boolean, end: () => void, run: (fn: Function) => Promise<any> }} */
export function createSubmitLock() {
  let locked = false;
  return {
    busy() {
      return locked;
    },
    tryBegin() {
      if (locked) return false;
      locked = true;
      return true;
    },
    end() {
      locked = false;
    },
    async run(fn) {
      if (locked) return { ok: false, skipped: true, error: 'Operación en curso.' };
      locked = true;
      try {
        return await fn();
      } finally {
        locked = false;
      }
    },
  };
}
