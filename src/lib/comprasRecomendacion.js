/**
 * Recomendación de pedido: cuánto pedir realmente según inventario, venta diaria
 * y los días que hay que cubrir hasta la siguiente visita/entrega del proveedor.
 *
 * Regla (sin mínimos ni colchón por defecto):
 *   necesario = ceil(venta diaria × (días a cubrir + colchón))
 *   pedir     = max(0, necesario − inventario)
 *
 * Días a cubrir = días desde hoy hasta la siguiente visita del proveedor, contando hoy y el día
 * de la visita (martes → jueves = 3 días). Sin calendario de visitas se usa un valor por defecto.
 */

export const DIAS_SEMANA_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DIAS_SEMANA_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Días a cubrir cuando el proveedor no tiene calendario de visitas en la matriz de entregas. */
export const DIAS_CUBRIR_SIN_CALENDARIO = 7;

/** 1=Lun … 7=Dom */
export function etiquetaDiaSemana(dia, largo = false) {
  const i = Number(dia) - 1;
  return (largo ? DIAS_SEMANA_LARGO : DIAS_SEMANA_CORTO)[i] || '—';
}

/** 1=Lun … 7=Dom para una fecha YYYY-MM-DD (calendario local). */
export function diaSemanaDeYmd(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const w = new Date(y, m - 1, d).getDay();
  return w === 0 ? 7 : w;
}

export function sumarDiasYmd(ymd, n) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/**
 * Siguiente visita del proveedor estrictamente después de hoy.
 * @param {number[]} diasVisita días de la semana (1=Lun…7=Dom)
 * @param {number} hoyDia día de la semana de hoy (1..7)
 * @returns {{ dias: number, diaSemana: number }|null} dias = cuántos días faltan (1..7)
 */
export function diasHastaSiguienteVisita(diasVisita, hoyDia) {
  const set = new Set((diasVisita || []).map(Number).filter((d) => d >= 1 && d <= 7));
  if (!set.size || !(hoyDia >= 1 && hoyDia <= 7)) return null;
  for (let k = 1; k <= 7; k++) {
    const dia = ((hoyDia - 1 + k) % 7) + 1;
    if (set.has(dia)) return { dias: k, diaSemana: dia };
  }
  return null;
}

/**
 * @returns {{ diasACubrir: number, proximaVisita: {dias:number,diaSemana:number}|null, origen: 'calendario'|'sin_calendario' }}
 */
export function horizonteDesdeCalendario(diasVisita, hoyDia, { fallback = DIAS_CUBRIR_SIN_CALENDARIO } = {}) {
  const prox = diasHastaSiguienteVisita(diasVisita, hoyDia);
  if (!prox) return { diasACubrir: fallback, proximaVisita: null, origen: 'sin_calendario' };
  return { diasACubrir: prox.dias + 1, proximaVisita: prox, origen: 'calendario' };
}

/**
 * Días (YYYY-MM-DD) con los que se promedia la venta diaria.
 * Si el periodo tiene más de un día se excluye hoy, porque el día en curso va incompleto.
 */
export function diasParaPromedio(desdeYmd, hastaYmd, hoyYmd) {
  if (!desdeYmd || !hastaYmd || desdeYmd > hastaYmd) return [];
  const dias = [];
  for (let d = desdeYmd, guard = 0; d <= hastaYmd && guard < 400; d = sumarDiasYmd(d, 1), guard++) dias.push(d);
  if (dias.length > 1 && hoyYmd) {
    const sinHoy = dias.filter((d) => d !== hoyYmd);
    if (sinHoy.length) return sinHoy;
  }
  return dias;
}

/** Venta diaria promedio de un producto: ventasPorDiaProducto = { 'YYYY-MM-DD': piezas }. */
export function ventaDiariaPromedio(ventasPorDiaProducto, dias) {
  if (!dias?.length) return 0;
  let total = 0;
  for (const d of dias) total += Number(ventasPorDiaProducto?.[d]) || 0;
  return total / dias.length;
}

/**
 * @param {{ stock: number, ventaDiaria: number, diasACubrir: number, colchonDias?: number, sugerido?: number }} p
 * @returns {{ accion: 'pedir'|'no_pedir', pedir: number, necesario: number, diasAlcanza: number|null, sinVentas: boolean, ahorroVsSugerido: number }}
 */
export function recomendarPedido({ stock, ventaDiaria, diasACubrir, colchonDias = 0, sugerido = 0 }) {
  const inv = Math.max(0, Number(stock) || 0);
  const v = Math.max(0, Number(ventaDiaria) || 0);
  const dias = Math.max(0, Number(diasACubrir) || 0) + Math.max(0, Number(colchonDias) || 0);
  const necesario = Math.ceil(v * dias - 1e-9);
  const pedir = Math.max(0, necesario - inv);
  const sinVentas = v === 0;
  return {
    accion: pedir > 0 ? 'pedir' : 'no_pedir',
    pedir,
    necesario,
    diasAlcanza: sinVentas ? null : inv / v,
    sinVentas,
    ahorroVsSugerido: Math.max(0, (Number(sugerido) || 0) - pedir),
  };
}

/** Texto corto para la celda de la columna «Recomendación». */
export function textoRecomendacion(rec) {
  if (!rec) return { principal: '—', detalle: '' };
  if (rec.accion === 'pedir') {
    return { principal: `PEDIR ${rec.pedir}`, detalle: rec.diasAlcanza == null ? '' : `alcanza ${formatoDias(rec.diasAlcanza)}` };
  }
  return {
    principal: 'NO PEDIR',
    detalle: rec.sinVentas ? 'sin ventas' : `alcanza ${formatoDias(rec.diasAlcanza)}`,
  };
}

function formatoDias(d) {
  if (d == null) return '';
  if (d < 1) return '< 1 día';
  const n = Math.floor(d);
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}
