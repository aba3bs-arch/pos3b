import {
  aplicarPaqueteTurnosLocal,
  leerPaqueteTurnos,
  leerToleranciaTurnos,
  leerToleranciaTurnosUpdatedAt,
  marcarToleranciaTurnosUpdatedAt,
  plantillaPaquete12x12,
  sucursalTurnosActiva,
  TOLERANCIA_TURNOS_DEFAULT,
  normalizarHora,
  normalizarInicioPlantilla12x12,
  normalizarToleranciaTurnos,
} from './turnos.js';
import { listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';

export const AVISO_FALTA_TURNOS_CONFIG =
  'Ejecuta supabase/fix_turnos_config.sql en Supabase para la tabla dedicada de turnos por tienda. Mientras tanto se usa el almacén compartido de config.';

/** Prefijo en pos_bonos_config cuando aún no existe pos_turnos_config. */
const FALLBACK_ID_PREFIX = 'turnos_cfg:';

function faltaTablaTurnos(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('pos_turnos_config') ||
    (msg.includes('schema cache') && msg.includes('turnos_config'))
  );
}

/**
 * Clave de nube para turnos: MAIN/CEDIS → GLOBAL (las cajas nunca leen "MAIN").
 */
export function sucursalIdTurnosNube(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!c || c === 'MAIN' || c === 'CEDIS' || c === 'GLOBAL' || c === '*') return 'GLOBAL';
  return c;
}

function normalizarTurnosLista(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((t) => ({
      id: String(t?.id || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, ''),
      nombre: String(t?.nombre || t?.id || 'Turno').trim(),
      hora_inicio: normalizarHora(t?.hora_inicio) || '07:00',
      hora_fin: normalizarHora(t?.hora_fin) || '19:00',
    }))
    .filter((t) => t.id && t.nombre);
}

/**
 * @param {object|null|undefined} tol
 * @param {{ fallbackLocal?: object, exigirPresente?: boolean }} [opts]
 * - Si tolerancia remota está ausente y hay fallbackLocal, conserva la local (no vuelve a 30).
 */
export function normalizarTolerancia(tol, opts = {}) {
  if (tol == null || (typeof tol === 'object' && !Object.keys(tol).length)) {
    if (opts.fallbackLocal) return normalizarToleranciaTurnos(opts.fallbackLocal);
    if (opts.exigirPresente) return null;
    return { ...TOLERANCIA_TURNOS_DEFAULT };
  }
  return normalizarToleranciaTurnos(tol);
}

export function normalizarPaqueteTurnosRemoto(row, opts = {}) {
  const turnos = normalizarTurnosLista(row?.turnos);
  const inicio = normalizarInicioPlantilla12x12(row?.inicio || row?.config?.inicio || '07:00');
  const tipo = ['12x12', '8x24', 'personalizado'].includes(row?.tipo_horario)
    ? row.tipo_horario
    : row?.config?.tipo || '12x12';
  const subtipo = row?.subtipo ?? row?.config?.subtipo ?? null;
  const paqueteBase = turnos.length ? null : plantillaPaquete12x12(inicio, { incluirToleranciaDefault: true });
  const toleranciaRemota = row?.tolerancia ?? row?.config?.tolerancia;
  const tolerancia = normalizarTolerancia(toleranciaRemota, {
    fallbackLocal: opts.fallbackToleranciaLocal,
  });
  return {
    config: {
      tipo,
      subtipo: tipo === 'personalizado' ? subtipo : null,
      inicio: normalizarHora(row?.inicio) || inicio,
    },
    turnos: turnos.length ? turnos : paqueteBase.turnos,
    tolerancia,
    patrones: Array.isArray(row?.patrones_rotacion_3) ? row.patrones_rotacion_3 : undefined,
    updated_at: row?.updated_at || null,
  };
}

function paqueteIgual(a, b) {
  try {
    const pick = (p) =>
      JSON.stringify({
        config: p?.config,
        turnos: p?.turnos,
        tolerancia: p?.tolerancia,
      });
    return pick(a) === pick(b);
  } catch {
    return false;
  }
}

