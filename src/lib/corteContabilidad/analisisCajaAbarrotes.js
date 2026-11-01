/**
 * Análisis de la caja chica de Abarrotes a partir de los cierres guardados
 * (`cortes_contabilidad_cierres`): cuándo y por qué cae a negativo, y cuánto
 * colchón conviene dejar al recolectar.
 *
 * Caja del turno = venta + caja anterior − gastos − recolección − faltante − tarjeta.
 * Los gastos de las filas RECOLECCION se omiten: son los mismos gastos abiertos que
 * luego aparecen en el siguiente cierre de turno.
 */
import { ymdNegocioDesdeIso } from '../corteCaja.js';
import { esCategoriaProveedores } from './catalogoGastos.js';

const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const CAUSAS_NEGATIVO = {
  gasto_mayor_venta: 'Gastos del turno mayores que la venta en efectivo',
  proveedores: 'Pago de proveedores',
  tarjeta: 'Venta con tarjeta (no es efectivo)',
  faltante: 'Faltante descontado',
  recoleccion_previa: 'Recolección reciente dejó poca caja',
  caja_inicio_baja: 'Caja de arranque baja',
};

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDetalle(d) {
  if (typeof d === 'string') {
    try {
      return JSON.parse(d) || {};
    } catch {
      return {};
    }
  }
  return d && typeof d === 'object' ? d : {};
}

