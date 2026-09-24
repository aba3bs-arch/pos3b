/**
 * Carga métricas de la app y calcula el bono de una sucursal.
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { inicioDia, finDia, hoyYmdNogales } from './corteCaja.js';
import { periodoSemanaNomina } from './semanaNomina.js';
import { listarMovimientosRecoleccionContabilidad, claveDiaReporte, sucursalParaControlEfectivo } from './controlEfectivo.js';
import { listarSesionesChecklist, listarRespuestasSesion, hoyYmdLocal, evaluacionCompaneroChecklist, labelTurno } from './checklistOperativo.js';
import { listarEvaluaciones } from './evaluacionOperativa.js';
import { costoUnitarioInventario, resumirValorInventario } from './valorInventario.js';
import { inventarioParaSucursal } from './inventarioMultitienda.js';
import {
  bonoBasePorMonto,
  bonoFinal,
  bonoTurnoPorEvaluacion,
  calcularPctBonoPorPenalizaciones,
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
      const tipo = String(m.tipo_movimiento || '');
      // Efectivo de recolección o cobro de crédito (cash real); no Entrega Crédito pendiente.
      if (tipo !== 'Recolección' && tipo !== 'Cobro Crédito') continue;
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

/** Faltante de efectivo en el periodo: solo gastos de corte con subcategoría/categoría FALTANTE. */
async function faltantePeriodo(supabase, sucursal, desde, hasta) {
  const suc = normalizarCodigoTienda(sucursal);
  const desdeIso = inicioDia(desde).toISOString();
  const hastaIso = finDia(hasta).toISOString();
  let total = 0;

  try {
    const { data, error } = await supabase
      .from('cortes_contabilidad_gastos')
      .select('id, monto, categoria, subcategoria, sucursal_id, created_at, estado_aprobacion')
      .eq('sucursal_id', suc)
      .gte('created_at', desdeIso)
      .lte('created_at', hastaIso)
      .limit(2000);
    if (!error) {
      for (const g of data || []) {
        const est = g.estado_aprobacion;
        if (est && est !== 'aprobado') continue;
        const sub = String(g.subcategoria || '').toUpperCase();
        const cat = String(g.categoria || '').toUpperCase();
        // Gastos de Virtual / otros cortes: categoría o subcategoría FALTANTE.
        if (!sub.includes('FALTANTE') && !cat.includes('FALTANTE')) continue;
        total = round2(total + Math.abs(Number(g.monto) || 0));
      }
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
    const valorInventario = Number(reg.valor_contado ?? reg.total_inventario) > 0
      ? round2(Number(reg.valor_contado ?? reg.total_inventario))
      : (Number(reg.valor_sistema) > 0 ? round2(Number(reg.valor_sistema)) : 0);
    const faltanteBruto = Number(reg.valor_faltante) >= 0 ? round2(Number(reg.valor_faltante)) : 0;
    const bonificacion = Number(reg.valor_bonificacion) > 0 ? round2(Number(reg.valor_bonificacion)) : 0;
    const valorMerma = reg.valor_faltante_neto != null && Number.isFinite(Number(reg.valor_faltante_neto))
      ? round2(Number(reg.valor_faltante_neto))
      : round2(Math.max(0, faltanteBruto - bonificacion));
    return {
      pct,
      valorMerma,
      valorInventario,
      faltanteBruto,
      bonificacion,
      invDespuesAjuste: reg.valor_despues_ajuste != null ? round2(Number(reg.valor_despues_ajuste)) : null,
      fuente: 'resultado_manual',
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

/** Check list: cuenta días con al menos un turno cerrado en el periodo. */
async function checklistCumple(supabase, sucursal, desde, hasta, esDia, diasEsperados = 6) {
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

  const esperados = Math.max(1, Number(diasEsperados) || 6);

  if (esDia) {
    const ok = cerradosPorDia.has(hoy) || cerradosPorDia.has(desde);
    return {
      ok,
      diasConChecklist: cerradosPorDia.has(desde) || cerradosPorDia.has(hoy) ? 1 : 0,
      diasPeriodo: 1,
      diasEsperados: 1,
      pctDias: ok ? 100 : 0,
    };
  }

  // Semana: días con checklist cerrado (hasta hoy). Se espera ~6 laborales.
  const diasExigidos = dias.filter((d) => d <= hoy);
  const hechos = [...cerradosPorDia].filter((d) => d >= desde && d <= hasta && d <= hoy).length;
  const meta = Math.min(esperados, diasExigidos.length || esperados);
  const ok = hechos >= meta;
  return {
    ok,
    diasConChecklist: hechos,
    diasPeriodo: diasExigidos.length,
    diasEsperados: esperados,
    pctDias: esperados ? round2((Math.min(hechos, esperados) / esperados) * 100) : 0,
  };
}

/**
 * Bonos por turno TD/TN según % evaluación del compañero del checklist cerrado.
 * bono = baseTurno × (pct / 100). Ej.: TD $100 · 80% → $80; TN $50 · 100% → $50.
 */
export async function calcularBonosTurnoChecklist(supabase, {
  sucursal,
  desde,
  hasta,
  config = null,
} = {}) {
  const cfg = normalizarBonosConfig(config || leerBonosConfig());
  const bt = cfg.bonosTurno || {};
  const vacio = {
    activo: !!bt.activo,
    bases: { TD: bt.TD || 0, TN: bt.TN || 0 },
    detalle: [],
    porTurno: {
      TD: { base: bt.TD || 0, sesiones: 0, pctPromedio: 0, bono: 0 },
      TN: { base: bt.TN || 0, sesiones: 0, pctPromedio: 0, bono: 0 },
    },
    total: 0,
  };
  if (!bt.activo || !supabase) return vacio;

  const suc = normalizarCodigoTienda(sucursal);
  const res = await listarSesionesChecklist(supabase, {
    sucursalId: suc,
    desde,
    hasta,
    limit: 200,
  });
  const sesiones = (res.data || []).filter((s) => {
    const t = String(s.turno || '').toUpperCase();
    return (t === 'TD' || t === 'TN') && String(s.estado) === 'cerrado';
  });

  const detalle = [];
  for (const s of sesiones) {
    const turno = String(s.turno || '').toUpperCase();
    const base = turno === 'TD' ? Number(bt.TD) || 0 : Number(bt.TN) || 0;
    const resp = await listarRespuestasSesion(supabase, s.id);
    const evalC = evaluacionCompaneroChecklist(resp.data || {});
    const bono = bonoTurnoPorEvaluacion(base, evalC.pct);
    detalle.push({
      id: s.id,
      fecha: String(s.fecha || '').slice(0, 10),
      turno,
      labelTurno: labelTurno(turno),
      base,
      pct: evalC.pct,
      bono,
      nivel: evalC.nivel,
      color: evalC.color,
      etiqueta: evalC.etiqueta,
      usuario: s.usuario_nombre || '',
    });
  }

  detalle.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.turno).localeCompare(String(b.turno)));

  const porTurno = {
    TD: { base: Number(bt.TD) || 0, sesiones: 0, pctSuma: 0, pctPromedio: 0, bono: 0 },
    TN: { base: Number(bt.TN) || 0, sesiones: 0, pctSuma: 0, pctPromedio: 0, bono: 0 },
  };
  let total = 0;
  for (const d of detalle) {
    const slot = porTurno[d.turno];
    if (!slot) continue;
    slot.sesiones += 1;
    slot.pctSuma += d.pct;
    slot.bono = round2(slot.bono + d.bono);
    total = round2(total + d.bono);
  }
  for (const k of ['TD', 'TN']) {
    const s = porTurno[k];
    s.pctPromedio = s.sesiones ? Math.round(s.pctSuma / s.sesiones) : 0;
    delete s.pctSuma;
  }

  return {
    activo: true,
    bases: { TD: Number(bt.TD) || 0, TN: Number(bt.TN) || 0 },
    detalle,
    porTurno,
    total,
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

  const [reco, falt, merma, evalRes, check, bonosTurno] = await Promise.all([
    totalRecoleccionPeriodo(supabase, suc, rango.desde, rango.hasta),
    faltantePeriodo(supabase, suc, rango.desde, rango.hasta),
    mermaPctPeriodo(supabase, suc, rango.desde, rango.hasta, inventario),
    evaluacionPct(supabase, suc),
    checklistCumple(
      supabase,
      suc,
      rango.desde,
      rango.hasta,
      esDia,
      cfgLive.reglas?.checklistDiario?.diasEsperados ?? 6,
    ),
    calcularBonosTurnoChecklist(supabase, {
      sucursal: suc,
      desde: rango.desde,
      hasta: rango.hasta,
      config: cfgLive,
    }),
  ]);

  const base = bonoBasePorMonto(reco.total, cfgLive);
  const reglasCfg = cfgLive.reglas;
  const usarPenalizaciones = cfgLive.modoCalculo !== 'reglas';

  let detalleReglas = [];
  let cumplidas = 0;
  let activas = 0;
  let pct = 0;
  let penalizacionTotal = 0;
  let bloqueadoPorFaltante = false;

  if (usarPenalizaciones) {
    const calc = calcularPctBonoPorPenalizaciones({
      faltanteOk: falt.ok,
      checklistDias: check.diasConChecklist,
      evaluacionPct: evalRes.pct,
      mermaPct: merma.pct,
    }, cfgLive);
    pct = cfgLive.activo ? calc.pct : 0;
    detalleReglas = calc.detalle.map((r) => {
      if (r.id === 'mermaMaxPct' && merma.fuente === 'resultado_manual') {
        return { ...r, valor: `${r.valor} · captura manual`, fuente: merma.fuente };
      }
      if (r.id === 'faltanteCero') {
        return { ...r, valor: `$${falt.total.toFixed(2)}` };
      }
      return r;
    });
    penalizacionTotal = calc.penalizacionTotal;
    bloqueadoPorFaltante = calc.bloqueadoPorFaltante;
    activas = detalleReglas.length;
    cumplidas = detalleReglas.filter((r) => r.ok).length;
  } else {
    // Legacy: conteo de reglas → nivelesPct
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
      const maxPct = Number(reglasCfg.mermaMaxPct.maxPct) || 6;
      const ok = merma.pct <= maxPct;
      if (ok) cumplidas += 1;
      const fuenteLabel = merma.fuente === 'resultado_manual' ? ' · captura manual' : '';
      detalleReglas.push({
        id: 'mermaMaxPct',
        label: reglasCfg.mermaMaxPct.label,
        ok,
        valor: `${merma.pct}%${fuenteLabel}`,
        requerido: `≤ ${maxPct}%`,
        fuente: merma.fuente || 'movimientos',
      });
    }
    if (reglasCfg.evaluacionMinPct.activo) {
      activas += 1;
      const minPct = Number(reglasCfg.evaluacionMinPct.minPct) || 70;
      const ep = evalRes.pct;
      const ok = ep != null && ep >= minPct;
      if (ok) cumplidas += 1;
      detalleReglas.push({
        id: 'evaluacionMinPct',
        label: reglasCfg.evaluacionMinPct.label,
        ok,
        valor: ep == null ? 'Sin evaluación' : `${ep}%`,
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
        valor: `${check.diasConChecklist}/${check.diasEsperados || check.diasPeriodo} días`,
        requerido: `${check.diasEsperados || 6} días`,
      });
    }
    const cumplidasNorm = activas > 0 && activas < 4
      ? Math.round((cumplidas / activas) * 4)
      : cumplidas;
    pct = cfgLive.activo ? pctPorReglasCumplidas(cumplidasNorm, cfgLive) : 0;
  }

  const bonoRecoleccion = cfgLive.activo && base > 0 ? bonoFinal(base, pct) : 0;
  // Los $ de checklist TD/TN ya no suman al bono de Inicio: el checklist solo aporta ±% (penalización).
  // El monto a pagar se confirma al pulsar Bono antes de recolectar.
  const bonoTurnos = 0;
  const bono = round2(bonoRecoleccion);

  return {
    ok: true,
    activo: cfgLive.activo,
    modoCalculo: cfgLive.modoCalculo,
    sucursal: suc,
    periodo: rango,
    recoleccion: reco.total,
    recoleccionesCount: reco.count,
    base,
    pct,
    penalizacionTotal,
    bloqueadoPorFaltante,
    bono,
    bonoRecoleccion,
    bonoTurnos,
    bonosTurno: bonosTurno
      ? { ...bonosTurno, activo: false, total: 0 }
      : bonosTurno,
    cumplidas,
    activas,
    cumplidasNorm: cumplidas,
    reglas: detalleReglas,
    metricas: {
      faltante: falt.total,
      mermaPct: merma.pct,
      mermaFuente: merma.fuente || 'movimientos',
      mermaValorInventario: merma.valorInventario ?? null,
      mermaValorFaltante: merma.valorMerma ?? null,
      mermaFaltanteBruto: merma.faltanteBruto ?? null,
      mermaBonificacion: merma.bonificacion ?? null,
      invDespuesAjuste: merma.invDespuesAjuste ?? null,
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
