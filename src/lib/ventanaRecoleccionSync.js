import {
  guardarVentanaRecoleccion,
  leerVentanaRecoleccion,
  HORA_INICIO_RECOLECCION_DEFAULT,
  HORA_FIN_RECOLECCION_DEFAULT,
} from './ventanaRecoleccion.js';
import { listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';

export const AVISO_FALTA_VENTANA_RECOLECCION =
  'Ejecuta supabase/fix_ventana_recoleccion.sql en Supabase para sincronizar la ventana entre tiendas.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('pos_ventana_recoleccion') ||
    (msg.includes('schema cache') && msg.includes('ventana'))
  );
}

function clampHora(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(23, Math.max(0, Math.floor(v)));
}

function normalizarCfg(row) {
  let horaInicio = clampHora(row?.hora_inicio ?? row?.horaInicio, HORA_INICIO_RECOLECCION_DEFAULT);
  let horaFin = clampHora(row?.hora_fin ?? row?.horaFin, HORA_FIN_RECOLECCION_DEFAULT);
  if (horaFin <= horaInicio) {
    horaInicio = HORA_INICIO_RECOLECCION_DEFAULT;
    horaFin = HORA_FIN_RECOLECCION_DEFAULT;
  }
  return { horaInicio, horaFin };
}

/** Descarga la ventana de la sucursal activa (o GLOBAL) y actualiza localStorage. */
export async function sincronizarVentanaRecoleccionDesdeNube(supabase, sucursal) {
  if (!supabase) return { ok: true, cambio: false };
  const sid = normalizarCodigoTienda(sucursal) || 'MAIN';

  const { data, error } = await supabase
    .from('pos_ventana_recoleccion')
    .select('sucursal_id, hora_inicio, hora_fin, updated_at')
    .in('sucursal_id', [sid, 'GLOBAL', '*'])
    .order('updated_at', { ascending: false });

  if (error) {
    if (faltaTabla(error)) return { ok: true, aviso: AVISO_FALTA_VENTANA_RECOLECCION, cambio: false, sinTabla: true };
    return { ok: false, error: error.message, cambio: false };
  }

  const rows = data || [];
  const propia = rows.find((r) => normalizarCodigoTienda(r.sucursal_id) === sid);
  const global = rows.find((r) => {
    const id = String(r.sucursal_id || '').toUpperCase();
    return id === 'GLOBAL' || id === '*';
  });
  const remota = propia || global;
  if (!remota) return { ok: true, cambio: false };

  const cfg = normalizarCfg(remota);
  const local = leerVentanaRecoleccion();
  const cambio = local.horaInicio !== cfg.horaInicio || local.horaFin !== cfg.horaFin;
  if (cambio) guardarVentanaRecoleccion(cfg);
  return { ok: true, cambio, cfg };
}

/**
 * Aplica la ventana a las tiendas indicadas (o a todas las operativas).
 * @param {object} opts
 * @param {{ horaInicio: number, horaFin: number }} opts.cfg
 * @param {string[]} [opts.tiendas] — códigos; vacío o null = todas operativas
 * @param {boolean} [opts.incluirGlobal=true] — también guarda fila GLOBAL como fallback
 */
export async function aplicarVentanaRecoleccionATiendas(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const cfg = normalizarCfg(opts.cfg || {});
  if (cfg.horaFin <= cfg.horaInicio) {
    return { ok: false, error: 'La hora de fin debe ser mayor que la de inicio.' };
  }

  let tiendas = (opts.tiendas || []).map(normalizarCodigoTienda).filter(Boolean);
  if (!tiendas.length) {
    tiendas = listarSucursalesOperativas();
  }
  const incluirGlobal = opts.incluirGlobal !== false;
  const updated_at = new Date().toISOString();
  const filas = tiendas.map((sucursal_id) => ({
    sucursal_id,
    hora_inicio: cfg.horaInicio,
    hora_fin: cfg.horaFin,
    updated_at,
  }));
  if (incluirGlobal) {
    filas.push({
      sucursal_id: 'GLOBAL',
      hora_inicio: cfg.horaInicio,
      hora_fin: cfg.horaFin,
      updated_at,
    });
  }

  const { error } = await supabase.from('pos_ventana_recoleccion').upsert(filas, { onConflict: 'sucursal_id' });
  if (error) {
    if (faltaTabla(error)) return { ok: false, aviso: AVISO_FALTA_VENTANA_RECOLECCION, sinTabla: true, error: error.message };
    return { ok: false, error: error.message };
  }

  // Actualiza este equipo de inmediato
  guardarVentanaRecoleccion(cfg);
  return { ok: true, tiendas, cfg, updated_at };
}
