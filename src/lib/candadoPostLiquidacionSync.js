/**
 * Sincroniza el candado post-liquidación entre todas las cajas.
 * Persistencia local: localStorage · nube: pos_candado_post_liquidacion (fila GLOBAL).
 */
import {
  guardarCandadoPostLiquidacion,
  leerCandadoPostLiquidacion,
} from './candadoPostLiquidacion.js';

export const AVISO_FALTA_CANDADO_POST_LIQUIDACION =
  'Ejecuta supabase/fix_candado_post_liquidacion.sql en Supabase para sincronizar el candado entre todas las cajas.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_candado_post_liquidacion')
    || (msg.includes('schema cache') && msg.includes('candado'))
  );
}

function normalizarActivo(val) {
  if (val === false || val === 0 || val === '0' || val === 'false') return false;
  return true;
}

/** Descarga la fila GLOBAL y actualiza localStorage si cambió. */
export async function sincronizarCandadoPostLiquidacionDesdeNube(supabase) {
  if (!supabase) return { ok: true, cambio: false };
  const { data, error } = await supabase
    .from('pos_candado_post_liquidacion')
    .select('id, activo, updated_at')
    .eq('id', 'GLOBAL')
    .maybeSingle();

  if (error) {
    if (faltaTabla(error)) {
      return { ok: true, aviso: AVISO_FALTA_CANDADO_POST_LIQUIDACION, cambio: false, sinTabla: true };
    }
    return { ok: false, error: error.message, cambio: false };
  }
  if (!data) return { ok: true, cambio: false };

  const remoto = normalizarActivo(data.activo);
  const local = leerCandadoPostLiquidacion();
  const cambio = local !== remoto;
  if (cambio) guardarCandadoPostLiquidacion(remoto);
  return { ok: true, cambio, activo: remoto };
}

/** Guarda en nube + este equipo. */
export async function aplicarCandadoPostLiquidacionNube(supabase, activo) {
  const next = normalizarActivo(activo);
  guardarCandadoPostLiquidacion(next);

  if (!supabase) {
    return {
      ok: true,
      activo: next,
      soloLocal: true,
      aviso: 'Guardado solo en este equipo (sin conexión). Ejecuta fix_candado_post_liquidacion.sql y vuelve a guardar.',
    };
  }

  const { error } = await supabase.from('pos_candado_post_liquidacion').upsert(
    {
      id: 'GLOBAL',
      activo: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    if (faltaTabla(error)) {
      return {
        ok: true,
        activo: next,
        soloLocal: true,
        aviso: AVISO_FALTA_CANDADO_POST_LIQUIDACION,
        sinTabla: true,
      };
    }
    return { ok: false, error: error.message, activo: next };
  }

  return { ok: true, activo: next };
}
