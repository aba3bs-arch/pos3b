/** Helpers de la barra de periodo (IE Abarrotes · panorama). */

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Color de la barra según ganancia neta del panorama.
 * Negativo → rojo; cerca de cero → naranja; positivo → verde.
 */
export function colorEstadoPanorama(neta) {
  const n = Number(neta) || 0;
  if (n < -0.01) return { fill: 'linear-gradient(90deg, #b71c1c 0%, #e53935 55%, #ef6c00 100%)', label: 'En negativo' };
  if (n > 0.01) return { fill: 'linear-gradient(90deg, #ef6c00 0%, #7cb342 45%, #2e7d32 100%)', label: 'En positivo' };
  return { fill: 'linear-gradient(90deg, #ef6c00 0%, #fb8c00 100%)', label: 'En equilibrio' };
}

/** @deprecated Preferir colorEstadoPanorama; se mantiene por compat de tests antiguos. */
export function colorProgresoDia(indice0, totalDias) {
  const t = totalDias <= 1 ? 1 : indice0 / (totalDias - 1);
  const stops = [
    { t: 0, r: 198, g: 40, b: 40 },
    { t: 0.45, r: 239, g: 108, b: 0 },
    { t: 1, r: 46, g: 125, b: 50 },
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const span = b.t - a.t || 1;
  const u = (t - a.t) / span;
  const r = Math.round(a.r + (b.r - a.r) * u);
  const g = Math.round(a.g + (b.g - a.g) * u);
  const bl = Math.round(a.b + (b.b - a.b) * u);
  return `rgb(${r},${g},${bl})`;
}

export function ymdDiaMes(anio, mes0, dia) {
  const m = String(mes0 + 1).padStart(2, '0');
  const d = String(dia).padStart(2, '0');
  return `${anio}-${m}-${d}`;
}

export function diasEnMes(anio, mes0) {
  return new Date(anio, mes0 + 1, 0).getDate();
}

/** Porcentaje 0–100 del avance del mes hasta “hoy” (o mes completo si ya pasó). */
export function pctProgresoMes(anio, mes0, yHoy, mHoy1, dHoy) {
  const total = diasEnMes(anio, mes0);
  const esFuturo = anio > yHoy || (anio === yHoy && mes0 + 1 > mHoy1);
  if (esFuturo) return 0;
  const esActual = yHoy === anio && mHoy1 === mes0 + 1;
  const dia = esActual ? Math.min(dHoy, total) : total;
  return total <= 0 ? 0 : Math.round((dia / total) * 1000) / 10;
}

export function etiquetaPeriodoDias(anio, mes0, seleccion) {
  const mesNom = MESES_ES[mes0] || '';
  if (!seleccion) {
    const fin = diasEnMes(anio, mes0);
    return `1 – ${fin} ${mesNom} ${anio}`;
  }
  const { start, end } = seleccion;
  if (start === end) return `${start} ${mesNom} ${anio}`;
  return `${start} – ${end} ${mesNom} ${anio}`;
}

export function normalizarSeleccionDias(start, end, maxDia) {
  let a = Math.max(1, Math.min(Number(start) || 1, maxDia));
  let b = Math.max(1, Math.min(Number(end) || a, maxDia));
  if (a > b) [a, b] = [b, a];
  return { start: a, end: b };
}
