/**
 * Configuración del bono por recolección (editable en Configuración → Bonos).
 * Persistencia: localStorage + nube pos_bonos_config.
 */

export const LS_BONOS_CONFIG = 'pos3b_bonos_config';
export const LS_BONOS_CONFIG_AT = 'pos3b_bonos_config_at';
export const EVENTO_BONOS_CONFIG = 'pos3b-bonos-config-updated';

export const AVISO_FALTA_BONOS_SQL =
  'Ejecuta supabase/fix_bonos_config.sql en Supabase para sincronizar los parámetros de bono entre sucursales.';

/** Rangos de recolección → bono base (MXN). Inclusivos en ambos extremos salvo el siguiente. */
export const RANGOS_BONO_DEFAULT = [
  { min: 3000, max: 4000, bono: 100 },
  { min: 4001, max: 7000, bono: 200 },
  { min: 7001, max: 10000, bono: 300 },
  { min: 10001, max: 13000, bono: 400 },
  { min: 13001, max: 17000, bono: 500 },
  { min: 17001, max: 20000, bono: 600 },
];

/** Niveles legacy (conteo de reglas). Se mantiene por compatibilidad; el cálculo actual usa penalizaciones. */
export const NIVELES_PCT_DEFAULT = [
  { reglasMin: 4, pct: 100 },
  { reglasMin: 3, pct: 75 },
  { reglasMin: 2, pct: 50 },
  { reglasMin: 1, pct: 25 },
  { reglasMin: 0, pct: 0 },
];

/** Bono base por turno de checklist (legado; desactivado: el checklist solo aporta ±%). */
export const BONOS_TURNO_DEFAULT = {
  activo: false,
  TD: 100,
  TN: 50,
};

/**
 * Modelo de pago (penalizaciones desde 100% del tabulador):
 * - Faltante de efectivo = $0 → requisito (gastos de corte, subcategoría FALTANTE).
 * - Check list: 4 a 6 días llenados OK; si < 4 días → −20%.
 * - Evaluación operativa < 70% → −20%.
 * - Inventario (merma) > 6% → −60%.
 * El checklist NO define un monto de bono; solo afecta ese %.
 */
export const BONOS_CONFIG_DEFAULT = {
  activo: true,
  /** Semana nómina (sáb–vie) o día. */
  periodo: 'semana',
  /** penalizaciones = modelo actual; reglas = legacy por conteo. */
  modoCalculo: 'penalizaciones',
  rangos: RANGOS_BONO_DEFAULT.map((r) => ({ ...r })),
  nivelesPct: NIVELES_PCT_DEFAULT.map((n) => ({ ...n })),
  reglas: {
    faltanteCero: {
      activo: true,
      label: 'Faltante de efectivo = $0 (requisito)',
      esRequisito: true,
    },
    checklistDiario: {
      activo: true,
      label: 'Check list operativo (días laborales)',
      diasEsperados: 6,
      /** Penaliza si días con checklist son estrictamente menores a este valor. */
      diasPenalizaSiHasta: 4,
      penalizacionPct: 20,
    },
    evaluacionMinPct: {
      activo: true,
      label: 'Evaluación operativa',
      minPct: 70,
      penalizacionPct: 20,
    },
    mermaMaxPct: {
      activo: true,
      label: 'Inventario (merma)',
      maxPct: 6,
      penalizacionPct: 60,
    },
  },
  /**
   * Bonos por turno (TD/TN) según % de evaluación del compañero del checklist.
   * monto = baseTurno × (pctCumple / 100).
   */
  bonosTurno: { ...BONOS_TURNO_DEFAULT },
  /**
   * Si true, recolecciones por encima del último max usan el bono del último rango.
   * Si false, fuera de rango = $0.
   */
  topeSuperiorUsaUltimo: true,
};

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_bonos_config')
    || (msg.includes('schema cache') && msg.includes('bonos'))
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

export function normalizarRangos(rangos) {
  const list = Array.isArray(rangos) && rangos.length
    ? rangos
    : RANGOS_BONO_DEFAULT;
  return list
    .map((r) => ({
      min: round2(num(r.min)),
      max: round2(num(r.max)),
      bono: round2(num(r.bono)),
    }))
    .filter((r) => r.max >= r.min && r.bono >= 0)
    .sort((a, b) => a.min - b.min);
}

