/**
 * Propietarios / departamentos de contabilidad.
 * Francisco → Abarrotes (libro propio).
 * Antonio → Virtual + Garage (IE VIRTUAL).
 */

export const PROPIETARIOS_CONTABILIDAD = {
  francisco: {
    id: 'francisco',
    etiqueta: 'Francisco',
    modulos: ['abarrotes'],
    libroId: 'abarrotes',
    vista: 'IE ABARROTES',
  },
  antonio: {
    id: 'antonio',
    etiqueta: 'Antonio',
    modulos: ['virtual', 'garage'],
    libroId: 'virtual',
    vista: 'IE VIRTUAL',
  },
};

export const MODULOS_IE_VIRTUAL = ['virtual', 'garage'];
export const MODULOS_IE_ABARROTES = ['abarrotes'];

export const LIBRO_IE_ANTONIO = 'antonio';
export const LIBRO_IE_FRANCISCO = 'francisco';

export function propietarioDeModulo(modulo) {
  const m = String(modulo || '').toLowerCase();
  if (m === 'abarrotes') return PROPIETARIOS_CONTABILIDAD.francisco;
  if (m === 'virtual' || m === 'garage') return PROPIETARIOS_CONTABILIDAD.antonio;
  return null;
}

/** Módulo de corte para un gasto de cuenta RT (Francisco/Andrés). */
export function moduloCorteDesdeCuentaRt(cuentaRtId) {
  const id = String(cuentaRtId || '').toLowerCase();
  if (id === 'francisco') return 'abarrotes';
  // Andrés y demás → lado Antonio (Virtual)
  return 'virtual';
}

/**
 * Gastos pagados desde la cuenta RT de Francisco.
 * Incluye filas viejas mal guardadas con modulo=virtual (antes de separar libros).
 */
export function gastoEsCuentaRtFrancisco(gasto) {
  if (!gasto) return false;
  const sub = String(gasto.subcategoria || '').toUpperCase();
  const com = String(gasto.comentario || '').toLowerCase();
  const user = String(gasto.usuario_nombre || '').toLowerCase();
  const esRt = sub.includes('CUENTA RT') || /cuenta\s*rt/.test(com);
  if (!esRt) return false;
  return user.includes('francisco') || com.includes('cuenta rt francisco') || com.includes('rt francisco');
}

/** Corrige en BD gastos RT Francisco que aún están en modulo virtual. */
export async function reclasificarGastosRtFranciscoAAbarrotes(supabase, gastos = []) {
  if (!supabase) return { ok: true, count: 0 };
  const ids = (gastos || [])
    .filter((g) => gastoEsCuentaRtFrancisco(g) && String(g.modulo || '').toLowerCase() !== 'abarrotes')
    .map((g) => g.id)
    .filter(Boolean);
  if (!ids.length) return { ok: true, count: 0 };
  const { error } = await supabase.from('cortes_contabilidad_gastos').update({ modulo: 'abarrotes' }).in('id', ids);
  if (error) return { ok: false, error: error.message, count: 0 };
  return { ok: true, count: ids.length };
}
