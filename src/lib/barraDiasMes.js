/** Helpers de la barra día a día (IE Abarrotes). */

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Color del progreso del mes: rojo (inicio) → naranja → verde (fin). */
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

export function etiquetaPeriodoDias(anio, mes0, seleccion) {
  const mesNom = MESES_ES[mes0] || '';
  if (!seleccion) {
    const fin = new Date(anio, mes0 + 1, 0).getDate();
    return `1 – ${fin} ${mesNom} ${anio}`;
  }
  const { start, end } = seleccion;
  if (start === end) return `${start} ${mesNom} ${anio}`;
  return `${start} – ${end} ${mesNom} ${anio}`;
}