export function normalizarNivelesPct(niveles) {
  const list = Array.isArray(niveles) && niveles.length
    ? niveles
    : NIVELES_PCT_DEFAULT;
  return list
    .map((n) => ({
      reglasMin: Math.max(0, Math.min(4, Math.round(num(n.reglasMin)))),
      pct: Math.max(0, Math.min(100, round2(num(n.pct)))),
    }))
    .sort((a, b) => b.reglasMin - a.reglasMin);
}

export function normalizarBonosTurno(raw) {
  const base = BONOS_TURNO_DEFAULT;
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    activo: r.activo !== false,
    TD: Math.max(0, round2(num(r.TD, base.TD))),
    TN: Math.max(0, round2(num(r.TN, base.TN))),
  };
}

export function normalizarBonosConfig(raw) {
  const base = BONOS_CONFIG_DEFAULT;
  const r = raw && typeof raw === 'object' ? raw : {};
  const reglasIn = r.reglas && typeof r.reglas === 'object' ? r.reglas : {};
  const modo = r.modoCalculo === 'reglas' ? 'reglas' : 'penalizaciones';
  // Primera vez con modelo de penalizaciones: subir umbrales viejos (2.5% / 75%) a 6% / 70%.
  const migrarUmbrales = r.modoCalculo == null
    && reglasIn.mermaMaxPct?.penalizacionPct == null
    && reglasIn.evaluacionMinPct?.penalizacionPct == null;
  const mermaMaxDefault = migrarUmbrales && Number(reglasIn.mermaMaxPct?.maxPct) === 2.5
    ? base.reglas.mermaMaxPct.maxPct
    : num(reglasIn.mermaMaxPct?.maxPct, base.reglas.mermaMaxPct.maxPct);
  const evalMinDefault = migrarUmbrales && Number(reglasIn.evaluacionMinPct?.minPct) === 75
    ? base.reglas.evaluacionMinPct.minPct
    : num(reglasIn.evaluacionMinPct?.minPct, base.reglas.evaluacionMinPct.minPct);
  return {
    activo: r.activo !== false,
    periodo: r.periodo === 'dia' ? 'dia' : 'semana',
    modoCalculo: modo,
    rangos: normalizarRangos(r.rangos),
    nivelesPct: normalizarNivelesPct(r.nivelesPct),
    reglas: {
      faltanteCero: {
        activo: reglasIn.faltanteCero?.activo !== false,
        label: String(reglasIn.faltanteCero?.label || base.reglas.faltanteCero.label),
        esRequisito: reglasIn.faltanteCero?.esRequisito !== false,
      },
      checklistDiario: {
        activo: reglasIn.checklistDiario?.activo !== false,
        label: String(reglasIn.checklistDiario?.label || base.reglas.checklistDiario.label),
        diasEsperados: Math.max(1, Math.round(num(
          reglasIn.checklistDiario?.diasEsperados,
          base.reglas.checklistDiario.diasEsperados,
        ))),
        diasPenalizaSiHasta: Math.max(0, Math.round(num(
          reglasIn.checklistDiario?.diasPenalizaSiHasta,
          base.reglas.checklistDiario.diasPenalizaSiHasta,
        ))),
        penalizacionPct: Math.max(0, Math.min(100, round2(num(
          reglasIn.checklistDiario?.penalizacionPct,
          base.reglas.checklistDiario.penalizacionPct,
        )))),
      },
      evaluacionMinPct: {
        activo: reglasIn.evaluacionMinPct?.activo !== false,
        label: String(reglasIn.evaluacionMinPct?.label || base.reglas.evaluacionMinPct.label),
        minPct: round2(evalMinDefault),
        penalizacionPct: Math.max(0, Math.min(100, round2(num(
          reglasIn.evaluacionMinPct?.penalizacionPct,
          base.reglas.evaluacionMinPct.penalizacionPct,
        )))),
      },
      mermaMaxPct: {
        activo: reglasIn.mermaMaxPct?.activo !== false,
        label: String(reglasIn.mermaMaxPct?.label || base.reglas.mermaMaxPct.label),
        maxPct: round2(mermaMaxDefault),
        penalizacionPct: Math.max(0, Math.min(100, round2(num(
          reglasIn.mermaMaxPct?.penalizacionPct,
          base.reglas.mermaMaxPct.penalizacionPct,
        )))),
      },
    },
    bonosTurno: normalizarBonosTurno(r.bonosTurno),
    topeSuperiorUsaUltimo: r.topeSuperiorUsaUltimo !== false,
  };
}

