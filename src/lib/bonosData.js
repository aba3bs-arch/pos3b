/**
 * Carga métricas de la app y calcula el bono de una sucursal.
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { inicioDia, finDia, hoyYmdNogales } from './corteCaja.js';
import { periodoSemanaNomina } from './semanaNomina.js';
import { listarMovimientosRecoleccionContabilidad, claveDiaReporte, sucursalParaControlEfectivo } from './controlEfectivo.js';
import { listarSesionesChecklist, hoyYmdLocal } from './checklistOperativo.js';
import { listarEvaluaciones } from './evaluacionOperativa.js';
import { costoUnitarioInventario, resumirValorInventario } from './valorInventario.js';
import { inventarioParaSucursal } from './inventarioMultitienda.js';
import {
  bonoBasePorMonto,
  bonoFinal,
  leerBonosConfig,
  normalizarBonosConfig,
  pctPorReglasCumplidas,
  sincronizarBonosConfigDesdeNube,
} from './bonosConfig.js';
import { resultadoInventarioParaBono } from './resultadoInventario.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function diasEntre(desdeYmd, hastaYmd) {
  const out = [];
  let cur = new Date(`${desdeYmd}T12:00:00`);
  const fin = new Date(`${hastaYmd}T12:00:00`);
  while (cur <= fin) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function rangoPeriodoBono(config, _fecha = new Date()) {
  const cfg = normalizarBonosConfig(config || leerBonosConfig());
  if (cfg.periodo === 'dia') {
    const h = hoyYmdNogales();
    return { desde: h, hasta: h, label: 'Hoy' };
  }
  const s = periodoSemanaNomina(_fecha);
  return { desde: s.inicio, hasta: s.fin, label: `Semana ${s.inicio} → ${s.fin}` };
}

async function totalRecoleccionPeriodo(supabase, sucursal, desde, hasta) {
  const tienda = sucursalParaControlEfectivo(sucursal) || normalizarCodigoTienda(sucursal);
  try {
    const data = await listarMovimientosRecoleccionContabilidad(supabase, {
      desde,
      hasta,
      tienda,
    });
    let total = 0;
    let count = 0;
    for (const m of data || []) {
      if (String(m.tipo_movimiento || '') !== 'Recolección') continue;
      const dia = claveDiaReporte(m, 'recoleccion');
      if (desde && dia < desde) continue;
      if (hasta && dia > hasta) continue;
      total = round2(total + (Number(m.monto) || 0));
      count += 1;
    }
    return { total, count, error: null };
  } catch (e) {
    return { total: 0, count: 0, error: e?.message || String(e) };
  }
}

/** Faltante de efectivo en el periodo (gastos FALTANTE + estado corte si existe). */
async function faltantePeriodo(supabase, sucursal, desde, hasta) {
  const suc = normalizarCodigoTienda(sucursal);
  const desdeIso = inicioDia(desde).toISOString();
  const hastaIso = finDia(hasta).toISOString();
  let total = 0;

  try {
    let q = supabase
      .from('cortes_contabilidad_gastos')
      .select('id, monto, categoria, subcategoria, sucursal_id, created_at, estado_aprobacion')
      .eq('sucursal_id', suc)
      .gte('created_at', desdeIso)
      .lte('created_at', hastaIso)
      .limit(2000);
    const { data, error } = await q;
    if (!error) {
      for (const g of data || []) {
        const est = g.estado_aprobacion;
        if (est && est !== 'aprobado') continue;
        const blob = `${g.categoria || ''} ${g.subcategoria || ''}`.toUpperCase();
        if (!blob.includes('FALTANTE')) continue;
        total = round2(total + Math.abs(Number(g.monto) || 0));
      }
    }
  } catch {
    /* ignore */
  }

  try {
    let cq = supabase
      .from('cortes_caja')
      .select('id, diferencia, sucursal_id, created_at')
      .eq('sucursal_id', suc)
      .gte('created_at', desdeIso)
      .lte('created_at', hastaIso)
      .limit(500);
    const { data: cortes } = await cq;
    for (const c of cortes || []) {
      const dif = Number(c.diferencia) || 0;
      if (dif < 0) total = round2(total + Math.abs(dif));
    }
  } catch {
    /* ignore */
  }

  return { total, ok: total <= 0.009 };
}

/**
 * Merma % para bono.
 * Preferencia: resultado manual de inventario (Reportes → Inventario) si existe en el periodo.
 * Fallback: valor retiros merma / valor inventario a costo.
 */
