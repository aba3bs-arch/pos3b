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

/** Un producto es de alta frecuencia si vende en al menos este porcentaje de los días del periodo. */
export const UMBRAL_ALTA_FRECUENCIA = 0.7;
/** Con menos días de periodo no se marca ningún producto (un solo día no dice nada de frecuencia). */
export const MIN_DIAS_PARA_FRECUENCIA = 3;

/**
 * Frecuencia de venta de un producto en los días del periodo (los mismos que se usan para el promedio).
 * @returns {{ diasConVenta: number, diasTotal: number, ratio: number, ventaDiaria: number, altaFrecuencia: boolean }}
 */
export function frecuenciaVentas(ventasPorDiaProducto, dias) {
  const diasTotal = dias?.length || 0;
  let diasConVenta = 0;
  let total = 0;
  for (const d of dias || []) {
    const q = Number(ventasPorDiaProducto?.[d]) || 0;
    if (q > 0) diasConVenta += 1;
    total += q;
  }
  const ratio = diasTotal ? diasConVenta / diasTotal : 0;
  return {
    diasConVenta,
    diasTotal,
    ratio,
    ventaDiaria: diasTotal ? total / diasTotal : 0,
    altaFrecuencia: diasTotal >= MIN_DIAS_PARA_FRECUENCIA && ratio >= UMBRAL_ALTA_FRECUENCIA,
  };
}

export const ORDENES_COMPRA = [
  { id: 'frecuencia', label: '★ Alta frecuencia primero' },
  { id: 'pedir', label: 'Por pedir primero' },
  { id: 'nombre', label: 'Nombre (A–Z)' },
];

/**
 * Ordena líneas de compra (estable, no muta el arreglo).
 * @param {Array<{id: string|number, nombre?: string}>} lineas
 * @param {Record<string, {altaFrecuencia:boolean, ventaDiaria:number, ratio:number}>} metricas por id
 * @param {Record<string, {pedir:number}>} recomendaciones por id
 */
export function ordenarLineasCompra(lineas, { modo = 'frecuencia', metricas = {}, recomendaciones = {} } = {}) {
  const nombre = (l) => String(l.nombre || l.id || '');
  const porNombre = (a, b) => nombre(a).localeCompare(nombre(b), 'es', { sensitivity: 'base' });
  const m = (l) => metricas[l.id] || { altaFrecuencia: false, ventaDiaria: 0, ratio: 0 };
  const porFrecuencia = (a, b) => {
    const A = m(a);
    const B = m(b);
    if (A.altaFrecuencia !== B.altaFrecuencia) return A.altaFrecuencia ? -1 : 1;
    if (B.ventaDiaria !== A.ventaDiaria) return B.ventaDiaria - A.ventaDiaria;
    if (B.ratio !== A.ratio) return B.ratio - A.ratio;
    return porNombre(a, b);
  };
  const copia = [...lineas];
  if (modo === 'nombre') return copia.sort(porNombre);
  if (modo === 'pedir') {
    return copia.sort((a, b) => {
      const pa = recomendaciones[a.id]?.pedir || 0;
      const pb = recomendaciones[b.id]?.pedir || 0;
      if ((pa > 0) !== (pb > 0)) return pa > 0 ? -1 : 1;
      return porFrecuencia(a, b);
    });
  }
  return copia.sort(porFrecuencia);
}

/** Texto del tooltip de la estrella. */
export function descripcionFrecuencia(f) {
  if (!f || !f.diasTotal) return '';
  const pz = f.ventaDiaria >= 10 ? Math.round(f.ventaDiaria) : Math.round(f.ventaDiaria * 10) / 10;
  return `Vendió en ${f.diasConVenta} de ${f.diasTotal} días · ${pz} pz/día`;
}