export function leerBonosConfig() {
  try {
    const raw = localStorage.getItem(LS_BONOS_CONFIG);
    if (!raw) return normalizarBonosConfig(BONOS_CONFIG_DEFAULT);
    return normalizarBonosConfig(JSON.parse(raw));
  } catch {
    return normalizarBonosConfig(BONOS_CONFIG_DEFAULT);
  }
}

export function leerBonosConfigMeta() {
  try {
    return localStorage.getItem(LS_BONOS_CONFIG_AT) || null;
  } catch {
    return null;
  }
}

export function guardarBonosConfigLocal(config, { updatedAt } = {}) {
  const norm = normalizarBonosConfig(config);
  const at = updatedAt || new Date().toISOString();
  localStorage.setItem(LS_BONOS_CONFIG, JSON.stringify(norm));
  localStorage.setItem(LS_BONOS_CONFIG_AT, at);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_BONOS_CONFIG, { detail: { config: norm, updatedAt: at } }));
  }
  return { config: norm, updatedAt: at };
}

export async function sincronizarBonosConfigDesdeNube(supabase) {
  if (!supabase) return { ok: true, cambio: false };
  const { data, error } = await supabase
    .from('pos_bonos_config')
    .select('config, updated_at')
    .eq('id', 'global')
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: true, aviso: AVISO_FALTA_BONOS_SQL, sinTabla: true, cambio: false };
    return { ok: false, error: error.message, cambio: false };
  }
  if (!data?.config) return { ok: true, cambio: false };

  const remotoAt = data.updated_at || null;
  const localAt = leerBonosConfigMeta();
  const remotoMs = Date.parse(remotoAt) || 0;
  const localMs = Date.parse(localAt) || 0;
  if (remotoMs >= localMs && remotoMs > 0) {
    const cambio = remotoMs > localMs;
    if (cambio || !localAt) {
      guardarBonosConfigLocal(data.config, { updatedAt: remotoAt });
    }
    return { ok: true, cambio: cambio || !localAt };
  }
  return { ok: true, cambio: false };
}

export async function subirBonosConfigANube(supabase, config) {
  if (!supabase) return { ok: true };
  const norm = normalizarBonosConfig(config);
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from('pos_bonos_config').upsert({
    id: 'global',
    config: norm,
    updated_at,
  });
  if (error) {
    if (faltaTabla(error)) return { ok: false, aviso: AVISO_FALTA_BONOS_SQL, sinTabla: true, error: error.message };
    return { ok: false, error: error.message };
  }
  return { ok: true, updated_at, config: norm };
}

export async function persistirBonosConfig(config, supabase) {
  const local = guardarBonosConfigLocal(config);
  const remoto = await subirBonosConfigANube(supabase, local.config);
  if (remoto.ok && remoto.updated_at) {
    guardarBonosConfigLocal(remoto.config || local.config, { updatedAt: remoto.updated_at });
  }
  return { local: local.config, remoto };
}

/** Bono base según monto de recolección. */
export function bonoBasePorMonto(monto, config = null) {
  const cfg = normalizarBonosConfig(config || leerBonosConfig());
  const m = round2(monto);
  if (!(m > 0) || !cfg.activo) return 0;
  const rangos = cfg.rangos;
  for (const r of rangos) {
    if (m >= r.min && m <= r.max) return r.bono;
  }
  if (cfg.topeSuperiorUsaUltimo && rangos.length) {
    const ultimo = rangos[rangos.length - 1];
    if (m > ultimo.max) return ultimo.bono;
  }
  return 0;
}

/** % según cuántas reglas se cumplieron (modo legacy). */
export function pctPorReglasCumplidas(cumplidas, config = null) {
  const cfg = normalizarBonosConfig(config || leerBonosConfig());
  const n = Math.max(0, Math.round(Number(cumplidas) || 0));
  for (const nivel of cfg.nivelesPct) {
    if (n >= nivel.reglasMin) return nivel.pct;
  }
  return 0;
}

export function bonoFinal(base, pct) {
  return round2((Number(base) || 0) * ((Number(pct) || 0) / 100));
}