async function mermaPctPeriodo(supabase, sucursal, desde, hasta, inventario = []) {
  const suc = normalizarCodigoTienda(sucursal);

  const manual = await resultadoInventarioParaBono(supabase, { sucursal: suc, desde, hasta });
  const reg = manual.registro;
  if (reg && reg.pct_merma != null && Number.isFinite(Number(reg.pct_merma))) {
    const pct = round2(Number(reg.pct_merma));
    const valorInventario = Number(reg.valor_sistema) > 0
      ? round2(Number(reg.valor_sistema))
      : 0;
    const valorMerma = Number(reg.valor_faltante) >= 0
      ? round2(Number(reg.valor_faltante))
      : (valorInventario > 0 ? round2(valorInventario * (pct / 100)) : 0);
    return {
      pct,
      valorMerma,
      valorInventario,
      fuente: 'resultado_manual',
      efectividad: reg.pct_efectividad != null ? round2(Number(reg.pct_efectividad)) : null,
      periodoResultado: { desde: reg.desde, hasta: reg.hasta },
    };
  }

  const inv = inventarioParaSucursal(inventario, suc);
  const valor = resumirValorInventario(inv);
  const denom = Number(valor.valorCosto) > 0 ? Number(valor.valorCosto) : Number(valor.valorTotal) || 0;

  const desdeIso = inicioDia(desde).toISOString();
  const hastaIso = finDia(hasta).toISOString();
  let valorMerma = 0;

  try {
    let q = supabase
      .from('movimientos_inventario')
      .select('id, tipo, modo, cantidad, producto_id, motivo, sucursal_id, created_at')
      .eq('sucursal_id', suc)
      .gte('created_at', desdeIso)
      .lte('created_at', hastaIso)
      .limit(5000);
    const { data } = await q;
    const byId = new Map((inv || []).map((p) => [String(p.id), p]));
    for (const m of data || []) {
      if (String(m.tipo || '').toLowerCase() !== 'retiro') continue;
      const motivo = String(m.motivo || m.modo || '').toLowerCase();
      const esMerma =
        /merma|faltante|caduc|roto|dano|daño|quebrant|ajuste/.test(motivo)
        || String(m.modo || '').includes('conteo')
        || String(m.modo || '') === 'libre';
      if (!esMerma) continue;
      const prod = byId.get(String(m.producto_id));
      const costoU = prod ? costoUnitarioInventario(prod) : 0;
      const qty = Math.abs(Number(m.cantidad) || 0);
      valorMerma = round2(valorMerma + qty * costoU);
    }
  } catch {
    /* ignore */
  }

  const pct = denom > 0 ? round2((valorMerma / denom) * 100) : (valorMerma > 0 ? 100 : 0);
  return { pct, valorMerma, valorInventario: denom, fuente: 'movimientos' };
}

async function evaluacionPct(supabase, sucursal) {
  const res = await listarEvaluaciones(supabase, { sucursalId: sucursal, limit: 30 });
  if (res.error && !res.data?.length) return { pct: null, ok: false, error: res.error };
  const cerrada = (res.data || []).find((e) => e.estado === 'cerrado');
  const row = cerrada || (res.data || [])[0];
  if (!row) return { pct: null, ok: false, sinDatos: true };
  const pct = Number(row.puntuacion_pct);
  return {
    pct: Number.isFinite(pct) ? pct : null,
    ok: Number.isFinite(pct),
    fecha: row.fecha,
    estado: row.estado,
  };
}

/** Check list diario: en periodo día = hoy cerrado; en semana = % días con al menos un turno cerrado. */
async function checklistCumple(supabase, sucursal, desde, hasta, esDia) {
  const res = await listarSesionesChecklist(supabase, {
    sucursalId: sucursal,
    desde,
    hasta,
    limit: 200,
  });
  const sesiones = res.data || [];
  const dias = diasEntre(desde, hasta);
  const hoy = hoyYmdLocal();
  const cerradosPorDia = new Set();
  for (const s of sesiones) {
    if (String(s.estado) !== 'cerrado') continue;
    const f = String(s.fecha || '').slice(0, 10);
    if (f) cerradosPorDia.add(f);
  }

  if (esDia) {
    const ok = cerradosPorDia.has(hoy) || cerradosPorDia.has(desde);
    return {
      ok,
      diasConChecklist: cerradosPorDia.size,
      diasPeriodo: 1,
      pctDias: ok ? 100 : 0,
    };
  }

  // Semana: exige checklist en todos los días transcurridos hasta hoy (no futuros)
  const diasExigidos = dias.filter((d) => d <= hoy);
  const hechos = diasExigidos.filter((d) => cerradosPorDia.has(d)).length;
  const ok = diasExigidos.length > 0 && hechos === diasExigidos.length;
  return {
    ok,
    diasConChecklist: hechos,
    diasPeriodo: diasExigidos.length,
    pctDias: diasExigidos.length ? round2((hechos / diasExigidos.length) * 100) : 0,
  };
}

/**
 * Calcula bono de una sucursal para el periodo configurado.
 */