/** True si remoto es más reciente o igual que local (LWW). Sin fechas → aplicar remoto. */
export function remotoEsMasRecienteOIgual(remotoIso, localIso) {
  if (!remotoIso) return false;
  if (!localIso) return true;
  const r = Date.parse(remotoIso);
  const l = Date.parse(localIso);
  if (!Number.isFinite(r)) return false;
  if (!Number.isFinite(l)) return true;
  return r >= l;
}

function filaDesdePaquete(sucursalId, paquete) {
  const sid = sucursalIdTurnosNube(sucursalId);
  const p = normalizarPaqueteTurnosRemoto({
    ...paquete,
    tipo_horario: paquete?.config?.tipo,
    subtipo: paquete?.config?.subtipo,
    inicio: paquete?.config?.inicio,
    turnos: paquete?.turnos,
    tolerancia: paquete?.tolerancia ?? leerToleranciaTurnos(sid),
    patrones_rotacion_3: paquete?.patrones,
  });
  return {
    sucursal_id: sid,
    tipo_horario: p.config.tipo,
    subtipo: p.config.subtipo,
    inicio: p.config.inicio,
    turnos: p.turnos,
    tolerancia: p.tolerancia,
    patrones_rotacion_3: Array.isArray(paquete?.patrones) ? paquete.patrones : null,
    updated_at: new Date().toISOString(),
  };
}

async function leerFilaTablaTurnos(supabase, sucursalId) {
  const sid = sucursalIdTurnosNube(sucursalId);
  const { data, error } = await supabase
    .from('pos_turnos_config')
    .select('sucursal_id, tipo_horario, subtipo, inicio, turnos, tolerancia, patrones_rotacion_3, updated_at')
    .in('sucursal_id', [sid, 'GLOBAL', '*'])
    .order('updated_at', { ascending: false });
  if (error) return { error };
  const rows = data || [];
  const propia = rows.find((r) => sucursalIdTurnosNube(r.sucursal_id) === sid && sid !== 'GLOBAL');
  const global = rows.find((r) => {
    const id = String(r.sucursal_id || '').toUpperCase();
    return id === 'GLOBAL' || id === '*';
  });
  return { row: propia || global || null, fuente: 'pos_turnos_config' };
}

async function leerFilaFallbackBonos(supabase, sucursalId) {
  const sid = sucursalIdTurnosNube(sucursalId);
  const ids = [`${FALLBACK_ID_PREFIX}${sid}`, `${FALLBACK_ID_PREFIX}GLOBAL`];
  const { data, error } = await supabase
    .from('pos_bonos_config')
    .select('id, config, updated_at')
    .in('id', ids)
    .order('updated_at', { ascending: false });
  if (error) return { error };
  const rows = data || [];
  const propia = rows.find((r) => r.id === `${FALLBACK_ID_PREFIX}${sid}` && sid !== 'GLOBAL');
  const global = rows.find((r) => r.id === `${FALLBACK_ID_PREFIX}GLOBAL`);
  const hit = propia || global;
  if (!hit?.config) return { row: null, fuente: 'pos_bonos_config' };
  const cfg = hit.config;
  return {
    row: {
      sucursal_id: sid,
      tipo_horario: cfg.tipo_horario || cfg.config?.tipo,
      subtipo: cfg.subtipo,
      inicio: cfg.inicio,
      turnos: cfg.turnos,
      tolerancia: cfg.tolerancia,
      patrones_rotacion_3: cfg.patrones_rotacion_3 || cfg.patrones,
      updated_at: hit.updated_at,
    },
    fuente: 'pos_bonos_config',
  };
}

