/**
 * Ventana horaria de recolecciones de efectivo (hora América/Hermosillo).
 * Por defecto 08:00–20:00; ajustable desde Configuración.
 */
export const TZ_RECOLECCION = 'America/Hermosillo';
/** Defaults alineados a operación normal (8 am – 8 pm). */
export const HORA_INICIO_RECOLECCION_DEFAULT = 8;
export const HORA_FIN_RECOLECCION_DEFAULT = 20;

const LS_VENTANA = 'pos3b_ventana_recoleccion';
export const EVENTO_VENTANA_RECOLECCION = 'pos3b-ventana-recoleccion-updated';

function clampHora(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(23, Math.max(0, Math.floor(v)));
}

export function leerVentanaRecoleccion() {
  try {
    const raw = localStorage.getItem(LS_VENTANA);
    if (raw) {
      const j = JSON.parse(raw);
      let horaInicio = clampHora(j?.horaInicio, HORA_INICIO_RECOLECCION_DEFAULT);
      let horaFin = clampHora(j?.horaFin, HORA_FIN_RECOLECCION_DEFAULT);
      if (horaFin <= horaInicio) {
        horaInicio = HORA_INICIO_RECOLECCION_DEFAULT;
        horaFin = HORA_FIN_RECOLECCION_DEFAULT;
      }
      return { horaInicio, horaFin };
    }
  } catch {
    /* ignore */
  }
  return { horaInicio: HORA_INICIO_RECOLECCION_DEFAULT, horaFin: HORA_FIN_RECOLECCION_DEFAULT };
}

export function guardarVentanaRecoleccion({ horaInicio, horaFin } = {}) {
  let hi = clampHora(horaInicio, HORA_INICIO_RECOLECCION_DEFAULT);
  let hf = clampHora(horaFin, HORA_FIN_RECOLECCION_DEFAULT);
  if (hf <= hi) {
    throw new Error('La hora de fin debe ser mayor que la de inicio (ej. 8 y 20).');
  }
  const payload = { horaInicio: hi, horaFin: hf };
  localStorage.setItem(LS_VENTANA, JSON.stringify(payload));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_VENTANA_RECOLECCION, { detail: payload }));
  }
  return payload;
}

export function etiquetaVentanaRecoleccion(cfg = leerVentanaRecoleccion()) {
  const hi = String(cfg.horaInicio).padStart(2, '0');
  const hf = String(cfg.horaFin).padStart(2, '0');
  return `${hi}:00 – ${hf}:00`;
}

/** Compat: lectura puntual de horarios actuales. */
export const HORA_INICIO_RECOLECCION = HORA_INICIO_RECOLECCION_DEFAULT;
export const HORA_FIN_RECOLECCION = HORA_FIN_RECOLECCION_DEFAULT;

export function horaLocalRecoleccion(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ_RECOLECCION,
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    let h = Number(parts.find((p) => p.type === 'hour')?.value);
    if (h === 24) h = 0;
    return Number.isFinite(h) ? h : date.getHours();
  } catch {
    return date.getHours();
  }
}

/** true si está dentro de [horaInicio, horaFin). */
export function ventanaRecoleccionAbierta(date = new Date()) {
  const { horaInicio, horaFin } = leerVentanaRecoleccion();
  const h = horaLocalRecoleccion(date);
  return h >= horaInicio && h < horaFin;
}

export function mensajeVentanaRecoleccionCerrada(date = new Date()) {
  const { horaInicio, horaFin } = leerVentanaRecoleccion();
  const h = horaLocalRecoleccion(date);
  return (
    `Ventana de recolección: ${String(horaInicio).padStart(2, '0')}:00 a ` +
    `${String(horaFin).padStart(2, '0')}:00 (hora Sonora). ` +
    `Ahora son las ${String(h).padStart(2, '0')}:xx. ` +
    `Fuera de horario no se registran cobros de efectivo; sí se puede continuar con traspasos a crédito / reparto.`
  );
}

/**
 * @returns {{ abierta: boolean, hora: number, horaInicio: number, horaFin: number, etiqueta: string, mensaje: string|null }}
 */
export function estadoVentanaRecoleccion(date = new Date()) {
  const cfg = leerVentanaRecoleccion();
  const abierta = ventanaRecoleccionAbierta(date);
  return {
    abierta,
    hora: horaLocalRecoleccion(date),
    horaInicio: cfg.horaInicio,
    horaFin: cfg.horaFin,
    etiqueta: etiquetaVentanaRecoleccion(cfg),
    mensaje: abierta ? null : mensajeVentanaRecoleccionCerrada(date),
  };
}
