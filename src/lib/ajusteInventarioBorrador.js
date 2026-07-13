const LS_KEY = 'pos3b_ajustes_inventario_espera';

function leerTodos() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarTodos(arr) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(0, 30)));
  } catch {
    /* quota / privado */
  }
}

/** Id estable para autosave por tipo + tienda (sobrescribe el mismo borrador). */
export function idAutoBorrador(tipo, sucursal) {
  const t = String(tipo || 'departamento').trim() || 'departamento';
  const s = String(sucursal || 'MAIN').trim().toUpperCase() || 'MAIN';
  return `auto-${t}-${s}`;
}

export function listarAjustesEnEspera(sucursal) {
  const all = leerTodos();
  if (!sucursal) return all;
  return all.filter((a) => !a.sucursal || a.sucursal === sucursal);
}

export function guardarAjusteEnEspera(draft) {
  if (!draft) return null;
  const all = leerTodos();
  const id = draft.id || `espera-${Date.now()}`;
  const next = {
    id,
    tipo: draft.tipo || 'departamento',
    titulo: draft.titulo || 'Ajuste en espera',
    departamento: draft.departamento || null,
    departamentos: Array.isArray(draft.departamentos) ? draft.departamentos : [],
    conteos: draft.conteos && typeof draft.conteos === 'object' ? draft.conteos : {},
    ordenIds: Array.isArray(draft.ordenIds) ? draft.ordenIds : [],
    lineasMasivas: Array.isArray(draft.lineasMasivas) ? draft.lineasMasivas : [],
    indiceActual: Number(draft.indiceActual) || 0,
    sucursal: draft.sucursal || null,
    usuario: draft.usuario || null,
    auto: Boolean(draft.auto),
    savedAt: Date.now(),
  };
  const idx = all.findIndex((a) => a.id === id);
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  guardarTodos(all);
  return next;
}

export function leerAjusteEnEspera(id) {
  return leerTodos().find((a) => a.id === id) || null;
}

export function leerBorradorAuto(tipo, sucursal) {
  return leerAjusteEnEspera(idAutoBorrador(tipo, sucursal));
}

export function eliminarAjusteEnEspera(id) {
  guardarTodos(leerTodos().filter((a) => a.id !== id));
}

export function limpiarAjustesEnEspera() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

/** ¿Vale la pena restaurar? Hay al menos un conteo / línea capturada. */
export function borradorTieneDatos(draft) {
  if (!draft) return false;
  const conteos = draft.conteos && typeof draft.conteos === 'object' ? Object.keys(draft.conteos) : [];
  if (conteos.length > 0) return true;
  if (Array.isArray(draft.ordenIds) && draft.ordenIds.length > 0) return true;
  if (Array.isArray(draft.lineasMasivas) && draft.lineasMasivas.length > 0) return true;
  return false;
}