/** Descarga horarios de la sucursal (o GLOBAL) y actualiza el cache local de esa tienda. */
export async function sincronizarTurnosDesdeNube(supabase, sucursal) {
  if (!supabase) return { ok: true, cambio: false };
  try {
    const sid = sucursalTurnosActiva(sucursal);

    let remoto = await leerFilaTablaTurnos(supabase, sid);
    let aviso = null;
    let sinTablaDedicada = false;

    if (remoto.error && faltaTablaTurnos(remoto.error)) {
      sinTablaDedicada = true;
      aviso = AVISO_FALTA_TURNOS_CONFIG;
      remoto = await leerFilaFallbackBonos(supabase, sid);
      if (remoto.error) return { ok: false, error: remoto.error.message, cambio: false, aviso, sinTabla: true };
    } else if (remoto.error) {
      return { ok: false, error: remoto.error.message, cambio: false };
    }

    if (!remoto.row) return { ok: true, cambio: false, aviso, sinTabla: sinTablaDedicada };

    const local = leerPaqueteTurnos(sid);
    const localTolAt = leerToleranciaTurnosUpdatedAt(sid) || local.updated_at;
    const remotoAt = remoto.row.updated_at;

    const paquete = normalizarPaqueteTurnosRemoto(remoto.row, {
      fallbackToleranciaLocal: local.tolerancia,
    });

    // LWW solo sobre tolerancia: un remoto viejo con default 30 no debe pisar 45 local.
    // Horarios/config sí se actualizan para no desfasar plantillas.
    const tolRemotaGana = remotoEsMasRecienteOIgual(remotoAt, localTolAt);
    if (!tolRemotaGana && localTolAt) {
      paquete.tolerancia = local.tolerancia;
      paquete.updated_at = localTolAt;
    }

    const cambio = !paqueteIgual(local, paquete);
    if (cambio) {
      aplicarPaqueteTurnosLocal(sid, paquete);
      if (tolRemotaGana && remotoAt) marcarToleranciaTurnosUpdatedAt(sid, remotoAt);
    }
    return {
      ok: true,
      cambio,
      paquete,
      sucursal_id: sid,
      fuente: remoto.fuente,
      aviso,
      sinTabla: sinTablaDedicada,
      toleranciaProtegida: !tolRemotaGana && Boolean(localTolAt),
    };
  } catch (e) {
    // Nunca tumbar login / App por un fallo de sync de turnos.
    return { ok: false, error: e?.message || String(e), cambio: false };
  }
}

/**
 * Guarda el paquete de turnos en la nube para una o más tiendas.
 * @param {object} opts
 * @param {object} opts.paquete
 * @param {string[]} [opts.tiendas]
 * @param {boolean} [opts.incluirGlobal=false]
 */
