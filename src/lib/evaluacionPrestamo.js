/** Mínimo para dar visto bueno y pasar el préstamo a ABB o FJBB. */
export const MINIMO_VISTO_BUENO = 85;

/** Cada factor vale igual. Excelente 100, Buena 80, Deficiente o Por mejorar 40. */
export const PUNTAJE_EVALUACION = {
  excelente: 100,
  buena: 80,
  deficiente: 40,
  por_mejorar: 40,
};

const OPCION_EXCELENTE = { id: 'excelente', label: 'Excelente' };
const OPCION_BUENA = { id: 'buena', label: 'Buena' };
const OPCION_DEFICIENTE = { id: 'deficiente', label: 'Deficiente' };
const OPCION_POR_MEJORAR = { id: 'por_mejorar', label: 'Por mejorar' };

export const FACTORES_EVALUACION_PRESTAMO = [
  {
    id: 'puntualidad',
    label: 'Puntualidad y asistencia',
    opciones: [OPCION_EXCELENTE, OPCION_BUENA, OPCION_DEFICIENTE],
  },
  {
    id: 'atencion',
    label: 'Atención al cliente',
    opciones: [OPCION_EXCELENTE, OPCION_BUENA, OPCION_POR_MEJORAR],
  },
  {
    id: 'operacion',
    label: 'Operación',
    opciones: [OPCION_EXCELENTE, OPCION_BUENA, OPCION_POR_MEJORAR],
  },
  {
    id: 'valores',
    label: 'Valores',
    opciones: [OPCION_EXCELENTE, OPCION_BUENA, OPCION_DEFICIENTE],
  },
  {
    id: 'inventarios',
    label: 'Inventarios',
    opciones: [OPCION_EXCELENTE, OPCION_BUENA, OPCION_DEFICIENTE],
  },
];

export function etiquetaOpcionEvaluacion(opcionId) {
  const id = String(opcionId || '');
  for (const factor of FACTORES_EVALUACION_PRESTAMO) {
    const hit = factor.opciones.find((o) => o.id === id);
    if (hit) return hit.label;
  }
  return '';
}

export function leerEvaluacionPrestamo(raw) {
  if (!raw) return null;
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const factores = data.factores && typeof data.factores === 'object' ? data.factores : null;
  if (!factores) return null;
  const cal = calificarEvaluacionPrestamo(factores);
  return {
    ...cal,
    porcentaje: Number.isFinite(Number(data.porcentaje)) ? Number(data.porcentaje) : cal.porcentaje,
  };
}

/**
 * Promedio de los 5 factores. Sin las 5 calificaciones, no aprueba.
 * @returns {{ factores: object, porcentaje: number, completo: boolean, aprobado: boolean }}
 */
export function calificarEvaluacionPrestamo(respuestas = {}) {
  const factores = {};
  let suma = 0;
  let completo = true;
  for (const factor of FACTORES_EVALUACION_PRESTAMO) {
    const opcion = String(respuestas?.[factor.id] || '');
    const puntos = PUNTAJE_EVALUACION[opcion];
    const valida = factor.opciones.some((o) => o.id === opcion) && Number.isFinite(puntos);
    if (!valida) completo = false;
    else suma += puntos;
    factores[factor.id] = valida ? opcion : '';
  }
  const porcentaje = completo
    ? Math.round((suma / FACTORES_EVALUACION_PRESTAMO.length) * 10) / 10
    : 0;
  return {
    factores,
    porcentaje,
    completo,
    aprobado: completo && porcentaje + 0.001 >= MINIMO_VISTO_BUENO,
  };
}

export function textoEvaluacionPrestamo(evaluacion) {
  const ev = leerEvaluacionPrestamo(evaluacion) || evaluacion;
  if (!ev?.factores) return '';
  const lineas = FACTORES_EVALUACION_PRESTAMO.map((f) => {
    const etiqueta = etiquetaOpcionEvaluacion(ev.factores[f.id]);
    return etiqueta ? `${f.label}: ${etiqueta}` : null;
  }).filter(Boolean);
  const pct = Number(ev.porcentaje);
  const cabeza = Number.isFinite(pct) ? `Evaluación ${pct}%` : 'Evaluación';
  return [cabeza, ...lineas].join('\n');
}