export async function calcularBonoSucursal(supabase, {
  sucursal,
  inventario = [],
  config = null,
  fecha = new Date(),
} = {}) {
  const cfg = normalizarBonosConfig(config || leerBonosConfig());
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc || !supabase) {
    return { ok: false, error: 'Sin sucursal o conexión.', bono: 0, pct: 0, base: 0 };
  }

  await sincronizarBonosConfigDesdeNube(supabase);
  const cfgLive = normalizarBonosConfig(leerBonosConfig());
  const rango = rangoPeriodoBono(cfgLive, fecha);
  const esDia = cfgLive.periodo === 'dia';

  const [reco, falt, merma, evalRes, check] = await Promise.all([
    totalRecoleccionPeriodo(supabase, suc, rango.desde, rango.hasta),
    faltantePeriodo(supabase, suc, rango.desde, rango.hasta),
    mermaPctPeriodo(supabase, suc, rango.desde, rango.hasta, inventario),
    evaluacionPct(supabase, suc),
    checklistCumple(supabase, suc, rango.desde, rango.hasta, esDia),
  ]);

  const base = bonoBasePorMonto(reco.total, cfgLive);
  const reglasCfg = cfgLive.reglas;

  const detalleReglas = [];
  let cumplidas = 0;
  let activas = 0;

  if (reglasCfg.faltanteCero.activo) {
    activas += 1;
    const ok = falt.ok;
    if (ok) cumplidas += 1;
    detalleReglas.push({
      id: 'faltanteCero',
      label: reglasCfg.faltanteCero.label,
      ok,
      valor: `$${falt.total.toFixed(2)}`,
      requerido: '$0.00',
    });
  }

  if (reglasCfg.mermaMaxPct.activo) {
    activas += 1;
    const maxPct = Number(reglasCfg.mermaMaxPct.maxPct) || 2.5;
    const ok = merma.pct <= maxPct;
    if (ok) cumplidas += 1;
    const fuenteLabel = merma.fuente === 'resultado_manual' ? ' · resultado manual' : '';
    detalleReglas.push({
      id: 'mermaMaxPct',
      label: reglasCfg.mermaMaxPct.label,
      ok,
      valor: `${merma.pct}%${fuenteLabel}`,
      requerido: `≤ ${maxPct}%`,
      fuente: merma.fuente || 'movimientos',
      efectividad: merma.efectividad ?? null,
    });
  }

  if (reglasCfg.evaluacionMinPct.activo) {
    activas += 1;
    const minPct = Number(reglasCfg.evaluacionMinPct.minPct) || 75;
    const pct = evalRes.pct;
    const ok = pct != null && pct >= minPct;
    if (ok) cumplidas += 1;
    detalleReglas.push({
      id: 'evaluacionMinPct',
      label: reglasCfg.evaluacionMinPct.label,
      ok,
      valor: pct == null ? 'Sin evaluación' : `${pct}%`,
      requerido: `≥ ${minPct}%`,
    });
  }

  if (reglasCfg.checklistDiario.activo) {
    activas += 1;
    const ok = check.ok;
    if (ok) cumplidas += 1;
    detalleReglas.push({
      id: 'checklistDiario',
      label: reglasCfg.checklistDiario.label,
      ok,
      valor: `${check.diasConChecklist}/${check.diasPeriodo} días`,
      requerido: 'Diario cerrado',
    });
  }

  // Mapear cumplidas sobre 4 slots (o activas) a niveles configurados
  const cumplidasNorm = activas > 0 && activas < 4
    ? Math.round((cumplidas / activas) * 4)
    : cumplidas;

  const pct = cfgLive.activo ? pctPorReglasCumplidas(cumplidasNorm, cfgLive) : 0;
  const bono = cfgLive.activo && base > 0 ? bonoFinal(base, pct) : 0;

  return {
    ok: true,
    activo: cfgLive.activo,
    sucursal: suc,
    periodo: rango,
    recoleccion: reco.total,
    recoleccionesCount: reco.count,
    base,
    pct,
    bono,
    cumplidas,
    activas,
    cumplidasNorm,
    reglas: detalleReglas,
    metricas: {
      faltante: falt.total,
      mermaPct: merma.pct,
      mermaFuente: merma.fuente || 'movimientos',
      efectividadConteo: merma.efectividad ?? null,
      evaluacionPct: evalRes.pct,
      checklist: check,
    },
    config: cfgLive,
  };
}

/** Resumen de varias tiendas (monitoreo en Config). */
export async function calcularBonosVariasSucursales(supabase, {
  sucursales = [],
  inventario = [],
  config = null,
} = {}) {
  const out = [];
  for (const s of sucursales) {
    const r = await calcularBonoSucursal(supabase, { sucursal: s, inventario, config });
    out.push(r);
  }
  return out;
}
