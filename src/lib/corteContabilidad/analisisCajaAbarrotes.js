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
import { esGastoNominaEmpleadoCorte } from '../contVirtualCatalogo.js';

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

/** Cobro de crédito que hace el repartidor de Venta en Ruta (gasto CREDITO · COBRADO). */
export function esGastoCobroCredito(g) {
  const cat = String(g?.categoria || '').trim().toUpperCase();
  const sub = String(g?.subcategoria || '').trim().toUpperCase();
  return cat.includes('CREDITO') && sub.includes('COBRAD');
}

function sumaGastos(gastos, fn) {
  return r2((gastos || []).filter(fn).reduce((a, g) => a + num(g.monto), 0));
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

/** YYYY-MM-DD menos `dias` días (aritmética sobre la fecha de negocio, sin huso). */
export function ymdMenosDias(ymd, dias) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - dias * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Filas de los últimos `dias` días de negocio (incluye hoy). */
export function filasUltimosDias(filas, hoyYmd, dias) {
  const desde = ymdMenosDias(hoyYmd, Math.max(1, dias) - 1);
  return (filas || []).filter((f) => f.fecha >= desde);
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
    const gastosCredito = sumaGastos(gastos, esGastoCobroCredito);
    const gastosNomina = sumaGastos(gastos, esGastoNominaEmpleadoCorte);
    out.push({
      ...base,
      gastosCredito,
      gastosNomina,
      gastosBase: r2(Math.max(0, gastosTotal - gastosCredito - gastosNomina)),
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
export function perfilDiario(filas, { base = false, sinProveedores = false } = {}) {
  const dias = new Map();
  for (const f of filas || []) {
    if (f.tipo !== 'cierre') continue;
    const d = dias.get(f.fecha) || { fecha: f.fecha, dow: f.dow, gastos: 0, ventaEfectivo: 0 };
    const g = base ? f.gastosBase ?? f.gastosTotal : f.gastosTotal;
    d.gastos = r2(d.gastos + (sinProveedores ? Math.max(0, g - (f.gastosProveedores || 0)) : g));
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
 * Gasto esperado: percentil 75 del día de la semana (si hay al menos 3 muestras de ese día;
 * con ventanas cortas como 7 días se usa el global de la ventana); venta esperada: promedio.
 */
export function recomendarColchon(perfil, { hoyYmd, dias = 2, margen = 0.2, minDias = 5, ventana = null } = {}) {
  if (!perfil || !(perfil.global?.n >= minDias) || !hoyYmd) return null;
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
  return { colchon, dias, margen, detalle, muestras: perfil.global.n, ventana };
}

/**
 * Salidas fuertes por día de la semana: cobros de crédito del repartidor (percentil 75),
 * nómina pagada de caja (máximo) y pago a proveedores (percentil 75). Solo cuenta si se repitió
 * al menos en 2 días de ese día de la semana.
 */
export function perfilFuertes(filas) {
  const dias = new Map();
  for (const f of filas || []) {
    if (f.tipo !== 'cierre') continue;
    const d = dias.get(f.fecha) || { dow: f.dow, credito: 0, nomina: 0, proveedores: 0 };
    d.credito = r2(d.credito + (f.gastosCredito || 0));
    d.nomina = r2(d.nomina + (f.gastosNomina || 0));
    d.proveedores = r2(d.proveedores + (f.gastosProveedores || 0));
    dias.set(f.fecha, d);
  }
  const lista = [...dias.values()];
  const porDow = Array.from({ length: 7 }, (_, i) => {
    const del = lista.filter((d) => d.dow === i);
    const conCredito = del.filter((d) => d.credito > 0.001);
    const conNomina = del.filter((d) => d.nomina > 0.001);
    const conProv = del.filter((d) => d.proveedores > 0.001);
    const credito = conCredito.length >= 2 ? percentil(del.map((d) => d.credito), 75) : 0;
    const nomina = conNomina.length >= 2 ? Math.max(...conNomina.map((d) => d.nomina)) : 0;
    const proveedores = conProv.length >= 2 ? percentil(del.map((d) => d.proveedores), 75) : 0;
    return {
      dow: i,
      dia: nombreDiaSemana(i),
      n: del.length,
      credito: r2(credito),
      nomina: r2(nomina),
      proveedores: r2(proveedores),
      eventosCredito: conCredito.length,
      eventosNomina: conNomina.length,
      fuerte: credito + nomina > 0.001,
    };
  });
  return { porDow, dias: lista.length };
}

/** Redondea hacia abajo a un monto cómodo de contar en efectivo ($100, o $10 si es poco). */
export function redondearRecoleccion(monto) {
  const m = Math.max(0, Number(monto) || 0);
  if (m >= 100) return Math.floor(m / 100) * 100;
  return Math.floor(m / 10) * 10;
}

/**
 * Plan de recolección: cuánto debe quedar en caja para llegar hasta el próximo día fuerte
 * (cobros de crédito del repartidor, pago a proveedores, nómina) sin caer a negativo.
 *
 * `dias` = 0 → hasta el próximo día fuerte (si no hay, 2 días); 1..5 → ese número de días.
 * Hoy solo cuenta lo fuerte que aún falta por registrar (`yaHoy`), porque el gasto normal de hoy
 * ya está en la caja. Cada día: sale el gasto (normal + fuertes) antes de que entre la venta.
 *
 * `reglas` fija días de pago conocidos:
 * - nomina: `nominaDow` (0=domingo … 6=sábado), `nominaMonto` por turno y `nominaTurnos` (el turno
 *   nocturno paga su nómina en su propio corte, por eso puede haber 2 salidas el mismo día).
 *   Si hay regla, sustituye la nómina estimada del historial.
 * - proveedores: `proveedoresDow` y `proveedoresMonto` (0 = estimar con el historial de ese día).
 *   Ese día el gasto normal va sin proveedores y se suma el pago de proveedores.
 */
export function planRecoleccion({
  perfilBase,
  perfilBaseSinProv = null,
  perfilFuertes: pf,
  hoyYmd,
  dias = 0,
  margen = 0.2,
  minDias = 5,
  ventana = null,
  yaHoy = {},
  reglas = {},
} = {}) {
  if (!perfilBase || !(perfilBase.global?.n >= minDias) || !hoyYmd) return null;
  const hoyDow = diaSemana(hoyYmd);
  if (hoyDow < 0) return null;
  const fuertes = pf?.porDow || [];

  const nomDow = Number.isInteger(reglas.nominaDow) ? reglas.nominaDow : null;
  const nomPorTurno = Math.max(0, num(reglas.nominaMonto));
  const nomTurnos = Math.max(1, Math.round(num(reglas.nominaTurnos)) || 1);
  const reglaNomina = nomDow != null && nomPorTurno > 0;
  const provDow = Number.isInteger(reglas.proveedoresDow) ? reglas.proveedoresDow : null;
  const provManual = Math.max(0, num(reglas.proveedoresMonto));
  const provMonto = provDow != null ? (provManual > 0 ? provManual : fuertes[provDow]?.proveedores || 0) : 0;
  const reglaProv = provDow != null && provMonto > 0;

  const nominaDelDia = (dow) => {
    if (reglaNomina) return dow === nomDow ? nomPorTurno * nomTurnos : 0;
    return fuertes[dow]?.nomina || 0;
  };
  const provDelDia = (dow) => (reglaProv && dow === provDow ? provMonto : 0);
  const esFuerte = (dow) => Boolean(fuertes[dow]?.fuerte) || nominaDelDia(dow) > 0 || provDelDia(dow) > 0;

  let horizonte = Math.min(5, Math.max(1, Number(dias) || 0));
  let proximoK = null;
  for (let k = 1; k <= 7; k += 1) {
    if (esFuerte((hoyDow + k) % 7)) {
      proximoK = k;
      break;
    }
  }
  let hastaFuerte = false;
  if (!(Number(dias) >= 1)) {
    hastaFuerte = proximoK != null;
    horizonte = proximoK != null ? proximoK : 2;
  }

  const detalle = [];
  let gastoAcum = 0;
  let ventaAcum = 0;
  let maxNecesidad = 0;
  const tot = { base: 0, credito: 0, nomina: 0, proveedores: 0, venta: 0 };

  for (let k = 0; k <= horizonte; k += 1) {
    const dow = (hoyDow + k) % 7;
    let base = 0;
    let venta = 0;
    let credito = fuertes[dow]?.credito || 0;
    let nomina = nominaDelDia(dow);
    let proveedores = provDelDia(dow);
    if (k === 0) {
      credito = Math.max(0, credito - num(yaHoy.credito));
      nomina = Math.max(0, nomina - num(yaHoy.nomina));
      proveedores = Math.max(0, proveedores - num(yaHoy.proveedores));
    } else {
      const perfil = proveedores > 0 && perfilBaseSinProv ? perfilBaseSinProv : perfilBase;
      const p = perfil.porDow[dow];
      const usaDia = p.n >= 3;
      base = usaDia ? Math.max(p.gastoP75, p.gastoProm) : perfil.global.gastoP75;
      venta = usaDia ? p.ventaEfProm : perfil.global.ventaEfProm;
    }
    const gasto = base + credito + nomina + proveedores;
    gastoAcum += gasto;
    maxNecesidad = Math.max(maxNecesidad, gastoAcum - ventaAcum);
    ventaAcum += venta;
    tot.base += base;
    tot.credito += credito;
    tot.nomina += nomina;
    tot.proveedores += proveedores;
    tot.venta += venta;
    detalle.push({
      k,
      dow,
      dia: k === 0 ? 'Hoy' : nombreDiaSemana(dow),
      base: r2(base),
      credito: r2(credito),
      nomina: r2(nomina),
      proveedores: r2(proveedores),
      gasto: r2(gasto),
      venta: r2(venta),
    });
  }

  let proximoFuerte = null;
  if (proximoK != null) {
    const dow = (hoyDow + proximoK) % 7;
    proximoFuerte = {
      dow,
      dia: nombreDiaSemana(dow),
      enDias: proximoK,
      credito: r2(fuertes[dow]?.credito || 0),
      nomina: r2(nominaDelDia(dow)),
      proveedores: r2(provDelDia(dow)),
    };
  }

  const colchon = r2(maxNecesidad * (1 + margen));
  return {
    colchon,
    dias: horizonte,
    hastaFuerte,
    proximoFuerte,
    margen,
    detalle,
    totales: {
      base: r2(tot.base),
      credito: r2(tot.credito),
      nomina: r2(tot.nomina),
      proveedores: r2(tot.proveedores),
      venta: r2(tot.venta),
    },
    muestras: perfilBase.global.n,
    ventana,
    reglaNomina,
    reglaProveedores: reglaProv,
    proveedoresMontoUsado: r2(provMonto),
    fuertesDetectados: fuertes.filter((f) => f.fuerte),
  };
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