function diaSemana(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return -1;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

function diffDias(ymdA, ymdB) {
  const t = (s) => {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  return Math.round((t(ymdB) - t(ymdA)) / 86400000);
}

export function nombreDiaSemana(idx) {
  return DIAS_ES[idx] || '—';
}

export function percentil(valores, p) {
  const a = (valores || []).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const idx = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
  return a[idx];
}

/**
 * Convierte filas de cierre en movimientos ordenados cronológicamente.
 * Ignora eliminados.
 */
export function normalizarFilasCaja(rows) {
  const out = [];
  for (const h of rows || []) {
    if (!h || h.deleted_at) continue;
    const d = parseDetalle(h.detalle);
    const turno = String(h.turno || d.tipo_cierre || '').toUpperCase();
    const esRecoleccion = turno.includes('RECOLEC') || String(d.tipo_cierre || '').toLowerCase() === 'recoleccion';
    const fecha = ymdNegocioDesdeIso(d.fecha_negocio || h.created_at);
    if (!fecha) continue;
    const ts = new Date(h.created_at || `${fecha}T12:00:00Z`).getTime();
    const gastos = Array.isArray(d.gastos) ? d.gastos : [];
    const base = {
      id: h.id ?? null,
      fecha,
      ts: Number.isFinite(ts) ? ts : 0,
      dow: diaSemana(fecha),
      turno: String(h.turno || '').toUpperCase() || (esRecoleccion ? 'RECOLECCION' : 'CIERRE'),
      folio: h.folio || d.folio || '',
      caja: r2(h.caja_actual),
      tipo: esRecoleccion ? 'recoleccion' : 'cierre',
    };
    if (esRecoleccion) {
      out.push({
        ...base,
        monto: r2(d.recoleccion_efectivo ?? d.recoleccion ?? d.recoleccion_turno),
        cajaDespues: r2(h.caja_actual),
        bajoColchon: Boolean(d.bajo_colchon),
        colchonRecomendado: d.colchon_recomendado != null ? r2(d.colchon_recomendado) : null,
      });
      continue;
    }
    const venta = r2(h.ventas ?? d.venta);
    const tarjeta = r2(d.tarjeta);
    const faltante = r2(d.faltante);
    const gastosTotal = r2(d.gastos_total ?? gastos.reduce((a, g) => a + num(g.monto), 0));
    out.push({
      ...base,
      venta,
      tarjeta,
      faltante,
      ventaEfectivo: r2(Math.max(0, venta - tarjeta - faltante)),
      gastosTotal,
      gastosProveedores: r2(
        gastos.filter((g) => esCategoriaProveedores(g.categoria)).reduce((a, g) => a + num(g.monto), 0),
      ),
      gastos,
      cajaInicio: r2(d.caja_anterior),
    });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function topGastos(gastos, n = 3) {
  const por = new Map();
  for (const g of gastos || []) {
    const cat = String(g.categoria || 'Sin categoría').trim();
    const sub = String(g.subcategoria || '').trim();
    const nombre = esCategoriaProveedores(cat) && sub ? `Proveedor ${sub}` : sub ? `${cat} · ${sub}` : cat;
    por.set(nombre, r2((por.get(nombre) || 0) + num(g.monto)));
  }
  return [...por.entries()]
    .map(([nombre, monto]) => ({ nombre, monto }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, n);
}

/** Eventos en los que un cierre de turno dejó la caja en negativo y por qué. */
export function analizarNegativos(filas) {
  const lista = filas || [];
  const cierres = lista.filter((f) => f.tipo === 'cierre');
  const eventos = [];

  lista.forEach((f, idx) => {
    if (f.tipo !== 'cierre' || !(f.caja < -0.001)) return;
    let recPrevia = null;
    for (let j = idx - 1; j >= 0; j -= 1) {
      if (lista[j].tipo === 'recoleccion') {
        recPrevia = lista[j];
        break;
      }
    }
    const diasDesdeRec = recPrevia ? diffDias(recPrevia.fecha, f.fecha) : null;
    const recReciente = recPrevia && diasDesdeRec != null && diasDesdeRec <= 3 ? recPrevia : null;

    const causas = [];
    const faltaSinVenta = f.gastosTotal - f.ventaEfectivo;
    if (faltaSinVenta > 0.001) causas.push('gasto_mayor_venta');
    if (f.gastosTotal > 0.001 && f.gastosProveedores >= f.gastosTotal * 0.5) causas.push('proveedores');
    if (f.tarjeta > 0.001 && f.caja + f.tarjeta >= -0.001) causas.push('tarjeta');
    if (f.faltante > 0.001 && f.caja + f.faltante >= -0.001) causas.push('faltante');
    if (recReciente && f.cajaInicio < Math.max(0, faltaSinVenta)) causas.push('recoleccion_previa');
    else if (f.cajaInicio < Math.max(0, faltaSinVenta)) causas.push('caja_inicio_baja');

    eventos.push({
      fecha: f.fecha,
      dow: f.dow,
      dia: nombreDiaSemana(f.dow),
      turno: f.turno,
      folio: f.folio,
      caja: f.caja,
      faltaron: r2(Math.abs(f.caja)),
      venta: f.venta,
      ventaEfectivo: f.ventaEfectivo,
      tarjeta: f.tarjeta,
      gastos: f.gastosTotal,
      gastosProveedores: f.gastosProveedores,
      cajaInicio: f.cajaInicio,
      topGastos: topGastos(f.gastos),
      recoleccionPrevia: recPrevia
        ? {
            fecha: recPrevia.fecha,
            monto: recPrevia.monto,
            cajaDespues: recPrevia.cajaDespues,
            diasAntes: diasDesdeRec,
            bajoColchon: recPrevia.bajoColchon,
          }
        : null,
      causas,
    });
  });

  const recolecciones = lista.filter((f) => f.tipo === 'recoleccion');
  let recSeguidasNegativo = 0;
  const diasHastaNegativo = [];
  for (const rec of recolecciones) {
    const sig = lista.find((f) => f.ts > rec.ts && f.tipo === 'cierre' && f.caja < -0.001);
    if (!sig) continue;
    const d = diffDias(rec.fecha, sig.fecha);
    const hayOtraRec = recolecciones.some((r) => r.ts > rec.ts && r.ts < sig.ts);
    if (d <= 3 && !hayOtraRec) {
      recSeguidasNegativo += 1;
      diasHastaNegativo.push(d);
    }
  }

  const porDia = Array.from({ length: 7 }, (_, i) => ({ dow: i, dia: nombreDiaSemana(i), eventos: 0, faltaron: 0, cierres: 0 }));
  for (const c of cierres) if (c.dow >= 0) porDia[c.dow].cierres += 1;
  const porCausa = {};
  const porGasto = new Map();
  for (const e of eventos) {
    porDia[e.dow].eventos += 1;
    porDia[e.dow].faltaron = r2(porDia[e.dow].faltaron + e.faltaron);
    for (const c of e.causas) porCausa[c] = (porCausa[c] || 0) + 1;
    for (const g of e.topGastos) porGasto.set(g.nombre, r2((porGasto.get(g.nombre) || 0) + g.monto));
  }

  return {
    eventos: eventos.sort((a, b) => b.fecha.localeCompare(a.fecha)),
    resumen: {
      cierres: cierres.length,
      negativos: eventos.length,
      pctNegativos: cierres.length ? r2((eventos.length / cierres.length) * 100) : 0,
      peorCaja: eventos.length ? Math.min(...eventos.map((e) => e.caja)) : 0,
      faltaronPromedio: eventos.length ? r2(eventos.reduce((a, e) => a + e.faltaron, 0) / eventos.length) : 0,
      recolecciones: recolecciones.length,
      recSeguidasNegativo,
      recBajoColchon: recolecciones.filter((r) => r.bajoColchon).length,
      diasHastaNegativoProm: diasHastaNegativo.length
        ? r2(diasHastaNegativo.reduce((a, b) => a + b, 0) / diasHastaNegativo.length)
        : null,
      porDia,
      porCausa,
      gastosEnNegativos: [...porGasto.entries()]
        .map(([nombre, monto]) => ({ nombre, monto }))
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 6),
    },
  };
}

/** Promedios diarios de gasto y venta en efectivo por día de la semana. */
export function perfilDiario(filas) {
  const dias = new Map();
  for (const f of filas || []) {
    if (f.tipo !== 'cierre') continue;
    const d = dias.get(f.fecha) || { fecha: f.fecha, dow: f.dow, gastos: 0, ventaEfectivo: 0 };
    d.gastos = r2(d.gastos + f.gastosTotal);
    d.ventaEfectivo = r2(d.ventaEfectivo + f.ventaEfectivo);
    dias.set(f.fecha, d);
  }
  const lista = [...dias.values()];
  const porDow = Array.from({ length: 7 }, (_, i) => {
    const del = lista.filter((d) => d.dow === i);
    return {
      dow: i,
      dia: nombreDiaSemana(i),
      n: del.length,
      gastoProm: del.length ? r2(del.reduce((a, d) => a + d.gastos, 0) / del.length) : 0,
      gastoP75: percentil(del.map((d) => d.gastos), 75),
      ventaEfProm: del.length ? r2(del.reduce((a, d) => a + d.ventaEfectivo, 0) / del.length) : 0,
    };
  });
  const glob = {
    n: lista.length,
    gastoProm: lista.length ? r2(lista.reduce((a, d) => a + d.gastos, 0) / lista.length) : 0,
    gastoP75: percentil(lista.map((d) => d.gastos), 75),
    ventaEfProm: lista.length ? r2(lista.reduce((a, d) => a + d.ventaEfectivo, 0) / lista.length) : 0,
  };
  return { porDow, global: glob };
}

/**
 * Colchón recomendado = caja mínima que debe quedar después de recolectar para
 * cubrir los gastos esperados de los próximos `dias` días (cada día se supone que el
 * gasto sale antes de que entre la venta de ese día) más un margen.
 * Gasto esperado: percentil 75 del día de la semana; venta esperada: promedio.
 */
export function recomendarColchon(perfil, { hoyYmd, dias = 2, margen = 0.2 } = {}) {
  if (!perfil || !(perfil.global?.n >= 5) || !hoyYmd) return null;
  const hoyDow = diaSemana(hoyYmd);
  if (hoyDow < 0) return null;
  const detalle = [];
  let gastoAcum = 0;
  let ventaAcum = 0;
  let maxNecesidad = 0;
  for (let k = 1; k <= dias; k += 1) {
    const dow = (hoyDow + k) % 7;
    const p = perfil.porDow[dow];
    const usaDia = p.n >= 3;
    const gasto = usaDia ? Math.max(p.gastoP75, p.gastoProm) : perfil.global.gastoP75;
    const venta = usaDia ? p.ventaEfProm : perfil.global.ventaEfProm;
    gastoAcum += gasto;
    maxNecesidad = Math.max(maxNecesidad, gastoAcum - ventaAcum);
    ventaAcum += venta;
    detalle.push({ dow, dia: nombreDiaSemana(dow), gasto: r2(gasto), venta: r2(venta) });
  }
  const colchon = r2(maxNecesidad * (1 + margen));
  return { colchon, dias, margen, detalle, muestras: perfil.global.n };
}

/** Semáforo de la caja que quedaría tras recolectar frente al colchón. */
export function evaluarRecoleccion({ cajaDespues, colchon }) {
  if (colchon == null) return { nivel: 'sin_datos', faltante: 0, sobrante: 0 };
  const c = r2(cajaDespues);
  if (c < -0.001) return { nivel: 'negativo', faltante: r2(colchon - c), sobrante: 0 };
  if (c < colchon) return { nivel: 'bajo', faltante: r2(colchon - c), sobrante: 0 };
  return { nivel: 'ok', faltante: 0, sobrante: r2(c - colchon) };
}

/** Máximo que se puede recolectar dejando el colchón (0 si la caja ya no alcanza). */
export function maximoRecolectable({ cajaAntes, colchon }) {
  if (colchon == null) return null;
  return r2(Math.max(0, cajaAntes - colchon));
}
