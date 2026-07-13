/**
 * Ventana horaria de recolecciones de efectivo (hora América/Hermosillo).
 * Abierta de 09:00 a 19:59; cerrada desde las 20:00 hasta las 08:59.
 */
export const TZ_RECOLECCION = 'America/Hermosillo';
export const HORA_INICIO_RECOLECCION = 9;
export const HORA_FIN_RECOLECCION = 20;

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

/** true si está dentro de [9:00, 20:00). */
export function ventanaRecoleccionAbierta(date = new Date()) {
  const h = horaLocalRecoleccion(date);
  return h >= HORA_INICIO_RECOLECCION && h < HORA_FIN_RECOLECCION;
}

export function mensajeVentanaRecoleccionCerrada(date = new Date()) {
  const h = horaLocalRecoleccion(date);
  return (
    `Ventana de recolección: ${String(HORA_INICIO_RECOLECCION).padStart(2, '0')}:00 a ` +
    `${String(HORA_FIN_RECOLECCION).padStart(2, '0')}:00 (hora Sonora). ` +
    `Ahora son las ${String(h).padStart(2, '0')}:xx. ` +
    `Fuera de horario no se registran cobros de efectivo; sí se puede continuar con traspasos a crédito / reparto.`
  );
}

/**
 * @returns {{ abierta: boolean, hora: number, mensaje: string|null }}
 */
export function estadoVentanaRecoleccion(date = new Date()) {
  const abierta = ventanaRecoleccionAbierta(date);
  return {
    abierta,
    hora: horaLocalRecoleccion(date),
    mensaje: abierta ? null : mensajeVentanaRecoleccionCerrada(date),
  };
}
