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

/** Niveles de cumplimiento → % del bono base. */
export const NIVELES_PCT_DEFAULT = [
  { reglasMin: 4, pct: 100 },
  { reglasMin: 3, pct: 75 },
  { reglasMin: 2, pct: 50 },
  { reglasMin: 1, pct: 25 },
  { reglasMin: 0, pct: 0 },
];

export const BONOS_CONFIG_DEFAULT = {
  activo: true,
  /** Semana nómina (sáb–vie) o día. */
  periodo: 'semana',
  rangos: RANGOS_BONO_DEFAULT.map((r) => ({ ...r })),
  nivelesPct: NIVELES_PCT_DEFAULT.map((n) => ({ ...n })),
  reglas: {
    faltanteCero: { activo: true, label: 'Faltante de efectivo = $0' },
    mermaMaxPct: { activo: true, label: 'Merma de inventario', maxPct: 2.5 },
    evaluacionMinPct: { activo: true, label: 'Evaluación operativa', minPct: 75 },
    checklistDiario: { activo: true, label: 'Check list operativo diario' },
  },
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

export function normalizarBonosConfig(raw) {
  const base = BONOS_CONFIG_DEFAULT;
  const r = raw && typeof raw === 'object' ? raw : {};
  const reglasIn = r.reglas && typeof r.reglas === 'object' ? r.reglas : {};
  return {
    activo: r.activo !== false,
    periodo: r.periodo === 'dia' ? 'dia' : 'semana',
    rangos: normalizarRangos(r.rangos),
    nivelesPct: normalizarNivelesPct(r.nivelesPct),
    reglas: {
      faltanteCero: {
        activo: reglasIn.faltanteCero?.activo !== false,
        label: String(reglasIn.faltanteCero?.label || base.reglas.faltanteCero.label),
      },
      mermaMaxPct: {
        activo: reglasIn.mermaMaxPct?.activo !== false,
        label: String(reglasIn.mermaMaxPct?.label || base.reglas.mermaMaxPct.label),
        maxPct: round2(num(reglasIn.mermaMaxPct?.maxPct, base.reglas.mermaMaxPct.maxPct)),
      },
      evaluacionMinPct: {
        activo: reglasIn.evaluacionMinPct?.activo !== false,
        label: String(reglasIn.evaluacionMinPct?.label || base.reglas.evaluacionMinPct.label),
        minPct: round2(num(reglasIn.evaluacionMinPct?.minPct, base.reglas.evaluacionMinPct.minPct)),
      },
      checklistDiario: {
        activo: reglasIn.checklistDiario?.activo !== false,
        label: String(reglasIn.checklistDiario?.label || base.reglas.checklistDiario.label),
      },
    },
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

/** % según cuántas reglas se cumplieron. */
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
