/**
 * Libro diario de Abarrotes por tienda y semana (sábado → viernes).
 * Arma, día por día, lo que entró (ventas de los cortes + ingresos capturados)
 * y lo que salió (gastos), con resultado del día y acumulado de la semana.
 */
import { periodoSemanaNomina, ymdLocal } from './semanaNomina.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const MAX_DIAS_LIBRO = 400;
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function parseYmd(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function sumarDias(ymd, dias) {
  const d = parseYmd(ymd);
  if (!d) return '';
  d.setDate(d.getDate() + dias);
  return ymdLocal(d);
}

/** Semana sáb–vie que contiene la fecha (YYYY-MM-DD). */
export function semanaDeFecha(ymd) {
  const d = parseYmd(ymd) || new Date();
  return periodoSemanaNomina(d);
}

/** Semana anterior (−1) o siguiente (+1) a la que empieza en `inicio`. */
export function desplazarSemana(inicio, semanas) {
  return semanaDeFecha(sumarDias(inicio, 7 * semanas));
}

export function nombreDia(ymd) {
  const d = parseYmd(ymd);
  return d ? DIAS[d.getDay()] : '';
}

/** «7 nov» */
export function fechaCorta(ymd) {
  const d = parseYmd(ymd);
  return d ? `${d.getDate()} ${MESES[d.getMonth()]}` : '';
}

/** «sáb 7 nov – vie 13 nov 2026» */
export function etiquetaSemana(inicio, fin) {
  const a = parseYmd(inicio);
  const b = parseYmd(fin);
  if (!a || !b) return '';
  return `Sábado ${fechaCorta(inicio)} al viernes ${fechaCorta(fin)} de ${b.getFullYear()}`;
}

const pad2 = (n) => String(n).padStart(2, '0');

export function nombreMes(m) {
  return MESES_LARGO[(Number(m) || 1) - 1] || '';
}

export function ultimoDiaDelMes(anio, mes) {
  return new Date(Number(anio), Number(mes), 0).getDate();
}

/** «31 oct 2026 al 4 dic 2026» */
export function etiquetaRango(desde, hasta) {
  const a = parseYmd(desde);
  const b = parseYmd(hasta);
  if (!a || !b) return '';
  return `${a.getDate()} ${MESES[a.getMonth()]} ${a.getFullYear()} al ${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`;
}

export function diasEntre(desde, hasta) {
  const a = parseYmd(desde);
  const b = parseYmd(hasta);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * Periodo a consultar según el modo elegido.
 * - semana: sábado → viernes.
 * - mes: del día 1 al último día; con `extender` se amplía al sábado en que empieza esa semana
 *   y al viernes en que cierra la semana del último día.
 * - anio: 1 de enero → 31 de diciembre.
 * - rango: fechas libres; con `extender` se ajusta a sábado → viernes.
 * @returns {{ desde: string, hasta: string, etiqueta: string, dias: number, recortado: boolean }}
 */
export function periodoLibro({ modo = 'semana', semana, mes, anio, desde, hasta, extender = false } = {}) {
  let d = '';
  let h = '';
  let etiqueta = '';
  if (modo === 'mes') {
    const y = Number(mes?.anio);
    const m = Number(mes?.mes);
    d = `${y}-${pad2(m)}-01`;
    h = `${y}-${pad2(m)}-${pad2(ultimoDiaDelMes(y, m))}`;
    etiqueta = `${nombreMes(m)} ${y}`;
    if (extender) {
      d = semanaDeFecha(d).inicio;
      h = semanaDeFecha(h).fin;
      etiqueta += ` · del sábado ${fechaCorta(d)} al viernes ${fechaCorta(h)}`;
    }
  } else if (modo === 'anio') {
    const y = Number(anio);
    d = `${y}-01-01`;
    h = `${y}-12-31`;
    etiqueta = `Año ${y} (1 ene al 31 dic)`;
  } else if (modo === 'rango') {
    d = String(desde || '').slice(0, 10);
    h = String(hasta || '').slice(0, 10);
    if (d && h && d > h) [d, h] = [h, d];
    if (extender && d && h) {
      d = semanaDeFecha(d).inicio;
      h = semanaDeFecha(h).fin;
    }
    etiqueta = d && h ? etiquetaRango(d, h) : '';
  } else {
    d = semana?.inicio || '';
    h = semana?.fin || '';
    etiqueta = etiquetaSemana(d, h);
  }
  let recortado = false;
  if (d && h && diasEntre(d, h) > MAX_DIAS_LIBRO) {
    h = sumarDias(d, MAX_DIAS_LIBRO - 1);
    recortado = true;
  }
  return { desde: d, hasta: h, etiqueta, dias: d && h ? diasEntre(d, h) : 0, recortado };
}

/** Parte un periodo largo en tramos (para no topar con límites de filas al consultar). */
export function trocearPeriodo(desde, hasta, maxDias = 31) {
  const out = [];
  let ini = desde;
  while (ini && ini <= hasta && out.length < 40) {
    let fin = sumarDias(ini, maxDias - 1);
    if (fin > hasta) fin = hasta;
    out.push({ desde: ini, hasta: fin });
    ini = sumarDias(fin, 1);
  }
  return out;
}

/** Une los datos de varios tramos de `cargarContAbarrotes` en uno solo. */
export function fusionarDatosLibro(lista = []) {
  const base = { ok: true, ingresosPorDia: [], cortesLibro: [], gastosEnCurso: [], egresosOtrosIe: [] };
  const vistos = {
    ingresosPorDia: new Set(),
    cortesLibro: new Set(),
    gastosEnCurso: new Set(),
    egresosOtrosIe: new Set(),
  };
  for (const d of lista) {
    for (const k of Object.keys(vistos)) {
      for (const it of d?.[k] || []) {
        const id = it?.id ?? JSON.stringify(it);
        if (vistos[k].has(id)) continue;
        vistos[k].add(id);
        base[k].push(it);
      }
    }
  }
  return base;
}

/** Totales por mes calendario a partir de los días del libro. */
export function resumenPorMes(dias = []) {
  const mapa = new Map();
  for (const d of dias) {
    const k = d.fecha.slice(0, 7);
    if (!mapa.has(k)) {
      const [y, m] = k.split('-');
      mapa.set(k, { clave: k, anio: Number(y), mes: Number(m), etiqueta: `${nombreMes(m)} ${y}`, ventas: 0, pctAba: 0, pctVirtual: 0, gastos: 0, resultado: 0, enCurso: 0, otros: 0, dias: 0, diasConMovimiento: 0 });
    }
    const f = mapa.get(k);
    f.ventas = round2(f.ventas + d.totalIngresos);
    f.pctAba = round2(f.pctAba + d.pctAba);
    f.pctVirtual = round2(f.pctVirtual + d.pctVirtual);
    f.gastos = round2(f.gastos + d.totalGastos);
    f.resultado = round2(f.resultado + d.resultado);
    f.enCurso = round2(f.enCurso + d.totalEnCurso);
    f.otros = round2(f.otros + d.totalOtrosEgresos);
    f.dias += 1;
    if (!d.sinMovimiento) f.diasConMovimiento += 1;
  }
  return [...mapa.values()];
}

/** Totales por semana (sábado → viernes) a partir de los días del libro. */
export function resumenPorSemana(dias = []) {
  const mapa = new Map();
  for (const d of dias) {
    const sem = semanaDeFecha(d.fecha);
    if (!mapa.has(sem.inicio)) {
      mapa.set(sem.inicio, { inicio: sem.inicio, fin: sem.fin, etiqueta: `${fechaCorta(sem.inicio)} – ${fechaCorta(sem.fin)}`, ventas: 0, pctAba: 0, pctVirtual: 0, gastos: 0, resultado: 0, enCurso: 0, otros: 0, dias: 0 });
    }
    const f = mapa.get(sem.inicio);
    f.ventas = round2(f.ventas + d.totalIngresos);
    f.pctAba = round2(f.pctAba + d.pctAba);
    f.pctVirtual = round2(f.pctVirtual + d.pctVirtual);
    f.gastos = round2(f.gastos + d.totalGastos);
    f.resultado = round2(f.resultado + d.resultado);
    f.enCurso = round2(f.enCurso + d.totalEnCurso);
    f.otros = round2(f.otros + d.totalOtrosEgresos);
    f.dias += 1;
  }
  return [...mapa.values()];
}

export function dinero(n) {
  const v = Number(n) || 0;
  const txt = Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '−' : ''}$${txt}`;
}

function porHora(a, b) {
  return String(a.created_at || '').localeCompare(String(b.created_at || ''));
}

function etiquetaTurno(it) {
  const t = String(it.turno || '').trim();
  return t;
}

function lineaGasto(g, extra = {}) {
  return {
    id: g.id,
    created_at: g.created_at || null,
    categoria: g.categoria || 'Sin categoría',
    subcategoria: g.subcategoria || '',
    concepto: [g.subcategoria, g.comentario].filter(Boolean).join(' · ') || g.categoria || 'Gasto',
    empleado: g.empleado || '',
    monto: round2(g.monto),
    ...extra,
  };
}

/**
 * El libro se arma con lo mismo que dice el ticket del corte:
 * - ventas: venta en efectivo de cada corte cerrado (venta − tarjeta) + ingresos capturados.
 * - gastos (caja): los gastos que guardó cada corte cerrado.
 * - enCurso: gastos del turno abierto; se suman cuando se cierre el corte.
 * - otros: egresos de IE que no salen de la caja del corte (vales, evidencias, préstamos…).
 * @param {{ desde: string, hasta: string, ingresos?: object[], cortes?: object[], enCurso?: object[], otros?: object[] }} p
 */
export function construirLibroDiario({
  desde,
  hasta,
  ingresos = [],
  cortes = [],
  enCurso = [],
  otros = [],
} = {}) {
  const dias = [];
  const porFecha = new Map();
  for (let f = desde, n = 0; f && f <= hasta && n < MAX_DIAS_LIBRO; f = sumarDias(f, 1), n += 1) {
    const dia = {
      fecha: f,
      nombre: nombreDia(f),
      corta: fechaCorta(f),
      ventas: [],
      otrosIngresos: [],
      gastos: [],
      enCurso: [],
      otrosEgresos: [],
      cortes: [],
      totalVentas: 0,
      totalOtrosIngresos: 0,
      totalIngresos: 0,
      totalGastos: 0,
      totalEnCurso: 0,
      totalOtrosEgresos: 0,
      pctAba: 0,
      pctVirtual: 0,
      resultado: 0,
      acumulado: 0,
      sinMovimiento: true,
    };
    dias.push(dia);
    porFecha.set(f, dia);
  }

  const fuera = { ingresos: 0, gastos: 0, montoIngresos: 0, montoGastos: 0 };
  const diaDe = (fecha) => porFecha.get(String(fecha || '').slice(0, 10));

  for (const it of ingresos || []) {
    const monto = round2(it.monto);
    if (!(monto > 0)) continue;
    // El cobro de crédito es dinero que sale hacia el recolector: ya va como gasto (CREDITO), no es ingreso.
    if (it.tipo_mov === 'cobro_credito') continue;
    const dia = diaDe(it.fecha);
    if (!dia) {
      fuera.ingresos += 1;
      fuera.montoIngresos = round2(fuera.montoIngresos + monto);
      continue;
    }
    const linea = {
      id: it.id,
      hora: it.created_at || null,
      created_at: it.created_at || null,
      folio: it.folio || '',
      turno: etiquetaTurno(it),
      empleado: it.empleado || '',
      concepto: it.tipo_mov === 'venta_cierre'
        ? (
          String(it.folio || '').startsWith('ABD-')
            ? `Corte diario${it.folio ? ` ${it.folio}` : ''}`
            : `Venta del corte${it.folio ? ` ${it.folio}` : ''}${etiquetaTurno(it) ? ` · ${etiquetaTurno(it)}` : ''}`
        )
        : (it.comentario || 'Ingreso capturado'),
      monto,
    };
    if (it.tipo_mov === 'venta_cierre') dia.ventas.push(linea);
    else dia.otrosIngresos.push(linea);
  }

  for (const c of cortes || []) {
    const dia = diaDe(c.fecha);
    if (!dia) {
      for (const g of c.gastos || []) {
        fuera.gastos += 1;
        fuera.montoGastos = round2(fuera.montoGastos + (Number(g.monto) || 0));
      }
      continue;
    }
    const gastos = (c.gastos || []).filter((g) => round2(g.monto) > 0);
    for (const g of gastos) dia.gastos.push(lineaGasto(g, { folio: c.folio }));
    const efectivo = round2(c.ventaEfectivo);
    const gastosCorte = round2(gastos.reduce((s, g) => s + round2(g.monto), 0));
    const anterior = round2(c.cajaAnterior);
    const esperada = round2(anterior + efectivo - gastosCorte);
    const cajaActual = round2(c.cajaActual);
    dia.cortes.push({
      id: c.id,
      folio: c.folio || '',
      turno: c.turno || '',
      cajero: c.cajero || '',
      created_at: c.created_at || null,
      cajaAnterior: anterior,
      ventaEfectivo: efectivo,
      gastos: gastosCorte,
      cajaActual,
      tarjeta: round2(c.tarjeta),
      pctAba: round2(c.pctAba),
      pctVirtual: round2(c.pctVirtual),
      cuadra: Math.abs(esperada - cajaActual) < 0.51,
      cajaCalculada: esperada,
    });
  }

  for (const g of enCurso || []) {
    const monto = round2(g.monto);
    if (!(monto > 0)) continue;
    const dia = diaDe(g.fecha);
    if (!dia) continue;
    dia.enCurso.push(lineaGasto(g));
  }

  for (const g of otros || []) {
    const monto = round2(g.monto);
    if (!(monto > 0)) continue;
    const dia = diaDe(g.fecha);
    if (!dia) continue;
    dia.otrosEgresos.push(lineaGasto(g));
  }

  let acumulado = 0;
  const catMap = new Map();
  let totalVentas = 0;
  let totalOtros = 0;
  let totalGastos = 0;
  let totalEnCurso = 0;
  let totalOtrosEgresos = 0;
  let totalPctAba = 0;
  let totalPctVirtual = 0;
  for (const dia of dias) {
    dia.ventas.sort(porHora);
    dia.otrosIngresos.sort(porHora);
    dia.cortes.sort(porHora);
    dia.gastos.sort((a, b) => b.monto - a.monto);
    dia.enCurso.sort((a, b) => b.monto - a.monto);
    dia.otrosEgresos.sort((a, b) => b.monto - a.monto);
    dia.totalVentas = round2(dia.ventas.reduce((s, x) => s + x.monto, 0));
    dia.totalOtrosIngresos = round2(dia.otrosIngresos.reduce((s, x) => s + x.monto, 0));
    dia.totalIngresos = round2(dia.totalVentas + dia.totalOtrosIngresos);
    dia.totalGastos = round2(dia.gastos.reduce((s, x) => s + x.monto, 0));
    dia.totalEnCurso = round2(dia.enCurso.reduce((s, x) => s + x.monto, 0));
    dia.totalOtrosEgresos = round2(dia.otrosEgresos.reduce((s, x) => s + x.monto, 0));
    dia.pctAba = round2(dia.cortes.reduce((s, x) => s + x.pctAba, 0));
    dia.pctVirtual = round2(dia.cortes.reduce((s, x) => s + x.pctVirtual, 0));
    dia.resultado = round2(dia.totalIngresos - dia.totalGastos);
    acumulado = round2(acumulado + dia.resultado);
    dia.acumulado = acumulado;
    dia.sinMovimiento = !dia.ventas.length && !dia.otrosIngresos.length && !dia.gastos.length
      && !dia.enCurso.length && !dia.otrosEgresos.length && !dia.cortes.length;
    totalVentas = round2(totalVentas + dia.totalVentas);
    totalOtros = round2(totalOtros + dia.totalOtrosIngresos);
    totalGastos = round2(totalGastos + dia.totalGastos);
    totalEnCurso = round2(totalEnCurso + dia.totalEnCurso);
    totalOtrosEgresos = round2(totalOtrosEgresos + dia.totalOtrosEgresos);
    totalPctAba = round2(totalPctAba + dia.pctAba);
    totalPctVirtual = round2(totalPctVirtual + dia.pctVirtual);
    for (const g of dia.gastos) {
      catMap.set(g.categoria, round2((catMap.get(g.categoria) || 0) + g.monto));
    }
  }

  const totalIngresos = round2(totalVentas + totalOtros);
  const gastosPorCategoria = [...catMap.entries()]
    .map(([categoria, total]) => ({
      categoria,
      total,
      pctGastos: totalGastos > 0 ? round2((total / totalGastos) * 100) : 0,
      pctVentas: totalIngresos > 0 ? round2((total / totalIngresos) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const conMov = dias.filter((d) => !d.sinMovimiento);
  const mejorDia = [...conMov].sort((a, b) => b.totalIngresos - a.totalIngresos)[0] || null;
  const diaMasGasto = [...conMov].sort((a, b) => b.totalGastos - a.totalGastos)[0] || null;

  return {
    desde,
    hasta,
    dias,
    totales: {
      ventas: totalVentas,
      otrosIngresos: totalOtros,
      ingresos: totalIngresos,
      gastos: totalGastos,
      enCurso: totalEnCurso,
      otrosEgresos: totalOtrosEgresos,
      pctAba: totalPctAba,
      pctVirtual: totalPctVirtual,
      resultado: round2(totalIngresos - totalGastos),
      gastoPctVentas: totalIngresos > 0 ? round2((totalGastos / totalIngresos) * 100) : 0,
      diasConMovimiento: conMov.length,
    },
    gastosPorCategoria,
    mejorDia: mejorDia && mejorDia.totalIngresos > 0 ? { fecha: mejorDia.fecha, nombre: mejorDia.nombre, total: mejorDia.totalIngresos } : null,
    diaMasGasto: diaMasGasto && diaMasGasto.totalGastos > 0 ? { fecha: diaMasGasto.fecha, nombre: diaMasGasto.nombre, total: diaMasGasto.totalGastos } : null,
    fueraDeSemana: fuera,
  };
}

/** Resumen de todas las tiendas con el mismo criterio que el libro de cada tienda. */
export function resumenLibroPorTienda({ ingresos = [], cortes = [], enCurso = [], otros = [] } = {}, tiendas = []) {
  const mapa = new Map(tiendas.map((id) => [id, { id, ingresos: 0, gastos: 0, enCurso: 0, otros: 0, pctAba: 0, pctVirtual: 0 }]));
  const fila = (id) => {
    const k = id || 'MAIN';
    if (!mapa.has(k)) mapa.set(k, { id: k, ingresos: 0, gastos: 0, enCurso: 0, otros: 0, pctAba: 0, pctVirtual: 0 });
    return mapa.get(k);
  };
  for (const it of ingresos) {
    if (it.tipo_mov === 'cobro_credito') continue;
    fila(it.tienda).ingresos = round2(fila(it.tienda).ingresos + (Number(it.monto) || 0));
  }
  for (const c of cortes) {
    const f = fila(c.tienda);
    f.gastos = round2(f.gastos + (c.gastos || []).reduce((s, g) => s + (Number(g.monto) || 0), 0));
    f.pctAba = round2(f.pctAba + (Number(c.pctAba) || 0));
    f.pctVirtual = round2(f.pctVirtual + (Number(c.pctVirtual) || 0));
  }
  for (const g of enCurso) fila(g.tienda).enCurso = round2(fila(g.tienda).enCurso + (Number(g.monto) || 0));
  for (const g of otros) fila(g.tienda).otros = round2(fila(g.tienda).otros + (Number(g.monto) || 0));
  return [...mapa.values()].map((f) => ({ ...f, resultado: round2(f.ingresos - f.gastos) }));
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML imprimible del libro (una tienda, un periodo). */
export function htmlLibroDiarioImprimible(libro, { tienda = '', semana = '' } = {}) {
  const filas = libro.dias.map((d) => {
    const lineas = [
      ...d.ventas.map((x) => `<tr><td class="in">Entra</td><td>${esc(x.concepto)}${x.empleado ? ` <span class="m">(${esc(x.empleado)})</span>` : ''}</td><td class="n in">${dinero(x.monto)}</td></tr>`),
      ...d.otrosIngresos.map((x) => `<tr><td class="in">Entra</td><td>${esc(x.concepto)}</td><td class="n in">${dinero(x.monto)}</td></tr>`),
      ...d.gastos.map((x) => `<tr><td class="out">Sale</td><td>${esc(x.categoria)} · ${esc(x.concepto)}${x.empleado ? ` <span class="m">(${esc(x.empleado)})</span>` : ''}</td><td class="n out">${dinero(x.monto)}</td></tr>`),
      ...d.cortes.map((c) => `<tr><td class="m">Caja</td><td class="m">${esc(c.folio)}${c.turno ? ` · ${esc(c.turno)}` : ''}: caja anterior ${dinero(c.cajaAnterior)} + venta efectivo ${dinero(c.ventaEfectivo)} − gastos ${dinero(c.gastos)} = <b>${dinero(c.cajaActual)}</b>${c.cuadra ? '' : ` (calculado ${dinero(c.cajaCalculada)})`}</td><td></td></tr>`),
      ...(d.pctAba > 0 || d.pctVirtual > 0
        ? [`<tr><td class="m">Tarjeta</td><td class="m">PCT ABA (venta POS) ${dinero(d.pctAba)} · PCT VIRTUAL (diferencia) ${dinero(d.pctVirtual)}</td><td></td></tr>`]
        : []),
      ...d.enCurso.map((x) => `<tr><td class="m">En curso</td><td class="m">${esc(x.categoria)} · ${esc(x.concepto)} (aún sin corte)</td><td class="n m">${dinero(x.monto)}</td></tr>`),
      ...d.otrosEgresos.map((x) => `<tr><td class="m">Otro IE</td><td class="m">${esc(x.categoria)} · ${esc(x.concepto)} (no sale de la caja del corte)</td><td class="n m">${dinero(x.monto)}</td></tr>`),
    ].join('');
    return `<tbody><tr class="dia"><th colspan="2">${esc(d.nombre)} ${esc(d.corta)}</th><th class="n">Resultado ${dinero(d.resultado)}</th></tr>${lineas || '<tr><td colspan="3" class="m">Sin movimientos</td></tr>'}<tr class="tot"><td colspan="2">Entró ${dinero(d.totalIngresos)} · Salió ${dinero(d.totalGastos)}</td><td class="n">Acumulado ${dinero(d.acumulado)}</td></tr></tbody>`;
  }).join('');
  const t = libro.totales;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Libro diario ${esc(tienda)} ${esc(semana)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:18px}
h1{font-size:18px;margin:0 0 2px}h2{font-size:13px;font-weight:normal;margin:0 0 10px;color:#444}
table{width:100%;border-collapse:collapse;margin-bottom:10px}td,th{padding:3px 6px;border-bottom:1px solid #ddd;text-align:left}
tr.dia th{background:#eef2ff;border-top:2px solid #6366f1}tr.tot td{font-weight:bold;background:#f8fafc}
.n{text-align:right;white-space:nowrap}.in{color:#15803d}.out{color:#b91c1c}.m{color:#666;font-size:11px}
.res{display:flex;gap:14px;margin:8px 0 14px}.res div{border:1px solid #ccc;border-radius:6px;padding:6px 10px}
</style></head><body>
<h1>Libro diario · Abarrotes · ${esc(tienda)}</h1><h2>${esc(semana)}</h2>
<div class="res"><div>Ventas y entradas<br><b class="in">${dinero(t.ingresos)}</b></div><div>Gastos de los cortes<br><b class="out">${dinero(t.gastos)}</b></div><div>Resultado del periodo<br><b>${dinero(t.resultado)}</b></div>${t.pctAba > 0 ? `<div>PCT ABA<br><b>${dinero(t.pctAba)}</b></div>` : ''}${t.pctVirtual > 0 ? `<div>PCT VIRTUAL<br><b>${dinero(t.pctVirtual)}</b></div>` : ''}${t.enCurso > 0 ? `<div>Gastos sin corte<br><b>${dinero(t.enCurso)}</b></div>` : ''}${t.otrosEgresos > 0 ? `<div>Otros egresos IE<br><b>${dinero(t.otrosEgresos)}</b></div>` : ''}</div>
<table>${filas}</table></body></html>`;
}
