/** Utilidades de fecha YYYY-MM-DD (zona local). */

export function toYmd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYmd(str) {
  const [y, m, d] = String(str || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function fmtFechaCalendario(ymd) {
  const d = parseYmd(ymd);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function fmtFechaCorta(ymd) {
  const d = parseYmd(ymd);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const DIAS_ES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

export const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function buildCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(toYmd(new Date(year, month, d)));
  }
  return cells;
}

export function enRangoYmd(ymd, desde, hasta) {
  if (!ymd) return false;
  if (desde && ymd < desde) return false;
  if (hasta && ymd > hasta) return false;
  return true;
}

export function filtrarFilasPorRango(rows, campo, desde, hasta) {
  if (!desde && !hasta) return rows;
  return (rows || []).filter((r) => {
    const raw = r[campo];
    if (!raw) return !desde && !hasta;
    return enRangoYmd(toYmd(raw), desde, hasta);
  });
}
