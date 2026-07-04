import { guardarTipoCambio, leerTipoCambio, leerTipoCambioMeta } from './posConfig.js';

const AVISO_SIN_TABLA =
  'Opcional: ejecuta supabase/fix_tipo_cambio_global.sql para sincronizar el tipo de cambio entre todas las sucursales.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('pos_config');
}

function ts(val) {
  const n = Date.parse(val);
  return Number.isFinite(n) ? n : 0;
}

function normalizarValor(val) {
  const v = Math.max(0.01, parseFloat(val) || 17.5);
  return Number.isFinite(v) ? v : 17.5;
}

/** Descarga tipo de cambio global si la nube tiene una versión más reciente. */
export async function sincronizarTipoCambioDesdeNube(supabase) {
  if (!supabase) return { ok: true, aviso: null, cambio: false };
  const { data, error } = await supabase
    .from('pos_config')
    .select('tipo_cambio, updated_at')
    .eq('id', 'global')
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: true, aviso: AVISO_SIN_TABLA, cambio: false, sinTabla: true };
    return { ok: false, error: error.message, cambio: false };
  }
  if (!data?.tipo_cambio) return { ok: true, cambio: false };

  const remotoVal = normalizarValor(data.tipo_cambio);
  const remotoAt = data.updated_at || null;
  const localAt = leerTipoCambioMeta();
  const remotoMs = ts(remotoAt);
  const localMs = ts(localAt);
  const localVal = leerTipoCambio();

  if (remotoMs >= localMs && remotoMs > 0) {
    const cambio = remotoMs > localMs || Math.abs(remotoVal - localVal) > 0.0001;
    if (cambio) guardarTipoCambio(remotoVal, { updatedAt: remotoAt });
    return { ok: true, cambio };
  }
  return { ok: true, cambio: false };
}

/** Sube tipo de cambio a Supabase (mismo valor en todas las sucursales). */
export async function subirTipoCambioANube(supabase, valor) {
  if (!supabase) return { ok: true, aviso: null };
  const tipo_cambio = normalizarValor(valor);
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from('pos_config').upsert({
    id: 'global',
    tipo_cambio,
    updated_at,
  });
  if (error) {
    if (faltaTabla(error)) return { ok: false, aviso: AVISO_SIN_TABLA, sinTabla: true, error: error.message };
    return { ok: false, error: error.message };
  }
  return { ok: true, updated_at, tipo_cambio };
}
