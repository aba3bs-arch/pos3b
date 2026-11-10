/**
 * Libro diario de Abarrotes por tienda y semana (sábado → viernes).
 * Arma, día por día, lo que entró (ventas de los cortes + ingresos capturados)
 * y lo que salió (gastos), con resultado del día y acumulado de la semana.
 */
import { periodoSemanaNomina, ymdLocal } from './semanaNomina.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
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

/**
 * @param {{ desde: string, hasta: string, ingresos?: object[], gastos?: object[] }} p
 */
export function construirLibroDiario({ desde, hasta, ingresos = [], gastos = [] } = {}) {
  const dias = [];
  const porFecha = new Map();
  for (let f = desde, n = 0; f && f <= hasta && n < 62; f = sumarDias(f, 1), n += 1) {
    const dia = {
      fecha: f,
      nombre: nombreDia(f),
      corta: fechaCorta(f),
      ventas: [],
      otrosIngresos: [],
      gastos: [],
      totalVentas: 0,
      totalOtrosIngresos: 0,
      totalIngresos: 0,
      totalGastos: 0,
      resultado: 0,
      acumulado: 0,
      sinMovimiento: true,
    };
    dias.push(dia);
    porFecha.set(f, dia);
  }

  const fuera = { ingresos: 0, gastos: 0, montoIngresos: 0, montoGastos: 0 };

  for (const it of ingresos || []) {
    const monto = round2(it.monto);
    if (!(monto > 0)) continue;
    // El cobro de crédito es dinero que sale hacia el recolector: ya va como gasto (CREDITO), no es ingreso.
    if (it.tipo_mov === 'cobro_credito') continue;
    const dia = porFecha.get(String(it.fecha || '').slice(0, 10));
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
        ? `Venta del corte${it.folio ? ` ${it.folio}` : ''}${etiquetaTurno(it) ? ` · ${etiquetaTurno(it)}` : ''}`
        : (it.comentario || 'Ingreso capturado'),
      monto,
    };
    if (it.tipo_mov === 'venta_cierre') dia.ventas.push(linea);
    else dia.otrosIngresos.push(linea);
  }

  for (const g of gastos || []) {
    const monto = round2(g.monto);
    if (!(monto > 0)) continue;
    const dia = porFecha.get(String(g.fecha || '').slice(0, 10));
    if (!dia) {
      fuera.gastos += 1;
      fuera.montoGastos = round2(fuera.montoGastos + monto);
      continue;
    }
    dia.gastos.push({
      id: g.id,
      created_at: g.created_at || null,
      categoria: g.categoria || 'Sin categoría',
      subcategoria: g.subcategoria || '',
      concepto: [g.subcategoria, g.comentario].filter(Boolean).join(' · ') || g.categoria || 'Gasto',
      empleado: g.empleado || '',
      monto,
    });
  }

  let acumulado = 0;
  const catMap = new Map();
  let totalVentas = 0;
  let totalOtros = 0;
  let totalGastos = 0;
  for (const dia of dias) {
    dia.ventas.sort(porHora);
    dia.otrosIngresos.sort(porHora);
    dia.gastos.sort((a, b) => b.monto - a.monto);
    dia.totalVentas = round2(dia.ventas.reduce((s, x) => s + x.monto, 0));
    dia.totalOtrosIngresos = round2(dia.otrosIngresos.reduce((s, x) => s + x.monto, 0));
    dia.totalIngresos = round2(dia.totalVentas + dia.totalOtrosIngresos);
    dia.totalGastos = round2(dia.gastos.reduce((s, x) => s + x.monto, 0));
    dia.resultado = round2(dia.totalIngresos - dia.totalGastos);
    acumulado = round2(acumulado + dia.resultado);
    dia.acumulado = acumulado;
    dia.sinMovimiento = !dia.ventas.length && !dia.otrosIngresos.length && !dia.gastos.length;
    totalVentas = round2(totalVentas + dia.totalVentas);
    totalOtros = round2(totalOtros + dia.totalOtrosIngresos);
    totalGastos = round2(totalGastos + dia.totalGastos);
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

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML imprimible del libro (una tienda, una semana). */
export function htmlLibroDiarioImprimible(libro, { tienda = '', semana = '' } = {}) {
  const filas = libro.dias.map((d) => {
    const lineas = [
      ...d.ventas.map((x) => `<tr><td class="in">Entra</td><td>${esc(x.concepto)}${x.empleado ? ` <span class="m">(${esc(x.empleado)})</span>` : ''}</td><td class="n in">${dinero(x.monto)}</td></tr>`),
      ...d.otrosIngresos.map((x) => `<tr><td class="in">Entra</td><td>${esc(x.concepto)}</td><td class="n in">${dinero(x.monto)}</td></tr>`),
      ...d.gastos.map((x) => `<tr><td class="out">Sale</td><td>${esc(x.categoria)} · ${esc(x.concepto)}${x.empleado ? ` <span class="m">(${esc(x.empleado)})</span>` : ''}</td><td class="n out">${dinero(x.monto)}</td></tr>`),
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
<div class="res"><div>Ventas y entradas<br><b class="in">${dinero(t.ingresos)}</b></div><div>Gastos<br><b class="out">${dinero(t.gastos)}</b></div><div>Resultado de la semana<br><b>${dinero(t.resultado)}</b></div></div>
<table>${filas}</table></body></html>`;
}
