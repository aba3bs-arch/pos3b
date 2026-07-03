const LS_BORRADOR = 'pos3b_nomina_borrador';

export function leerBorradorNomina() {
  try {
    const raw = localStorage.getItem(LS_BORRADOR);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

export function guardarBorradorNomina(draft) {
  if (!draft) return;
  try {
    localStorage.setItem(
      LS_BORRADOR,
      JSON.stringify({
        ...draft,
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
