/** Semana de nómina: sábado → viernes (calendario local, no UTC). */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD en zona horaria local (evita el desfase de toISOString en México). */
export function ymdLocal(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Periodo sáb–vie que contiene `fecha` (por defecto hoy).
 * @returns {{ inicio: string, fin: string }}
 */
export function periodoSemanaNomina(fecha = new Date()) {
  const d = new Date(fecha);
  d.setHours(12, 0, 0, 0); // mediodía local: evita bordes DST
  const day = d.getDay(); // 0=dom … 6=sáb
  const daysSinceSat = (day + 1) % 7;
  const inicio = new Date(d);
  inicio.setDate(d.getDate() - daysSinceSat);
  inicio.setHours(12, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  return {
    inicio: ymdLocal(inicio),
    fin: ymdLocal(fin),
  };
}

/** Alias explícito. */
export function semanaNomina(fecha = new Date()) {
  return periodoSemanaNomina(fecha);
}

export function etiquetaSemanaNomina(inicio, fin) {
  return `${inicio} (sáb) — ${fin} (vie)`;
}

/** ¿El rango coincide con la semana de nómina del calendario (hoy)? */
export function esSemanaNominaActual(inicio, fin, fecha = new Date()) {
  const s = periodoSemanaNomina(fecha);
  return String(inicio || '') === s.inicio && String(fin || '') === s.fin;
}