/** Bono de un turno = base configurada × % evaluación del compañero. */
export function bonoTurnoPorEvaluacion(baseTurno, pctEvaluacion) {
  return bonoFinal(baseTurno, pctEvaluacion);
}

/**
 * % del bono por penalizaciones (modelo operativo actual).
 *
 * @param {{
 *   faltanteOk: boolean,
 *   checklistDias: number,
 *   evaluacionPct: number|null,
 *   mermaPct: number,
 * }} metricas
 * @param {object|null} config
 * @returns {{
 *   pct: number,
 *   detalle: Array<object>,
 *   penalizacionTotal: number,
 *   bloqueadoPorFaltante: boolean,
 * }}
 */
export function calcularPctBonoPorPenalizaciones(metricas = {}, config = null) {
  const cfg = normalizarBonosConfig(config || leerBonosConfig());
  const reglas = cfg.reglas;
  const detalle = [];
  let penalizacionTotal = 0;

  const faltanteOk = metricas.faltanteOk !== false;
  if (reglas.faltanteCero.activo) {
    const ok = faltanteOk;
    detalle.push({
      id: 'faltanteCero',
      label: reglas.faltanteCero.label,
      ok,
      esRequisito: true,
      penalizacionPct: ok ? 0 : 100,
      valor: ok ? 'Sin faltante' : 'Con faltante',
      requerido: '$0.00',
    });
    if (!ok) {
      return {
        pct: 0,
        detalle,
        penalizacionTotal: 100,
        bloqueadoPorFaltante: true,
      };
    }
  }

  let pct = 100;

  if (reglas.checklistDiario.activo) {
    const dias = Math.max(0, Math.round(Number(metricas.checklistDias) || 0));
    const minimo = Number(reglas.checklistDiario.diasPenalizaSiHasta) || 4;
    const esperados = Number(reglas.checklistDiario.diasEsperados) || 6;
    const pen = Number(reglas.checklistDiario.penalizacionPct) || 20;
    // De `minimo` a `esperados` días (ej. 4–6): OK. Menos de minimo → −pen%.
    const ok = dias >= minimo;
    if (!ok) {
      pct = round2(pct - pen);
      penalizacionTotal = round2(penalizacionTotal + pen);
    }
    detalle.push({
      id: 'checklistDiario',
      label: reglas.checklistDiario.label,
      ok,
      penalizacionPct: ok ? 0 : pen,
      valor: `${dias}/${esperados} días`,
      requerido: `≥${minimo} días (ideal ${esperados})`,
    });
  }

  if (reglas.evaluacionMinPct.activo) {
    const minPct = Number(reglas.evaluacionMinPct.minPct) || 70;
    const pen = Number(reglas.evaluacionMinPct.penalizacionPct) || 20;
    const ep = metricas.evaluacionPct;
    const ok = ep != null && Number.isFinite(Number(ep)) && Number(ep) >= minPct;
    if (!ok) {
      pct = round2(pct - pen);
      penalizacionTotal = round2(penalizacionTotal + pen);
    }
    detalle.push({
      id: 'evaluacionMinPct',
      label: reglas.evaluacionMinPct.label,
      ok,
      penalizacionPct: ok ? 0 : pen,
      valor: ep == null || !Number.isFinite(Number(ep)) ? 'Sin evaluación' : `${round2(Number(ep))}%`,
      requerido: `≥ ${minPct}%`,
    });
  }

  if (reglas.mermaMaxPct.activo) {
    const maxPct = Number(reglas.mermaMaxPct.maxPct) || 6;
    const pen = Number(reglas.mermaMaxPct.penalizacionPct) || 60;
    const mp = Number(metricas.mermaPct);
    const ok = Number.isFinite(mp) && mp <= maxPct;
    if (!ok) {
      pct = round2(pct - pen);
      penalizacionTotal = round2(penalizacionTotal + pen);
    }
    detalle.push({
      id: 'mermaMaxPct',
      label: reglas.mermaMaxPct.label,
      ok,
      penalizacionPct: ok ? 0 : pen,
      valor: Number.isFinite(mp) ? `${round2(mp)}%` : 'Sin dato',
      requerido: `≤ ${maxPct}%`,
    });
  }

  return {
    pct: Math.max(0, Math.min(100, pct)),
    detalle,
    penalizacionTotal: Math.min(100, penalizacionTotal),
    bloqueadoPorFaltante: false,
  };
}
