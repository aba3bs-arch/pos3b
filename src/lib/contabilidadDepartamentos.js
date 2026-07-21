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
