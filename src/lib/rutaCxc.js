/**
 * Crédito por cobrar de Venta en Ruta.
 * Cargos por venta a crédito + créditos de Recolecciones (Entrega Crédito).
 * El cajero paga con PIN → gasto abarrotes + efectivo a RC/VentaRuta (tránsito).
 */

import { normalizarCodigoTienda, etiquetaTienda } from '../constants/sucursales.js';
import { buscarUsuarioPorPinYSucursal } from './usuariosAuth.js';
import { normalizarRol, rolSistemaEfectivo } from './roles.js';
import { registrarEfectivoTransitoVentaRuta } from './rutaTransito.js';

/** Prefijo carga_id / notas para créditos nacidos en Recolecciones. */
export const PREFIJO_CXC_RECOLECCION = 'rec:';

const LS_CXC = 'pos3b_ruta_cxc_movimientos';

export const AVISO_FALTA_CXC =
  'Falta la tabla de crédito/cobranza. En Supabase ejecuta supabase/fix_autofin_y_venta_ruta_completo.sql (o fix_precio_ruta_y_cxc.sql + fix_venta_ruta_pos_v2.sql).';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Solo tabla ausente. No confundir con columna faltante (p. ej. carga_id en schema cache). */
function faltaTabla(error) {
  if (error?.code === '42P01') return true;
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('could not find the table') && msg.includes('ruta_cxc')) return true;
  if (msg.includes('relation') && msg.includes('ruta_cxc') && msg.includes('does not exist')) return true;
  return false;
}

function errorColumnaCxc(error) {
  const msg = String(error?.message || error || '');
  return /carga_id|estatus|folio_venta|pagado_por|pagado_at|gasto_id|schema cache/i.test(msg)
    && !faltaTabla(error);
}

function leerLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_CXC) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS_CXC, JSON.stringify(lista.slice(0, 3000)));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `cxc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function claveCliente(tipo, id) {
  return `${String(tipo || 'sucursal')}:${String(id || '')}`;
}

/** @deprecated — usar precioRutaEspecial de ventaEnRuta.js */
export function precioCedisRuta(producto) {
  const p = Number(producto?.precio_ruta);
  if (Number.isFinite(p) && p > 0) return round2(p);
  return null;
}

function esCargoPendienteCxc(m) {
  if (!m || m.tipo !== 'cargo') return false;
  if (m.pagado_at) return false;
  const est = String(m.estatus || 'pendiente').toLowerCase();
  return est === 'pendiente' || est === '' || est === 'null';
}

export async function listarMovimientosCxc(supabase, { clienteTipo, clienteId, limit = 500, soloPendientes } = {}) {
  if (!supabase) {
    let list = leerLocal();
    if (clienteId) {
      list = list.filter(
        (m) => String(m.cliente_tipo) === String(clienteTipo || m.cliente_tipo) && String(m.cliente_id) === String(clienteId),
      );
    }
    if (soloPendientes) list = list.filter(esCargoPendienteCxc);
    return { data: list.slice(0, limit) };
  }
  // Con pendientes: traer cargos y filtrar en cliente (incluye estatus null / sin columna).
  let q = supabase.from('ruta_cxc_movimientos').select('*').order('created_at', { ascending: false }).limit(soloPendientes ? Math.max(limit, 1000) : limit);
  if (clienteId) {
    q = q.eq('cliente_id', String(clienteId));
    if (clienteTipo) q = q.eq('cliente_tipo', clienteTipo);
  }
  if (soloPendientes) {
    q = q.eq('tipo', 'cargo');
  }
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let list = leerLocal();
    if (soloPendientes) list = list.filter(esCargoPendienteCxc);
    return { data: list.slice(0, limit), aviso: AVISO_FALTA_CXC };
  }
  if (error && errorColumnaCxc(error)) {
    const retry = await supabase.from('ruta_cxc_movimientos').select('*').order('created_at', { ascending: false }).limit(soloPendientes ? Math.max(limit, 1000) : limit);
    if (retry.error) return { data: [], error: retry.error.message };
    let rows = retry.data || [];
    if (soloPendientes) rows = rows.filter(esCargoPendienteCxc);
    return { data: rows.slice(0, limit), aviso: AVISO_FALTA_CXC };
  }
  if (error) return { data: [], error: error.message };
  let rows = data || [];
  if (soloPendientes) rows = rows.filter(esCargoPendienteCxc);
  return { data: rows.slice(0, limit) };
}

/** Extrae id de tránsito de un cargo CxC nacido en Recolecciones. */
export function transitoIdDesdeCargoRecoleccion(cargo) {
  if (!cargo) return null;
  const carga = String(cargo.carga_id || '');
  if (carga.startsWith(PREFIJO_CXC_RECOLECCION)) {
    const id = carga.slice(PREFIJO_CXC_RECOLECCION.length).trim();
    if (id) return id;
  }
  const notas = String(cargo.notas || '');
  const m = notas.match(/transito:([0-9a-f-]{8,})/i);
  return m?.[1] || null;
}

export function esCargoDesdeRecoleccion(cargo) {
  return Boolean(transitoIdDesdeCargoRecoleccion(cargo));
}

/** ¿El tránsito sigue siendo crédito por cobrar en Recolecciones? */
async function transitoSiguePorCobrar(supabase, transitoId) {
  if (!supabase || !transitoId) return false;
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('id, estatus, tipo_movimiento')
    .eq('id', transitoId)
    .maybeSingle();
  if (error || !data) return false;
  return data.estatus === 'Por Cobrar' && data.tipo_movimiento === 'Entrega Crédito';
}

/**
 * Si el CxC quedó «pagado» pero el folio sigue Por Cobrar en Recolecciones, lo reabre.
 * Así no se pierden créditos al sincronizar / restaurar.
 */
async function reabrirCargoCxcSiSiguePorCobrar(supabase, cargo, { transitoId, suc, monto } = {}) {
  if (!supabase || !cargo?.id) return { reabierto: false, cargo };
  const marcadoPagado = Boolean(cargo.pagado_at)
    || String(cargo.estatus || '').toLowerCase() === 'pagado';
  if (!marcadoPagado) return { reabierto: false, cargo };
  const sigue = await transitoSiguePorCobrar(supabase, transitoId);
  if (!sigue) return { reabierto: false, cargo, yaPagadoReal: true };

  const nombreOk = etiquetaTienda(suc) || suc;
  const patch = {
    estatus: 'pendiente',
    pagado_por: null,
    pagado_at: null,
    gasto_id: null,
    cliente_tipo: 'sucursal',
    cliente_id: suc || cargo.cliente_id,
    cliente_nombre: nombreOk || cargo.cliente_nombre,
  };
  if (monto != null && Number(monto) > 0) patch.monto = round2(monto);

  let { error } = await supabase.from('ruta_cxc_movimientos').update(patch).eq('id', cargo.id);
  if (error && /estatus|pagado|gasto_id|cliente_/i.test(String(error.message || ''))) {
    // Sin columnas nuevas: al menos quitar pagado_at si existe.
    const slim = { cliente_tipo: 'sucursal', cliente_id: suc || cargo.cliente_id, cliente_nombre: nombreOk };
    if (monto != null && Number(monto) > 0) slim.monto = round2(monto);
    ({ error } = await supabase.from('ruta_cxc_movimientos').update(slim).eq('id', cargo.id));
  }
  if (error) return { reabierto: false, cargo, error: error.message };
  return {
    reabierto: true,
    cargo: { ...cargo, ...patch, pagado_at: null, estatus: 'pendiente' },
  };
}

/**
 * Crea (si falta) el cargo CxC de un crédito «Entrega Crédito / Por Cobrar» de Recolecciones.
 * Así todos esos créditos aparecen en Venta en Ruta → Créditos por pagar.
 * Si el CxC estaba «pagado» pero el tránsito sigue Por Cobrar, lo restaura a pendiente.
 */
export async function asegurarCargoCxcDesdeRecoleccion(supabase, credito) {
  if (!supabase || !credito?.id) return { ok: false, error: 'Crédito inválido.' };
  const transitoId = String(credito.id);
  const cargaId = `${PREFIJO_CXC_RECOLECCION}${transitoId}`;
  const folio = String(credito.num_traspaso || '').trim() || null;
  const suc = normalizarCodigoTienda(credito.sucursal_origen) || String(credito.sucursal_origen || '').trim();
  if (!suc) return { ok: false, error: 'Tienda inválida.' };

  const resolverExistente = async (hit) => {
    if (!hit) return null;
    await asegurarTiendaCargoCxc(supabase, hit, suc);
    const reopen = await reabrirCargoCxcSiSiguePorCobrar(supabase, hit, {
      transitoId,
      suc,
      monto: credito.monto,
    });
    if (reopen.yaPagadoReal) {
      return { ok: true, data: reopen.cargo, yaExistia: true, yaPagado: true };
    }
    return {
      ok: true,
      data: {
        ...reopen.cargo,
        cliente_id: suc,
        cliente_nombre: etiquetaTienda(suc) || suc,
        estatus: 'pendiente',
        pagado_at: null,
      },
      yaExistia: true,
      reabierto: Boolean(reopen.reabierto),
    };
  };

  const { data: existentes, error: eEx } = await supabase
    .from('ruta_cxc_movimientos')
    .select('id, estatus, tipo, carga_id, pagado_at, cliente_id, cliente_nombre, monto')
    .eq('carga_id', cargaId)
    .eq('tipo', 'cargo')
    .limit(5);

  // Columna carga_id / schema cache: buscar por notas (no ir a localStorage).
  if (eEx && (/carga_id/i.test(String(eEx.message || '')) || errorColumnaCxc(eEx))) {
    const { data: allPend, error: eAll } = await supabase
      .from('ruta_cxc_movimientos')
      .select('id, notas, estatus, tipo, pagado_at, cliente_id, cliente_nombre, monto')
      .eq('tipo', 'cargo')
      .limit(2000);
    if (!eAll) {
      const hit = (allPend || []).find(
        (m) => String(m.notas || '').includes(`transito:${transitoId}`),
      );
      const res = await resolverExistente(hit);
      if (res) return res;
    }
  } else if (eEx && faltaTabla(eEx)) {
    // Tabla realmente ausente: registrarCargo hará fallback local si aplica.
  } else if (eEx) {
    return { ok: false, error: eEx.message };
  } else if (existentes?.length) {
    const pend = existentes.find((m) => esCargoPendienteCxc(m));
    if (pend) {
      const res = await resolverExistente(pend);
      if (res) return res;
    }
    const cualquiera = existentes[0];
    const res = await resolverExistente(cualquiera);
    if (res) return res;
  }

  // Siempre una cuenta CxC por tienda de origen (nunca mezclar sucursales).
  return registrarCargoCreditoRuta(supabase, {
    clienteTipo: 'sucursal',
    clienteId: suc,
    clienteNombre: etiquetaTienda(suc) || suc,
    monto: credito.monto,
    cargaId,
    folioVenta: folio,
    usuarioNombre: credito.cajero_nombre || null,
    notas: `Recolección · Entrega Crédito · ${suc} · ficha ${folio || '—'} · transito:${transitoId}`,
  });
}

/** Asegura que un cargo CxC apunte a la tienda correcta. */
async function asegurarTiendaCargoCxc(supabase, cargo, suc) {
  if (!supabase || !cargo?.id || !suc) return false;
  const cidActual = normalizarCodigoTienda(cargo.cliente_id) || String(cargo.cliente_id || '').trim();
  const nombreOk = etiquetaTienda(suc) || suc;
  if (cidActual === suc && String(cargo.cliente_nombre || '') === nombreOk) return false;
  const { error } = await supabase
    .from('ruta_cxc_movimientos')
    .update({ cliente_tipo: 'sucursal', cliente_id: suc, cliente_nombre: nombreOk })
    .eq('id', cargo.id);
  return !error;
}

/**
 * Corrige cliente_id / cliente_nombre de cargos CxC nacidos en Recolecciones
 * para que cada crédito quede en su tienda (no todos en una sola cuenta).
 */
export async function repararTiendaCargosCxcRecoleccion(supabase, { limit = 800 } = {}) {
  if (!supabase) return { ok: true, corregidos: 0 };
  const { data: cargos, error } = await supabase
    .from('ruta_cxc_movimientos')
    .select('id, cliente_id, cliente_nombre, carga_id, notas, tipo, estatus, pagado_at')
    .eq('tipo', 'cargo')
    .limit(limit);
  if (error) {
    if (faltaTabla(error)) return { ok: true, corregidos: 0 };
    return { ok: false, error: error.message, corregidos: 0 };
  }

  let corregidos = 0;
  for (const cargo of cargos || []) {
    if (cargo.pagado_at || String(cargo.estatus || '').toLowerCase() === 'pagado') continue;
    if (!esCargoPendienteCxc(cargo)) continue;
    if (!esCargoDesdeRecoleccion(cargo)) continue;
    const tid = transitoIdDesdeCargoRecoleccion(cargo);
    if (!tid) continue;

    const { data: tr, error: eTr } = await supabase
      .from('transito_efectivo')
      .select('id, sucursal_origen')
      .eq('id', tid)
      .maybeSingle();
    if (eTr || !tr?.sucursal_origen) continue;

    const suc = normalizarCodigoTienda(tr.sucursal_origen) || String(tr.sucursal_origen).trim();
    if (!suc) continue;
    if (await asegurarTiendaCargoCxc(supabase, cargo, suc)) corregidos += 1;
  }
  return { ok: true, corregidos };
}

/**
 * Índice de cargos CxC de Recolecciones ya en DB (una sola query).
 * Evita N selects .eq('carga_id') al sincronizar.
 */
async function cargarMapaCargosRecoleccionCxc(supabase, { limit = 2000 } = {}) {
  const map = new Map();
  if (!supabase) return map;
  const { data, error } = await supabase
    .from('ruta_cxc_movimientos')
    .select('id, estatus, tipo, carga_id, pagado_at, cliente_id, cliente_nombre, monto, notas')
    .eq('tipo', 'cargo')
    .like('carga_id', `${PREFIJO_CXC_RECOLECCION}%`)
    .limit(limit);
  if (!error) {
    for (const c of data || []) {
      if (c?.carga_id) map.set(String(c.carga_id), c);
    }
    return map;
  }
  // Sin columna carga_id: índice por notas transito:…
  if (/carga_id|schema cache/i.test(String(error.message || ''))) {
    const retry = await supabase
      .from('ruta_cxc_movimientos')
      .select('id, estatus, tipo, pagado_at, cliente_id, cliente_nombre, monto, notas')
      .eq('tipo', 'cargo')
      .limit(limit);
    if (!retry.error) {
      for (const c of retry.data || []) {
        const tid = transitoIdDesdeCargoRecoleccion(c);
        if (tid) map.set(`${PREFIJO_CXC_RECOLECCION}${tid}`, c);
      }
    }
  }
  return map;
}

/**
 * Restaura / sincroniza todos los «Por Cobrar» de Recolecciones → CxC pendientes.
 * - Crea cargos faltantes
 * - Reabre cargos marcados pagado si el tránsito sigue Por Cobrar
 * - Reasigna a la tienda correcta
 * - Migra cargos locales (localStorage) que aún existan en tránsito
 *
 * @param {{ limit?: number, skipReparar?: boolean }} [opts]
 *   skipReparar: true en sync de apertura (más rápido; la tienda se corrige al crear/omitar).
 */
export async function restaurarCreditosRecoleccionACxc(supabase, { limit = 1500, skipReparar = false } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', creados: 0, reabiertos: 0, omitidos: 0 };
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('id, num_traspaso, monto, cajero_nombre, fecha_hora, sucursal_origen, repartidor_id, estatus, tipo_movimiento')
    .eq('estatus', 'Por Cobrar')
    .eq('tipo_movimiento', 'Entrega Crédito')
    .order('fecha_hora', { ascending: true })
    .limit(limit);
  if (error) {
    if (error.code === '42P01') {
      return { ok: false, error: 'Falta tabla transito_efectivo.', creados: 0, reabiertos: 0, omitidos: 0 };
    }
    return { ok: false, error: error.message, creados: 0, reabiertos: 0, omitidos: 0 };
  }

  let creados = 0;
  let reabiertos = 0;
  let omitidos = 0;
  const porTienda = {};
  const errores = [];

  // Una sola lectura de CxC existentes → evita N round-trips por folio.
  const mapaExistentes = await cargarMapaCargosRecoleccionCxc(supabase, {
    limit: Math.max(2000, (Number(limit) || 1500) * 2),
  });

  for (const row of data || []) {
    const suc = normalizarCodigoTienda(row.sucursal_origen) || String(row.sucursal_origen || '—');
    if (!porTienda[suc]) porTienda[suc] = { tienda: suc, count: 0, monto: 0 };
    porTienda[suc].count += 1;
    porTienda[suc].monto = round2(porTienda[suc].monto + (Number(row.monto) || 0));

    const cargaId = `${PREFIJO_CXC_RECOLECCION}${row.id}`;
    const hit = mapaExistentes.get(cargaId);
    if (hit && esCargoPendienteCxc(hit)) {
      // Ya pendiente: solo corregir tienda si hace falta (sin re-select).
      try {
        await asegurarTiendaCargoCxc(supabase, hit, suc);
      } catch {
        /* ignore */
      }
      omitidos += 1;
      continue;
    }

    const r = await asegurarCargoCxcDesdeRecoleccion(supabase, row);
    if (!r.ok) {
      errores.push(r.error || `Folio ${row.num_traspaso}`);
      continue;
    }
    if (r.data?.carga_id || cargaId) {
      mapaExistentes.set(cargaId, r.data);
    }
    if (r.reabierto) reabiertos += 1;
    else if (r.yaPagado) omitidos += 1;
    else if (r.yaExistia) omitidos += 1;
    else creados += 1;
  }

  // Migrar localStorage → DB si el tránsito sigue Por Cobrar.
  let migradosLocal = 0;
  try {
    const locales = leerLocal().filter(
      (m) => m.tipo === 'cargo' && esCargoPendienteCxc(m) && esCargoDesdeRecoleccion(m),
    );
    if (locales.length) {
      for (const loc of locales) {
        const tid = transitoIdDesdeCargoRecoleccion(loc);
        if (!tid) continue;
        const sigue = await transitoSiguePorCobrar(supabase, tid);
        if (!sigue) continue;
        const { data: tr } = await supabase
          .from('transito_efectivo')
          .select('id, num_traspaso, monto, cajero_nombre, sucursal_origen, estatus, tipo_movimiento')
          .eq('id', tid)
          .maybeSingle();
        if (!tr) continue;
        const r = await asegurarCargoCxcDesdeRecoleccion(supabase, tr);
        if (r.ok && !r.yaExistia && !r.yaPagado) {
          migradosLocal += 1;
          creados += 1;
        } else if (r.ok && r.reabierto) {
          migradosLocal += 1;
          reabiertos += 1;
        }
      }
      // Quitar del local los que ya están en DB (evita doble conteo en fallback).
      const idsLocal = new Set(locales.map((m) => String(m.id)));
      guardarLocal(leerLocal().filter((m) => !idsLocal.has(String(m.id))));
    }
  } catch {
    /* ignore */
  }

  let corregidos = 0;
  if (!skipReparar) {
    try {
      const rep = await repararTiendaCargosCxcRecoleccion(supabase, { limit });
      corregidos = rep.corregidos || 0;
    } catch {
      /* no bloquear */
    }
  }

  return {
    ok: true,
    creados,
    reabiertos,
    omitidos,
    migradosLocal,
    corregidos,
    revisados: (data || []).length,
    porTienda: Object.values(porTienda).sort((a, b) => String(a.tienda).localeCompare(String(b.tienda), 'es')),
    errores: errores.slice(0, 5),
  };
}

/** Alias: sincroniza Por Cobrar → CxC (usa restauración completa). */
export async function sincronizarCreditosRecoleccionACxc(supabase, { limit = 1500, skipReparar = true } = {}) {
  return restaurarCreditosRecoleccionACxc(supabase, { limit, skipReparar });
}

/** Marca CxC pagado cuando el cobro se hizo desde Recolecciones (Cobrar crédito). */
export async function marcarCxcPagadoDesdeCobroRecoleccion(supabase, credito, { cajeroNombre = null, gastoId = null } = {}) {
  if (!supabase || !credito?.id) return { ok: true };
  const ensure = await asegurarCargoCxcDesdeRecoleccion(supabase, credito);
  if (!ensure.ok || !ensure.data?.id) return ensure;
  if (ensure.yaPagado) return { ok: true, yaPagado: true };
  const ahora = new Date().toISOString();
  const patch = {
    estatus: 'pagado',
    pagado_por: cajeroNombre || null,
    pagado_at: ahora,
    gasto_id: gastoId || null,
  };
  let { error } = await supabase.from('ruta_cxc_movimientos').update(patch).eq('id', ensure.data.id);
  if (error && /estatus|pagado|gasto_id/i.test(String(error.message || ''))) {
    error = null;
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, cargoId: ensure.data.id };
}

/**
 * Créditos pendientes para el cajero (filtros folio / fecha / monto).
 * @param {{ sync?: boolean|'await'|'skip' }} [opts]
 *   sync false|'skip' → solo lee CxC (rápido; la UI puede sync en segundo plano).
 *   sync true|'await' → sincroniza Por Cobrar→CxC antes de listar (más lento).
 */
export async function listarCreditosPendientesRuta(supabase, {
  sucursalId,
  folio,
  fechaDesde,
  fechaHasta,
  montoMin,
  montoMax,
  limit = 200,
  sync = 'skip',
} = {}) {
  const limSync = Math.max(200, Math.min(2000, Number(limit) || 1500));
  let syncRes = null;
  const debeSync = sync === true || sync === 'await';
  if (supabase && debeSync) {
    try {
      syncRes = await sincronizarCreditosRecoleccionACxc(supabase, { limit: limSync, skipReparar: true });
    } catch (e) {
      syncRes = { ok: false, error: e?.message || String(e), creados: 0, omitidos: 0 };
    }
  }
  const { data, error, aviso } = await listarMovimientosCxc(supabase, { soloPendientes: true, limit: limSync });
  if (error) return { data: [], error, aviso, sync: syncRes };
  let rows = (data || []).filter(esCargoPendienteCxc);
  if (sucursalId) {
    const suc = normalizarCodigoTienda(sucursalId) || String(sucursalId).toUpperCase();
    rows = rows.filter((m) => {
      if (String(m.cliente_tipo) !== 'sucursal') return false;
      const cid = normalizarCodigoTienda(m.cliente_id) || String(m.cliente_id || '').toUpperCase();
      return cid === suc;
    });
  }
  if (folio) {
    const f = String(folio).trim().toUpperCase();
    rows = rows.filter((m) => String(m.folio_venta || m.notas || '').toUpperCase().includes(f) || String(m.venta_id || '').toUpperCase().includes(f));
  }
  if (fechaDesde) {
    rows = rows.filter((m) => String(m.created_at || '').slice(0, 10) >= fechaDesde);
  }
  if (fechaHasta) {
    rows = rows.filter((m) => String(m.created_at || '').slice(0, 10) <= fechaHasta);
  }
  if (montoMin != null && montoMin !== '') {
    rows = rows.filter((m) => Number(m.monto) >= Number(montoMin));
  }
  if (montoMax != null && montoMax !== '') {
    rows = rows.filter((m) => Number(m.monto) <= Number(montoMax));
  }
  return { data: rows.slice(0, limit), aviso, sync: syncRes };
}

/** Créditos ya cobrados (pagados con PIN de cajero) — reporte de consultas. */
export async function listarCreditosCobradosRuta(supabase, {
  sucursalId,
  folio,
  fechaDesde,
  fechaHasta,
  limit = 200,
} = {}) {
  const { data, error, aviso } = await listarMovimientosCxc(supabase, { limit: 2000 });
  if (error) return { data: [], error, aviso };
  let rows = (data || []).filter((m) => {
    if (m.tipo !== 'cargo') return false;
    const est = String(m.estatus || '').toLowerCase();
    if (est === 'pagado') return true;
    if (m.pagado_at) return true;
    return false;
  });
  if (sucursalId) {
    const suc = String(sucursalId).toUpperCase();
    rows = rows.filter((m) => String(m.cliente_tipo) === 'sucursal' && String(m.cliente_id).toUpperCase() === suc);
  }
  if (folio) {
    const f = String(folio).trim().toUpperCase();
    rows = rows.filter(
      (m) =>
        String(m.folio_venta || m.notas || '').toUpperCase().includes(f) ||
        String(m.venta_id || '').toUpperCase().includes(f),
    );
  }
  if (fechaDesde) {
    rows = rows.filter((m) => String(m.pagado_at || m.created_at || '').slice(0, 10) >= fechaDesde);
  }
  if (fechaHasta) {
    rows = rows.filter((m) => String(m.pagado_at || m.created_at || '').slice(0, 10) <= fechaHasta);
  }
  rows.sort((a, b) => String(b.pagado_at || b.created_at || '').localeCompare(String(a.pagado_at || a.created_at || '')));
  return { data: rows.slice(0, limit), aviso };
}

export async function saldosCxcPorCliente(supabase) {
  const { data, error, aviso } = await listarMovimientosCxc(supabase, { limit: 3000 });
  if (error) return { data: [], error, aviso };
  const map = new Map();
  const orden = [...(data || [])].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  for (const m of orden) {
    const k = claveCliente(m.cliente_tipo, m.cliente_id);
    if (!map.has(k)) {
      map.set(k, {
        cliente_tipo: m.cliente_tipo,
        cliente_id: m.cliente_id,
        cliente_nombre: m.cliente_nombre || m.cliente_id,
        cargos: 0,
        abonos: 0,
        saldo: 0,
      });
    }
    const row = map.get(k);
    const monto = round2(m.monto);
    if (m.tipo === 'cargo' || m.tipo === 'ajuste') {
      if (m.tipo === 'ajuste' && Number(m.monto) < 0) row.abonos = round2(row.abonos + Math.abs(monto));
      else row.cargos = round2(row.cargos + monto);
    } else if (m.tipo === 'abono') {
      row.abonos = round2(row.abonos + monto);
    }
    if (m.cliente_nombre) row.cliente_nombre = m.cliente_nombre;
  }
  const out = [...map.values()].map((r) => ({ ...r, saldo: round2(r.cargos - r.abonos) }));
  out.sort((a, b) => b.saldo - a.saldo || String(a.cliente_nombre).localeCompare(String(b.cliente_nombre), 'es'));
  return { data: out, aviso };
}

export async function saldoClienteCxc(supabase, clienteTipo, clienteId) {
  const { data } = await saldosCxcPorCliente(supabase);
  const row = (data || []).find(
    (r) => String(r.cliente_tipo) === String(clienteTipo) && String(r.cliente_id) === String(clienteId),
  );
  return round2(row?.saldo || 0);
}

async function insertarMovimiento(supabase, payload) {
  if (!supabase) {
    const list = leerLocal();
    const row = { ...payload, id: uid(), created_at: new Date().toISOString() };
    list.unshift(row);
    guardarLocal(list);
    return { ok: true, data: row, soloLocal: true };
  }
  const { data, error } = await supabase.from('ruta_cxc_movimientos').insert([payload]).select('*').single();
  // Primero columnas faltantes (carga_id/estatus/…) — NUNCA localStorage por schema cache de columna.
  if (error && errorColumnaCxc(error)) {
    const slim = { ...payload };
    const msg = String(error.message || '');
    if (/estatus/i.test(msg)) delete slim.estatus;
    if (/folio_venta/i.test(msg)) delete slim.folio_venta;
    if (/pagado_por/i.test(msg)) delete slim.pagado_por;
    if (/pagado_at/i.test(msg)) delete slim.pagado_at;
    if (/gasto_id/i.test(msg)) delete slim.gasto_id;
    if (/carga_id/i.test(msg)) delete slim.carga_id;
    // Si el mensaje solo dice schema cache, quitar columnas opcionales nuevas.
    if (/schema cache/i.test(msg) && !/carga_id|estatus|folio_venta|pagado|gasto_id/i.test(msg)) {
      delete slim.estatus;
      delete slim.folio_venta;
      delete slim.pagado_por;
      delete slim.pagado_at;
      delete slim.gasto_id;
      delete slim.carga_id;
    }
    const retry = await supabase.from('ruta_cxc_movimientos').insert([slim]).select('*').single();
    if (retry.error && faltaTabla(retry.error)) return insertarMovimiento(null, payload);
    if (retry.error && errorColumnaCxc(retry.error)) {
      // Segundo intento: solo columnas base del ledger.
      const base = {
        cliente_tipo: payload.cliente_tipo,
        cliente_id: payload.cliente_id,
        cliente_nombre: payload.cliente_nombre,
        tipo: payload.tipo,
        monto: payload.monto,
        saldo_despues: payload.saldo_despues,
        venta_id: payload.venta_id ?? null,
        notas: payload.notas || null,
        usuario_nombre: payload.usuario_nombre || null,
      };
      const retry2 = await supabase.from('ruta_cxc_movimientos').insert([base]).select('*').single();
      if (retry2.error) return { ok: false, error: retry2.error.message };
      return { ok: true, data: retry2.data, aviso: AVISO_FALTA_CXC };
    }
    if (retry.error) return { ok: false, error: retry.error.message };
    return { ok: true, data: retry.data, aviso: AVISO_FALTA_CXC };
  }
  if (error && faltaTabla(error)) return insertarMovimiento(null, payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function registrarCargoCreditoRuta(supabase, {
  clienteTipo,
  clienteId,
  clienteNombre,
  monto,
  ventaId,
  cargaId,
  folioVenta,
  usuarioNombre,
  notas,
} = {}) {
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto de crédito inválido.' };
  if (!clienteId) return { ok: false, error: 'Cliente inválido.' };
  const saldoAntes = await saldoClienteCxc(supabase, clienteTipo || 'sucursal', clienteId);
  const saldoDespues = round2(saldoAntes + m);
  return insertarMovimiento(supabase, {
    cliente_tipo: clienteTipo === 'externo' ? 'externo' : 'sucursal',
    cliente_id: String(clienteId),
    cliente_nombre: clienteNombre || String(clienteId),
    tipo: 'cargo',
    monto: m,
    saldo_despues: saldoDespues,
    venta_id: ventaId != null ? String(ventaId) : null,
    carga_id: cargaId != null ? String(cargaId) : null,
    folio_venta: folioVenta || null,
    metodo_pago: null,
    estatus: 'pendiente',
    notas: notas || 'Venta en ruta a crédito',
    usuario_nombre: usuarioNombre || null,
  });
}

/**
 * Verifica PIN de cajero en la sucursal (o admin).
 */
export async function verificarPinCajero(supabase, pin, sucursal) {
  const { user, error, avisoSucursal } = await buscarUsuarioPorPinYSucursal(supabase, pin, sucursal);
  if (error) return { ok: false, error };
  if (!user) {
    return { ok: false, error: avisoSucursal ? 'PIN no válido en esta sucursal.' : 'PIN incorrecto.' };
  }
  const r = rolSistemaEfectivo(user.rol);
  if (r !== 'Cajero' && r !== 'Administrador' && r !== 'Gerente' && normalizarRol(user.rol) !== 'Supervisor') {
    return { ok: false, error: 'Este PIN no es de cajero (ni admin/gerente).' };
  }
  return { ok: true, user };
}

/**
 * Reparte un monto a pagar entre cargos pendientes (FIFO por fecha).
 * Permite pago parcial del último cargo tocado.
 * @returns {{ ok: true, partes: Array<{ cargo: object, monto: number, parcial: boolean }> } | { ok: false, error: string }}
 */
export function repartirMontoEntreCargos(cargos, montoPagar) {
  const totalDisp = round2(
    (cargos || []).reduce((s, c) => s + (Number(c.monto) || 0), 0),
  );
  const monto = round2(montoPagar);
  if (!(monto > 0)) return { ok: false, error: 'Ingresa un monto mayor a 0.' };
  if (!(totalDisp > 0)) return { ok: false, error: 'No hay créditos pendientes en la selección.' };
  if (monto > totalDisp + 0.001) {
    return { ok: false, error: `El monto no puede superar el acumulado (${totalDisp.toFixed(2)}).` };
  }

  const orden = [...(cargos || [])].sort(
    (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
      || String(a.id || '').localeCompare(String(b.id || '')),
  );
  let resto = monto;
  const partes = [];
  for (const cargo of orden) {
    if (resto <= 0.001) break;
    const cargoMonto = round2(cargo.monto);
    if (!(cargoMonto > 0)) continue;
    const aplica = round2(Math.min(resto, cargoMonto));
    if (!(aplica > 0)) continue;
    partes.push({ cargo, monto: aplica, parcial: aplica < cargoMonto - 0.001 });
    resto = round2(resto - aplica);
  }
  if (!partes.length) return { ok: false, error: 'No se pudo aplicar el monto a ningún crédito.' };
  return { ok: true, partes, montoAplicado: round2(monto - resto), totalDisponible: totalDisp };
}

/**
 * Cajero paga crédito(s) con PIN.
 * → gasto en corte abarrotes "credito liquidado"
 * → efectivo cobrado a tránsito
 * → marca CxC pagado + abono (o reduce saldo del cargo si es parcial)
 *
 * `montoPagar` opcional: paga solo esa cantidad (FIFO entre los cargos seleccionados).
 */
export async function pagarCreditosRutaConPin(supabase, {
  movimientoIds,
  pin,
  sucursal,
  /** Cajero ya autenticado al abrir el módulo (omite pedir PIN otra vez). */
  cajeroUser = null,
  /** Monto a liquidar (parcial permitido). Si se omite, paga todo lo seleccionado. */
  montoPagar = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const ids = [...new Set((movimientoIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { ok: false, error: 'Selecciona al menos un crédito.' };
  let auth;
  if (cajeroUser?.id || cajeroUser?.nombre) {
    auth = { ok: true, user: cajeroUser };
  } else {
    auth = await verificarPinCajero(supabase, pin, sucursal);
    if (!auth.ok) return auth;
  }

  const { data: movs, error } = await supabase.from('ruta_cxc_movimientos').select('*').in('id', ids);
  if (error) return { ok: false, error: error.message };
  const pendientes = (movs || []).filter(
    (m) => m.tipo === 'cargo' && String(m.estatus || 'pendiente') === 'pendiente',
  );
  if (!pendientes.length) return { ok: false, error: 'No hay créditos pendientes en la selección.' };

  const totalSel = round2(pendientes.reduce((s, c) => s + (Number(c.monto) || 0), 0));
  const montoObj = montoPagar == null || montoPagar === ''
    ? totalSel
    : round2(montoPagar);
  const reparto = repartirMontoEntreCargos(pendientes, montoObj);
  if (!reparto.ok) return reparto;

  const resultados = [];
  for (const parte of reparto.partes) {
    const cargo = parte.cargo;
    const monto = parte.monto;
    const parcial = parte.parcial;
    const sucGasto = String(cargo.cliente_tipo) === 'sucursal' ? String(cargo.cliente_id) : sucursal;
    const folio = cargo.folio_venta || cargo.venta_id || cargo.id;
    const desdeRecoleccion = esCargoDesdeRecoleccion(cargo);
    const transitoRecId = transitoIdDesdeCargoRecoleccion(cargo);
    const etiqueta = parcial
      ? (desdeRecoleccion ? 'CREDITO COBRADO parcial' : 'credito liquidado parcial')
      : (desdeRecoleccion ? 'CREDITO COBRADO' : 'credito liquidado');

    // 1) Gasto en corte abarrotes
    const gastoPayload = desdeRecoleccion
      ? {
          sucursal_id: sucGasto,
          modulo: 'abarrotes',
          categoria: 'CREDITO',
          subcategoria: 'COBRADO',
          comentario: `${etiqueta} · FICHA ${folio}${parcial ? ' · PARCIAL' : ''} · ${auth.user?.nombre || ''}`.trim().toUpperCase(),
          monto,
          usuario_nombre: auth.user?.nombre || null,
          cerrado: false,
          descontado_nomina: false,
          estado_aprobacion: 'aprobado',
          solicitado_por: auth.user?.nombre || null,
        }
      : {
          sucursal_id: sucGasto,
          modulo: 'abarrotes',
          categoria: 'CREDITO RUTA',
          subcategoria: 'LIQUIDADO',
          comentario: `${etiqueta} · ${folio} · ${cargo.cliente_nombre || ''}`.trim(),
          monto,
          usuario_nombre: auth.user?.nombre || null,
          cerrado: false,
          descontado_nomina: false,
          estado_aprobacion: 'aprobado',
          solicitado_por: auth.user?.nombre || null,
        };
    let { data: gasto, error: eGasto } = await supabase
      .from('cortes_contabilidad_gastos')
      .insert([gastoPayload])
      .select('id')
      .single();
    if (eGasto && /estado_aprobacion|solicitado_por|descontado_nomina/i.test(String(eGasto.message || ''))) {
      const slim = { ...gastoPayload };
      delete slim.estado_aprobacion;
      delete slim.solicitado_por;
      delete slim.descontado_nomina;
      ({ data: gasto, error: eGasto } = await supabase.from('cortes_contabilidad_gastos').insert([slim]).select('id').single());
    }
    if (eGasto) return { ok: false, error: `Gasto corte: ${eGasto.message}` };

    // 2) Efectivo cobrado → tránsito
    // Recolecciones: reutiliza la ficha Entrega Crédito (evita doble conteo).
    let transitoId = null;
    if (desdeRecoleccion && transitoRecId && !parcial) {
      const { TIPO_COBRO_CREDITO, ahoraIsoNogales } = await import('./controlEfectivo.js');
      const { error: eUp } = await supabase
        .from('transito_efectivo')
        .update({
          estatus: 'En Tránsito',
          cajero_nombre: auth.user?.nombre || null,
          foto_url: `Crédito cobrado en Créditos por pagar · ficha ${folio}`,
          tipo_movimiento: TIPO_COBRO_CREDITO,
          descripcion_gasto: 'Crédito cobrado',
          usuario_liquida: 'No Leído',
          fecha_hora: ahoraIsoNogales(),
        })
        .eq('id', transitoRecId)
        .eq('estatus', 'Por Cobrar')
        .eq('tipo_movimiento', 'Entrega Crédito');
      if (eUp) return { ok: false, error: `Tránsito recolección: ${eUp.message}` };
      transitoId = transitoRecId;
    } else if (desdeRecoleccion && transitoRecId && parcial) {
      // Parcial: deja ficha original y registra el tramo cobrado en tránsito ruta.
      const tr = await registrarEfectivoTransitoVentaRuta(supabase, {
        sucursalOrigen: sucGasto,
        monto,
        folioVenta: `CXC-REC-${folio}-P`,
        vendedorId: cargo.usuario_nombre || 'ruta',
        vendedorNombre: auth.user?.nombre,
        nota: `Crédito recolección parcial ${folio} · cajero ${auth.user?.nombre}`,
      });
      if (!tr.ok) return { ok: false, error: tr.error || 'No se registró en tránsito.' };
      transitoId = tr.id;
    } else {
      const tr = await registrarEfectivoTransitoVentaRuta(supabase, {
        sucursalOrigen: sucGasto,
        monto,
        folioVenta: `CXC-${folio}${parcial ? '-P' : ''}`,
        vendedorId: cargo.usuario_nombre || 'ruta',
        vendedorNombre: auth.user?.nombre,
        nota: `Crédito ${parcial ? 'parcial' : 'liquidado'} ${folio} · cajero ${auth.user?.nombre}`,
      });
      if (!tr.ok) return { ok: false, error: tr.error || 'No se registró en tránsito.' };
      transitoId = tr.id;
    }

    // 3) Actualizar cargo + abono
    const saldoAntes = await saldoClienteCxc(supabase, cargo.cliente_tipo, cargo.cliente_id);
    const saldoDespues = round2(Math.max(0, saldoAntes - monto));
    const ahora = new Date().toISOString();

    if (parcial) {
      const restoCargo = round2(Number(cargo.monto) - monto);
      let { error: ePatch } = await supabase
        .from('ruta_cxc_movimientos')
        .update({
          monto: restoCargo,
          notas: `${cargo.notas || 'Venta en ruta a crédito'} · abono parcial ${monto.toFixed(2)}`.trim(),
        })
        .eq('id', cargo.id);
      if (ePatch) return { ok: false, error: ePatch.message };
    } else {
      const patchCargo = {
        estatus: 'pagado',
        pagado_por: auth.user?.nombre || null,
        pagado_at: ahora,
        gasto_id: gasto?.id || null,
      };
      let { error: ePatch } = await supabase.from('ruta_cxc_movimientos').update(patchCargo).eq('id', cargo.id);
      if (ePatch && /estatus|pagado|gasto_id/i.test(String(ePatch.message || ''))) {
        ePatch = null; // columnas faltantes: seguir con abono
      }
      if (ePatch) return { ok: false, error: ePatch.message };
    }

    await insertarMovimiento(supabase, {
      cliente_tipo: cargo.cliente_tipo,
      cliente_id: cargo.cliente_id,
      cliente_nombre: cargo.cliente_nombre,
      tipo: 'abono',
      monto,
      saldo_despues: saldoDespues,
      venta_id: cargo.venta_id,
      carga_id: cargo.carga_id,
      folio_venta: cargo.folio_venta || folio,
      metodo_pago: 'efectivo',
      estatus: 'pagado',
      notas: `Pago cajero · ${etiqueta} · ${folio}${desdeRecoleccion ? ' · recolección' : ''}`,
      usuario_nombre: auth.user?.nombre || null,
      pagado_por: auth.user?.nombre || null,
      pagado_at: ahora,
      gasto_id: gasto?.id || null,
    });

    if (!parcial && cargo.venta_id && !String(cargo.venta_id).startsWith(PREFIJO_CXC_RECOLECCION)) {
      await supabase
        .from('ruta_ventas')
        .update({ estado_credito: 'pagado', transito_id: String(transitoId) })
        .eq('id', cargo.venta_id);
    }

    resultados.push({
      cargoId: cargo.id,
      gastoId: gasto?.id,
      transitoId,
      monto,
      parcial,
      desdeRecoleccion,
    });
  }

  return {
    ok: true,
    pagados: resultados,
    cajero: auth.user?.nombre,
    montoPagado: reparto.montoAplicado,
    parcial: resultados.some((r) => r.parcial) || round2(reparto.montoAplicado) < totalSel,
  };
}

/** Solo Administrador puede borrar créditos pendientes (corrección de errores). */
export function puedeEliminarCreditosRuta(rol) {
  return rolSistemaEfectivo(rol) === 'Administrador';
}

/**
 * Elimina cargos pendientes de CxC (corrección de error).
 * Solo Administrador. No toca créditos ya pagados.
 */
export async function eliminarCreditosPendientesRuta(supabase, {
  movimientoIds,
  rolActor,
  actorNombre = null,
} = {}) {
  if (!puedeEliminarCreditosRuta(rolActor)) {
    return { ok: false, error: 'Solo un administrador puede eliminar créditos.' };
  }
  const ids = [...new Set((movimientoIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { ok: false, error: 'Selecciona al menos un crédito.' };

  if (!supabase) {
    const list = leerLocal();
    const quitar = new Set();
    const ventaIds = [];
    let monto = 0;
    for (const m of list) {
      if (!ids.includes(String(m.id))) continue;
      if (m.tipo !== 'cargo' || String(m.estatus || 'pendiente') !== 'pendiente') continue;
      quitar.add(String(m.id));
      monto = round2(monto + (Number(m.monto) || 0));
      if (m.venta_id) ventaIds.push(String(m.venta_id));
    }
    if (!quitar.size) return { ok: false, error: 'No hay créditos pendientes en la selección.' };
    guardarLocal(list.filter((m) => !quitar.has(String(m.id))));
    return {
      ok: true,
      eliminados: quitar.size,
      monto,
      actor: actorNombre || 'Administrador',
      ventaIds,
      soloLocal: true,
    };
  }

  const { data: movs, error } = await supabase.from('ruta_cxc_movimientos').select('*').in('id', ids);
  if (error) {
    if (faltaTabla(error)) {
      return eliminarCreditosPendientesRuta(null, { movimientoIds: ids, rolActor, actorNombre });
    }
    return { ok: false, error: error.message };
  }
  const pendientes = (movs || []).filter(
    (m) => m.tipo === 'cargo' && String(m.estatus || 'pendiente') === 'pendiente',
  );
  if (!pendientes.length) return { ok: false, error: 'No hay créditos pendientes en la selección.' };

  const delIds = pendientes.map((m) => String(m.id));
  const monto = round2(pendientes.reduce((s, m) => s + (Number(m.monto) || 0), 0));
  const ventaIds = [...new Set(pendientes.map((m) => m.venta_id).filter(Boolean).map(String))];

  const { error: eDel } = await supabase.from('ruta_cxc_movimientos').delete().in('id', delIds);
  if (eDel) return { ok: false, error: eDel.message };

  for (const ventaId of ventaIds) {
    await supabase
      .from('ruta_ventas')
      .update({ estado_credito: 'anulado' })
      .eq('id', ventaId)
      .eq('estado_credito', 'pendiente');
  }

  return {
    ok: true,
    eliminados: delIds.length,
    monto,
    actor: actorNombre || 'Administrador',
    ventaIds,
  };
}

/** @deprecated — el cobro lo hace el cajero con PIN */
export async function registrarAbonoCobranzaRuta() {
  return { ok: false, error: 'Usa Cobranza: el cajero paga créditos de ruta con su PIN.' };
}
