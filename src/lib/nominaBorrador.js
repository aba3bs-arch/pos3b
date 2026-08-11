const LS_BORRADOR = 'pos3b_nomina_borrador';

export function leerBorradorNomina() {
  try {
    const raw = localStorage.getItem(LS_BORRADOR);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return {
      ...o,
      lineas: Array.isArray(o.lineas) ? o.lineas : [],
      excluidos: Array.isArray(o.excluidos) ? o.excluidos : [],
    };
  } catch {
    return null;
  }
}

/**
 * Guarda el borrador. No reemplaza un borrador con líneas por uno vacío del mismo periodo.
 */
export function guardarBorradorNomina(draft) {
  if (!draft) return;
  try {
    const prev = leerBorradorNomina();
    const mismoPeriodo = prev && prev.inicio === draft.inicio && prev.fin === draft.fin;
    const nuevasVacias = !Array.isArray(draft.lineas) || draft.lineas.length === 0;
    if (mismoPeriodo && nuevasVacias && prev.lineas?.length) {
      return;
    }
    localStorage.setItem(
      LS_BORRADOR,
      JSON.stringify({
        ...draft,
        lineas: Array.isArray(draft.lineas) ? draft.lineas : [],
        excluidos: Array.isArray(draft.excluidos) ? draft.excluidos : [],
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* quota / privado */
  }
}

export function limpiarBorradorNomina() {
  try {
    localStorage.removeItem(LS_BORRADOR);
  } catch {
    /* ignore */
  }
}
