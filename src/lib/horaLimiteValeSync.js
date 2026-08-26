/**
 * Sincroniza la hora límite de vales (sin autorización) entre todas las cajas.
 * Persistencia local: localStorage · nube: pos_hora_limite_vale (fila GLOBAL).
 */
import {
  etiquetaHoraLimiteVale,
  guardarHoraLimiteVale,
  leerHoraLimiteVale,
  normalizarHoraLimiteVale,
} from './contabilidadConstants.js';

export const AVISO_FALTA_HORA_LIMITE_VALE =
  'Ejecuta supabase/fix_hora_limite_vale.sql en Supabase para sincronizar la hora límite de vales entre todas las cajas.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_hora_limite_vale')
    || (msg.includes('schema cache') && msg.includes('hora_limite'))
  );
}

/** Descarga la hora GLOBAL y actualiza localStorage si cambió. */
export async function sincronizarHoraLimiteValeDesdeNube(supabase) {
  if (!supabase) return { ok: true, cambio: false };
  const { data, error } = await supabase
    .from('pos_hora_limite_vale')
    .select('id, etiqueta, minutos, updated_at')
    .eq('id', 'GLOBAL')
    .maybeSingle();

  if (error) {
    if (faltaTabla(error)) {
      return { ok: true, aviso: AVISO_FALTA_HORA_LIMITE_VALE, cambio: false, sinTabla: true };
    }
    return { ok: false, error: error.message, cambio: false };
  }
  if (!data) return { ok: true, cambio: false };

  const remota = normalizarHoraLimiteVale(data.etiqueta || data.minutos);
  const localMin = leerHoraLimiteVale();
  const localEtq = etiquetaHoraLimiteVale();
  const cambio = localMin !== remota.minutos || localEtq !== remota.etiqueta;
  if (cambio) guardarHoraLimiteVale(remota.etiqueta);
  return { ok: true, cambio, cfg: remota };
}

/** Guarda en nube + este equipo. */
export async function aplicarHoraLimiteValeNube(supabase, hora) {
  const cfg = normalizarHoraLimiteVale(hora);
  // Siempre actualiza local (caja admin / offline).
  guardarHoraLimiteVale(cfg.etiqueta);

  if (!supabase) {
    return {
      ok: true,
      cfg,
      soloLocal: true,
      aviso: 'Guardada solo en este equipo (sin conexión). Ejecuta fix_hora_limite_vale.sql y vuelve a guardar.',
    };
  }

  const { error } = await supabase.from('pos_hora_limite_vale').upsert(
    {
      id: 'GLOBAL',
      etiqueta: cfg.etiqueta,
      minutos: cfg.minutos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    if (faltaTabla(error)) {
      return {
        ok: true,
        cfg,
        soloLocal: true,
        aviso: AVISO_FALTA_HORA_LIMITE_VALE,
        sinTabla: true,
      };
    }
    return { ok: false, error: error.message, cfg };
  }

  return { ok: true, cfg };
}
