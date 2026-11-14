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

/** Ventanas de vigencia de medidores (días calendario). */
export const DIAS_VENTANA_EVALUACION_BONO = 15;
export const DIAS_VENTANA_INVENTARIO_BONO = 8;

/**
 * Los factores encendidos se reparten el 100% del tabulador:
 * - 1 encendido = 100%, 2 = 50% cada uno, 3 ≈ 33.33%, 4 = 25%, 5 = 20%.
 * - Fallar un factor quita solo su parte. Apagado no cuenta.
 * - Ninguno encendido: se paga el 100% del tabulador.
 * - Falta de asistencia (no el faltante de efectivo) → 0% por 8 días; el nombre vuelve al cumplirlos.
 * - Evaluación: vigencia 15 días. Checklist: semana. Inventario: 8 días / día de tienda.
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
      label: 'Cero faltante de efectivo',
      /** Si true, faltante deja el % en 0 de golpe (turno con faltante en esa recolección). */
      esRequisito: true,
      penalizacionPct: 25,
    },
    checklistDiario: {
      activo: true,
      label: 'Check list operativo (días laborales)',
      diasEsperados: 6,
      /** Penaliza si días con checklist son estrictamente menores a este valor. */
      diasPenalizaSiHasta: 4,
      penalizacionPct: 25,
    },
    evaluacionMinPct: {
      activo: true,
      label: 'Evaluación operativa',
      minPct: 70,
      penalizacionPct: 25,
      /** Días que permanece vigente la evaluación para el medidor. */
      ventanaDias: DIAS_VENTANA_EVALUACION_BONO,
    },
    mermaMaxPct: {
      activo: true,
      label: 'Inventario (merma)',
      maxPct: 6,
      penalizacionPct: 25,
      /** Días de vigencia del medidor según merma del último inventario (día de tienda). */
      ventanaDias: DIAS_VENTANA_INVENTARIO_BONO,
    },
    retardos: {
      activo: true,
      label: 'Retardos (reloj)',
      /** Minutos después de la hora de entrada del turno. */
      toleranciaMinutos: 15,
      /** Con estos retardos en el periodo se pierde la parte de este factor. */
      maxRetardos: 3,
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
  // Primera vez / configs viejas: umbrales 2.5%/75% → 6%/70%; castigos 20/20/60 → 25.
  const migrarUmbrales = r.modoCalculo == null
    && reglasIn.mermaMaxPct?.penalizacionPct == null
    && reglasIn.evaluacionMinPct?.penalizacionPct == null;
  const mermaMaxDefault = migrarUmbrales && Number(reglasIn.mermaMaxPct?.maxPct) === 2.5
    ? base.reglas.mermaMaxPct.maxPct
    : num(reglasIn.mermaMaxPct?.maxPct, base.reglas.mermaMaxPct.maxPct);
  const evalMinDefault = migrarUmbrales && Number(reglasIn.evaluacionMinPct?.minPct) === 75
    ? base.reglas.evaluacionMinPct.minPct
    : num(reglasIn.evaluacionMinPct?.minPct, base.reglas.evaluacionMinPct.minPct);
  const migrarPen25 = (val, viejo) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return base.reglas.checklistDiario.penalizacionPct;
    if (n === viejo) return 25;
    return n;
  };
  const penCheckIn = reglasIn.checklistDiario?.penalizacionPct;
  const penEvalIn = reglasIn.evaluacionMinPct?.penalizacionPct;
  const penMermaIn = reglasIn.mermaMaxPct?.penalizacionPct;
  const penCheck = penCheckIn == null ? 25 : migrarPen25(penCheckIn, 20);
  const penEval = penEvalIn == null ? 25 : migrarPen25(penEvalIn, 20);
  const penMerma = penMermaIn == null ? 25 : migrarPen25(penMermaIn, 60);
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
        // Default true (requisito duro). Solo false si se guarda explícitamente.
        esRequisito: reglasIn.faltanteCero?.esRequisito !== false,
        penalizacionPct: Math.max(0, Math.min(100, round2(num(
          reglasIn.faltanteCero?.penalizacionPct,
          base.reglas.faltanteCero.penalizacionPct,
        )))),
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
        penalizacionPct: Math.max(0, Math.min(100, round2(penCheck))),
      },
      evaluacionMinPct: {
        activo: reglasIn.evaluacionMinPct?.activo !== false,
        label: String(reglasIn.evaluacionMinPct?.label || base.reglas.evaluacionMinPct.label),
        minPct: round2(evalMinDefault),
        penalizacionPct: Math.max(0, Math.min(100, round2(penEval))),
        ventanaDias: Math.max(1, Math.round(num(
          reglasIn.evaluacionMinPct?.ventanaDias,
          base.reglas.evaluacionMinPct.ventanaDias ?? DIAS_VENTANA_EVALUACION_BONO,
        ))),
      },
      mermaMaxPct: {
        activo: reglasIn.mermaMaxPct?.activo !== false,
        label: String(reglasIn.mermaMaxPct?.label || base.reglas.mermaMaxPct.label),
        maxPct: round2(mermaMaxDefault),
        penalizacionPct: Math.max(0, Math.min(100, round2(penMerma))),
        ventanaDias: Math.max(1, Math.round(num(
          reglasIn.mermaMaxPct?.ventanaDias,
          base.reglas.mermaMaxPct.ventanaDias ?? DIAS_VENTANA_INVENTARIO_BONO,
        ))),
      },
      retardos: {
        activo: reglasIn.retardos?.activo !== false,
        label: String(reglasIn.retardos?.label || base.reglas.retardos.label),
        toleranciaMinutos: Math.max(0, Math.min(180, Math.round(num(
          reglasIn.retardos?.toleranciaMinutos,
          base.reglas.retardos.toleranciaMinutos,
        )))),
        maxRetardos: Math.max(1, Math.round(num(
          reglasIn.retardos?.maxRetardos,
          base.reglas.retardos.maxRetardos,
        ))),
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

export const IDS_FACTORES_BONO = ['faltanteCero', 'checklistDiario', 'evaluacionMinPct', 'mermaMaxPct', 'retardos'];

/** Cuántos factores están encendidos y qué parte del 100% vale cada uno. */
export function pesosFactoresBono(config = null) {
  const cfg = normalizarBonosConfig(config || leerBonosConfig());
  const activos = IDS_FACTORES_BONO.filter((id) => cfg.reglas[id]?.activo);
  const n = activos.length;
  const peso = n > 0 ? round2(100 / n) : 0;
  return { activos, n, peso };
}

function juicioFactorBono(id, reglas, metricas) {
  if (id === 'faltanteCero') {
    const ok = metricas.faltanteOk !== false;
    return {
      ok,
      valor: ok ? 'Sin faltante' : 'Con faltante',
      requerido: '$0.00',
    };
  }
  if (id === 'checklistDiario') {
    const dias = Math.max(0, Math.round(Number(metricas.checklistDias) || 0));
    const minimo = Number(reglas.checklistDiario.diasPenalizaSiHasta) || 4;
    const esperados = Number(reglas.checklistDiario.diasEsperados) || 6;
    return {
      ok: dias >= minimo,
      valor: `${dias}/${esperados} días`,
      requerido: `≥${minimo} días (ideal ${esperados})`,
    };
  }
  if (id === 'evaluacionMinPct') {
    const minPct = Number(reglas.evaluacionMinPct.minPct) || 70;
    const ep = metricas.evaluacionPct;
    const ok = ep != null && Number.isFinite(Number(ep)) && Number(ep) >= minPct;
    return {
      ok,
      valor: ep == null || !Number.isFinite(Number(ep)) ? 'Sin evaluación' : `${round2(Number(ep))}%`,
      requerido: `≥ ${minPct}%`,
    };
  }
  if (id === 'retardos') {
    const tol = Number(reglas.retardos?.toleranciaMinutos);
    const max = Number(reglas.retardos?.maxRetardos) || 3;
    return {
      ok: true,
      porEmpleado: true,
      valor: 'Reloj de empleados',
      requerido: `${max} retardos · tolerancia ${Number.isFinite(tol) ? tol : 15} min`,
    };
  }
  const maxPct = Number(reglas.mermaMaxPct.maxPct) || 6;
  const mp = Number(metricas.mermaPct);
  return {
    ok: Number.isFinite(mp) && mp <= maxPct,
    valor: Number.isFinite(mp) ? `${round2(mp)}%` : 'Sin dato',
    requerido: `≤ ${maxPct}%`,
  };
}

/**
 * % del bono según los factores encendidos.
 * Cada uno vale 100 / N. El % es la suma de los que se cumplen.
 * Sin ninguno encendido, el tabulador se paga al 100%.
 *
 * @param {{
 *   faltanteOk: boolean,
 *   checklistDias: number,
 *   evaluacionPct: number|null,
 *   mermaPct: number,
 * }} metricas
 * @param {object|null} config
 */
export function calcularPctBonoPorPenalizaciones(metricas = {}, config = null) {
  const cfg = normalizarBonosConfig(config || leerBonosConfig());
  const { activos, n, peso } = pesosFactoresBono(cfg);
  if (!n) {
    return {
      pct: 100,
      detalle: [],
      penalizacionTotal: 0,
      bloqueadoPorFaltante: false,
      fallosLineamiento: 0,
      factoresActivos: 0,
      pesoFactor: 0,
    };
  }

  const detalle = activos.map((id) => {
    const juicio = juicioFactorBono(id, cfg.reglas, metricas);
    return {
      id,
      label: cfg.reglas[id].label,
      ok: juicio.ok,
      pesoPct: peso,
      penalizacionPct: juicio.ok ? 0 : peso,
      valor: juicio.valor,
      requerido: juicio.requerido,
      porEmpleado: juicio.porEmpleado === true,
    };
  });
  const cumplidas = detalle.filter((d) => d.ok).length;
  const pct = round2((cumplidas / n) * 100);

  return {
    pct,
    detalle,
    penalizacionTotal: round2(100 - pct),
    bloqueadoPorFaltante: false,
    fallosLineamiento: n - cumplidas,
    factoresActivos: n,
    pesoFactor: peso,
  };
}

/**
 * Pago de bono por empleado de tienda (ecuación justa).
 *
 * - pctTienda = % tras lineamientos (100 / 75 / 50 / 25 / 0).
 * - Si el empleado tiene falta vigente → pct = 0.
 * - pago = base_tabulador × pct_empleado / 100.
 *
 * @param {{
 *   base: number,
 *   pctTienda: number,
 *   plantilla?: Array<{ id: string|number, nombre?: string }>,
 *   bloqueosFalta?: Array<{ clave?: string, nombre?: string }>,
 *   pesoRetardo?: number,
 *   umbralRetardos?: number,
 *   retardosPorClave?: Record<string, number>,
 * }} opts
 */
export function calcularPagosBonoPorEmpleado({
  base = 0,
  pctTienda = 0,
  plantilla = [],
  bloqueosFalta = [],
  pesoRetardo = 0,
  umbralRetardos = 3,
  retardosPorClave = {},
} = {}) {
  const baseN = round2(Number(base) || 0);
  const pctT = Math.max(0, Math.min(100, Number(pctTienda) || 0));
  const bloqueados = new Set(
    (bloqueosFalta || [])
      .map((b) => String(b?.clave || '').trim())
      .filter(Boolean),
  );

  return (plantilla || []).map((u) => {
    const id = u?.id != null ? String(u.id) : '';
    const clave = id ? `id:${id}` : '';
    const nombre = String(u?.nombre || 'Sin nombre').trim() || 'Sin nombre';
    const conFalta = Boolean(clave && bloqueados.has(clave));
    const nRet = Math.max(0, Math.round(Number(retardosPorClave?.[clave] ?? retardosPorClave?.[id]) || 0));
    const pesoR = Math.max(0, Number(pesoRetardo) || 0);
    const pierdeRetardo = !conFalta && pesoR > 0 && nRet >= Math.max(1, Number(umbralRetardos) || 3);
    const pct = conFalta ? 0 : round2(Math.max(0, Math.min(100, pctT - (pierdeRetardo ? pesoR : 0))));
    const pago = bonoFinal(baseN, pct);
    const money = (n) => `$${n.toLocaleString('es-MX')}`;
    const ecuacion = conFalta
      ? `${nombre} · ${money(baseN)} × 0% (falta) = $0`
      : pierdeRetardo
        ? `${nombre} · ${money(baseN)} × ${pct}% (${nRet} retardos) = ${money(pago)}`
        : `${nombre} · ${money(baseN)} × ${pct}% = ${money(pago)}`;
    return {
      id,
      clave,
      nombre,
      conFalta,
      retardos: nRet,
      pierdeRetardo,
      base: baseN,
      pctTienda: pctT,
      pct,
      pago,
      ecuacion,
    };
  }).sort((a, b) => {
    if (a.conFalta !== b.conFalta) return a.conFalta ? 1 : -1;
    if (b.pago !== a.pago) return b.pago - a.pago;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}