export async function aplicarTurnosATiendas(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const paquete = opts.paquete || leerPaqueteTurnos(opts.tiendaActiva);
  let tiendas = (opts.tiendas || []).map(sucursalIdTurnosNube).filter(Boolean);
  // Deduplicar (varias selecciones MAIN/CEDIS → un solo GLOBAL)
  tiendas = [...new Set(tiendas)];
  if (!tiendas.length) {
    const una = sucursalIdTurnosNube(opts.tiendaActiva);
    tiendas = una && una !== 'GLOBAL' ? [una] : listarSucursalesOperativas().map(sucursalIdTurnosNube);
    tiendas = [...new Set(tiendas)];
  }
  const incluirGlobal = opts.incluirGlobal === true;
  const filas = tiendas.map((sucursal_id) => filaDesdePaquete(sucursal_id, paquete));
  if (incluirGlobal && !tiendas.includes('GLOBAL')) {
    filas.push(filaDesdePaquete('GLOBAL', paquete));
  }

  const { error } = await supabase.from('pos_turnos_config').upsert(filas, { onConflict: 'sucursal_id' });
  if (error && faltaTablaTurnos(error)) {
    // Fallback: pos_bonos_config con id turnos_cfg:<SUC>
    const fallbackRows = filas.map((f) => ({
      id: `${FALLBACK_ID_PREFIX}${f.sucursal_id}`,
      config: {
        tipo_horario: f.tipo_horario,
        subtipo: f.subtipo,
        inicio: f.inicio,
        turnos: f.turnos,
        tolerancia: f.tolerancia,
        patrones_rotacion_3: f.patrones_rotacion_3,
      },
      updated_at: f.updated_at,
    }));
    const { error: err2 } = await supabase.from('pos_bonos_config').upsert(fallbackRows, { onConflict: 'id' });
    if (err2) {
      return {
        ok: false,
        error: err2.message,
        aviso: AVISO_FALTA_TURNOS_CONFIG,
        sinTabla: true,
      };
    }
    for (const t of tiendas) {
      aplicarPaqueteTurnosLocal(t, { ...paquete, updated_at: filas[0]?.updated_at }, { silent: true });
      marcarToleranciaTurnosUpdatedAt(t, filas[0]?.updated_at);
    }
    aplicarPaqueteTurnosLocal(sucursalTurnosActiva(), { ...paquete, updated_at: filas[0]?.updated_at });
    return {
      ok: true,
      tiendas,
      paquete: normalizarPaqueteTurnosRemoto(filas[0]),
      fuente: 'pos_bonos_config',
      aviso: AVISO_FALTA_TURNOS_CONFIG,
      sinTabla: true,
    };
  }
  if (error) return { ok: false, error: error.message };

  for (const t of tiendas) {
    aplicarPaqueteTurnosLocal(t, { ...paquete, updated_at: filas[0]?.updated_at }, { silent: true });
    marcarToleranciaTurnosUpdatedAt(t, filas[0]?.updated_at);
  }
  // Refresca cache activo si coincide
  const activa = sucursalTurnosActiva();
  if (tiendas.includes(activa) || incluirGlobal || tiendas.includes('GLOBAL')) {
    aplicarPaqueteTurnosLocal(activa, { ...paquete, updated_at: filas[0]?.updated_at });
    marcarToleranciaTurnosUpdatedAt(activa, filas[0]?.updated_at);
  }

  return {
    ok: true,
    tiendas,
    paquete: normalizarPaqueteTurnosRemoto(filas[0]),
    fuente: 'pos_turnos_config',
  };
}

/** Carga el paquete de una tienda desde la nube (sin escribir local si no se pide). */
export async function cargarTurnosTiendaDesdeNube(supabase, sucursal, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin Supabase.', paquete: leerPaqueteTurnos(sucursal) };
  const sid = sucursalTurnosActiva(sucursal);
  let remoto = await leerFilaTablaTurnos(supabase, sid);
  let aviso = null;
  if (remoto.error && faltaTablaTurnos(remoto.error)) {
    aviso = AVISO_FALTA_TURNOS_CONFIG;
    remoto = await leerFilaFallbackBonos(supabase, sid);
    if (remoto.error) {
      return { ok: false, error: remoto.error.message, paquete: leerPaqueteTurnos(sid), aviso, sinTabla: true };
    }
  } else if (remoto.error) {
    return { ok: false, error: remoto.error.message, paquete: leerPaqueteTurnos(sid) };
  }

  if (!remoto.row) {
    const local = leerPaqueteTurnos(sid);
    return { ok: true, paquete: local, vacio: true, aviso };
  }
  const local = leerPaqueteTurnos(sid);
  const paquete = normalizarPaqueteTurnosRemoto(remoto.row, {
    fallbackToleranciaLocal: local.tolerancia,
  });
  if (opts.aplicarLocal !== false) {
    const localTolAt = leerToleranciaTurnosUpdatedAt(sid);
    if (!localTolAt || remotoEsMasRecienteOIgual(remoto.row.updated_at, localTolAt)) {
      aplicarPaqueteTurnosLocal(sid, paquete);
      if (remoto.row.updated_at) marcarToleranciaTurnosUpdatedAt(sid, remoto.row.updated_at);
    }
  }
  return { ok: true, paquete, aviso, fuente: remoto.fuente };
}
