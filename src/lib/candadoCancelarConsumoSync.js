/**
 * Sincroniza el candado de consumo por empleado entre todas las cajas.
 * Nube: pos_candado_cancelar_consumo.empleados (json de la fila GLOBAL).
 */
import {
  guardarCandadoCancelarConsumo,
  leerCandadoCancelarConsumo,
  normalizarCandadoCancelarConsumo,
} from './candadoCancelarConsumo.js';

export const AVISO_FALTA_CANDADO_CANCELAR_CONSUMO =
  'Ejecuta supabase/fix_candado_cancelar_consumo.sql en Supabase para sincronizar el candado entre todas las cajas.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_candado_cancelar_consumo')
    || (msg.includes('schema cache') && msg.includes('candado_cancelar_consumo'))
  );
}

export async function sincronizarCandadoCancelarConsumoDesdeNube(supabase) {
  if (!supabase) return { ok: true, cambio: false };
  const { data, error } = await supabase
    .from('pos_candado_cancelar_consumo')
    .select('id, empleados, updated_at')
    .eq('id', 'GLOBAL')
    .maybeSingle();

  if (error) {
    if (faltaTabla(error)) {
      return { ok: true, aviso: AVISO_FALTA_CANDADO_CANCELAR_CONSUMO, cambio: false, sinTabla: true };
    }
    return { ok: false, error: error.message, cambio: false };
  }
  if (!data) return { ok: true, cambio: false };

  const remoto = normalizarCandadoCancelarConsumo(data);
  const local = leerCandadoCancelarConsumo();
  const cambio = JSON.stringify(local.empleados) !== JSON.stringify(remoto.empleados);
  if (cambio) guardarCandadoCancelarConsumo({ empleados: remoto.empleados });
  return { ok: true, cambio, ...remoto };
}

export async function aplicarCandadoCancelarConsumoNube(supabase, parcial) {
  const next = guardarCandadoCancelarConsumo(parcial);
  if (!supabase) {
    return {
      ok: true,
      ...next,
      soloLocal: true,
      aviso: 'Guardado solo en este equipo (sin conexión). Ejecuta fix_candado_cancelar_consumo.sql y vuelve a guardar.',
    };
  }

  const { error } = await supabase.from('pos_candado_cancelar_consumo').upsert(
    {
      id: 'GLOBAL',
      empleados: next.empleados,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    if (faltaTabla(error)) {
      return {
        ok: true,
        ...next,
        soloLocal: true,
        aviso: AVISO_FALTA_CANDADO_CANCELAR_CONSUMO,
        sinTabla: true,
      };
    }
    return { ok: false, error: error.message, ...next };
  }

  return { ok: true, ...next };
}
