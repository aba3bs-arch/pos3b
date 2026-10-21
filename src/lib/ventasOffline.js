/**
 * Ventas offline: cola local + catálogo en caché + sync al recuperar red.
 * Una caja por sucursal: solo Ventas opera sin internet; el resto se bloquea en App.
 */

import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { descontarStockPorVenta, guardarMovimientoLocal } from './inventarioMovimientos.js';
import { buildPatchStock, stockEnUbicacion } from './inventarioMultitienda.js';

export const LS_COLA_VENTAS_OFFLINE = 'pos3b_ventas_offline_cola';
export const LS_CATALOGO_OFFLINE_PREFIX = 'pos3b_catalogo_offline_';
export const EVENTO_VENTAS_OFFLINE = 'pos3b-ventas-offline';
export const EVENTO_MODO_OFFLINE = 'pos3b-modo-offline';

const MAX_COLA = 200;
/** Tope para no dejar la caja colgada cuando el router sigue “en línea” pero no hay internet. */
export const TIMEOUT_SONDEO_RED_MS = 6_000;
export const TIMEOUT_INSERT_VENTA_MS = 8_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function esUuid(valor) {
  return UUID_RE.test(String(valor || '').trim());
}

export function nuevoUuidVenta() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function esErrorDeRed(err) {
  if (!err) return false;
  const name = String(err?.name || '');
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'FetchError') return true;
  const code = String(err?.code || '').toUpperCase();
  if (['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    return true;
  }
  if (err?.status === 0) return true;
  const msg = String(err?.message || err?.details || err?.hint || (typeof err === 'string' ? err : '') || '').toLowerCase();
  if (!msg || msg === '[object object]') return name === 'TypeError';
  return (
    msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('network request failed')
    || msg.includes('fetch failed')
    || msg.includes('err_internet_disconnected')
    || msg.includes('err_connection')
    || msg.includes('err_name_not_resolved')
    || msg.includes('err_network')
    || msg.includes('load failed')
    || msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('offline')
    || msg.includes('aborted')
    || msg.includes('enotfound')
    || msg.includes('econnrefused')
    || msg.includes('econnreset')
    || msg.includes('etimedout')
    || name === 'TypeError'
  );
}

export function esDuplicadoVenta(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || err || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key');
}

/** Avisa al hook de modo offline (p. ej. si cargar el catálogo falló por red). */
export function notificarFalloDeRed() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_MODO_OFFLINE));
  } catch {
    /* ignore */
  }
}

function urlBaseSupabase(supabase) {
  return String(supabase?.supabaseUrl || supabase?.restUrl || '').replace(/\/$/, '');
}

function llaveSupabase(supabase) {
  return String(supabase?.supabaseKey || supabase?.anonKey || '');
}

/**
 * Sondeo real a Supabase (navigator.onLine solo no basta).
 * Si el GET se cuelga (Wi‑Fi arriba, ISP caído), se aborta y cuenta como sin red.
 */
export async function sondarConexionSupabase(supabase, { timeoutMs = TIMEOUT_SONDEO_RED_MS } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!supabase) return false;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
  try {
    const base = urlBaseSupabase(supabase);
    const key = llaveSupabase(supabase);
    if (base && key && typeof fetch === 'function') {
      const res = await fetch(`${base}/rest/v1/productos?select=id&limit=1`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
        signal: ctrl?.signal,
      });
      return typeof res?.status === 'number' && res.status > 0;
    }
    let q = supabase.from('productos').select('id').limit(1);
    if (ctrl && typeof q.abortSignal === 'function') q = q.abortSignal(ctrl.signal);
    const { error } = await q;
    if (error && esErrorDeRed(error)) return false;
    return true;
  } catch (e) {
    return !esErrorDeRed(e) ? true : false;
  } finally {
    clearTimeout(timer);
  }
}

function emitirCambioCola() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_VENTAS_OFFLINE));
  } catch {
    /* ignore */
  }
}

export function fotoParaCacheOffline(foto) {
  const s = typeof foto === 'string' ? foto : '';
  if (!s || s.startsWith('data:')) return null;
  return s;
}

export function claveCatalogoOffline(sucursal) {
  return `${LS_CATALOGO_OFFLINE_PREFIX}${normalizarCodigoTienda(sucursal) || 'MAIN'}`;
}

export function guardarCatalogoOffline(sucursal, productos) {
  try {
    const sid = normalizarCodigoTienda(sucursal);
    if (!sid || !Array.isArray(productos) || !productos.length) return;
    const slim = productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      stock: p.stock,
      stock_sucursales: p.stock_sucursales,
      stock_cedis: p.stock_cedis,
      cat: p.cat,
      departamento: p.departamento,
      favorito: p.favorito,
      en_favoritos: p.en_favoritos,
      favoritos_sucursales: p.favoritos_sucursales || null,
      en_venta: p.en_venta,
      codigos_alt: Array.isArray(p.codigos_alt) ? p.codigos_alt : [],
      foto_url: fotoParaCacheOffline(p.foto_url),
    }));
    localStorage.setItem(
      claveCatalogoOffline(sid),
      JSON.stringify({ at: new Date().toISOString(), productos: slim }),
    );
  } catch {
    /* quota */
  }
}

export function leerCatalogoOffline(sucursal) {
  try {
    const raw = localStorage.getItem(claveCatalogoOffline(sucursal));
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j?.productos) ? j.productos : [];
  } catch {
    return [];
  }
}

function leerColaRaw() {
  try {
    const raw = localStorage.getItem(LS_COLA_VENTAS_OFFLINE);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarColaRaw(lista) {
  localStorage.setItem(LS_COLA_VENTAS_OFFLINE, JSON.stringify((lista || []).slice(0, MAX_COLA)));
  emitirCambioCola();
}

function actualizarVentaEnCola(id, patch) {
  const cola = leerColaRaw().map((x) => (x && x.id === id ? { ...x, ...patch } : x));
  guardarColaRaw(cola);
}

function quitarVentaDeCola(id) {
  guardarColaRaw(leerColaRaw().filter((x) => x?.id !== id));
}

export function leerColaVentasOffline(sucursal = null) {
  const lista = leerColaRaw().filter((v) => v && v.estado !== 'sync_ok');
  if (!sucursal) return lista;
  const sid = normalizarCodigoTienda(sucursal);
  return lista.filter((v) => normalizarCodigoTienda(v.sucursal_id) === sid);
}

export function contarVentasOfflinePendientes(sucursal = null) {
  return leerColaVentasOffline(sucursal).length;
}

/** Fila que se inserta en `ventas` (id estable + hora real del cobro). */
export function filaInsertVenta(venta) {
  const uuid = esUuid(venta?.venta_uuid) ? venta.venta_uuid : (esUuid(venta?.id) ? venta.id : null);
  const row = {
    vendedor: venta?.vendedor,
    usuario_id: venta?.usuario_id || null,
    sucursal_id: venta?.sucursal_id,
    total: venta?.total,
    metodo_pago: venta?.metodo_pago,
    articulos: venta?.articulos,
    turno_id: venta?.turno_id || null,
    turno_nombre: venta?.turno_nombre || null,
  };
  if (uuid) row.id = uuid;
  if (venta?.created_at) row.created_at = venta.created_at;
  return row;
}

/**
 * Inserta la venta. Si el servidor ya la tiene (reintento), no es error.
 * @returns {{ ok: boolean, red?: boolean, duplicada?: boolean, error?: any }}
 */
export async function insertarVentaEnSupabase(supabase, venta, { timeoutMs = TIMEOUT_INSERT_VENTA_MS } = {}) {
  if (!supabase) return { ok: false, red: true, error: new Error('Sin conexión.') };
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer;
  try {
    let q = supabase.from('ventas').insert([filaInsertVenta(venta)]);
    if (ctrl && typeof q.abortSignal === 'function') q = q.abortSignal(ctrl.signal);
    const result = await Promise.race([
      q,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          ctrl?.abort();
          const e = new Error('timeout');
          e.name = 'TimeoutError';
          reject(e);
        }, timeoutMs);
      }),
    ]);
    const error = result?.error;
    if (!error) return { ok: true };
    if (esDuplicadoVenta(error)) return { ok: true, duplicada: true };
    return { ok: false, red: esErrorDeRed(error), error };
  } catch (e) {
    if (esDuplicadoVenta(e)) return { ok: true, duplicada: true };
    return { ok: false, red: esErrorDeRed(e), error: e };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Encola una venta para sync posterior.
 * @returns {{ ok: boolean, id?: string, venta_uuid?: string, error?: string }}
 */
export function encolarVentaOffline(payload) {
  try {
    const id = `off-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ventaUuid = esUuid(payload?.venta_uuid) ? payload.venta_uuid : nuevoUuidVenta();
    const row = {
      id,
      estado: 'pendiente',
      created_at: new Date().toISOString(),
      ...payload,
      venta_uuid: ventaUuid,
      sucursal_id: normalizarCodigoTienda(payload?.sucursal_id) || payload?.sucursal_id,
    };
    const cola = leerColaRaw();
    cola.unshift(row);
    guardarColaRaw(cola);
    return { ok: true, id, venta_uuid: ventaUuid };
  } catch (e) {
    return { ok: false, error: e?.message || 'No se pudo guardar la venta offline.' };
  }
}

/** Descuenta stock en memoria (piso de la tienda) tras una venta offline. */
export function aplicarDescuentoStockLocal(productos, articulos, sucursal) {
  const sid = normalizarCodigoTienda(sucursal);
  const list = Array.isArray(productos) ? productos.map((p) => ({ ...p })) : [];
  for (const art of articulos || []) {
    const need = Math.max(0, Math.floor(Number(art.qty) || 0));
    if (!need || art.id == null) continue;
    const i = list.findIndex((p) => String(p.id) === String(art.id));
    if (i < 0) continue;
    const p = list[i];
    const antes = stockEnUbicacion(p, sid, 'piso');
    const despues = antes - need; // puede quedar negativo (igual que online)
    const patch = buildPatchStock(p, sid, 'piso', despues, sid, { permitirNegativo: true });
    list[i] = { ...p, ...patch };
  }
  return list;
}

/**
 * Sube ventas pendientes. Al terminar con éxito, el caller debe recargar catálogo.
 */
export async function sincronizarColaVentasOffline(supabase, { sucursal = null } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', synced: 0, failed: 0 };
  const online = await sondarConexionSupabase(supabase);
  if (!online) return { ok: false, error: 'Sin red.', synced: 0, failed: 0 };

  const cola = leerColaRaw();
  const pendientes = cola.filter((v) => {
    if (!v || v.estado === 'sync_ok') return false;
    if (!sucursal) return true;
    return normalizarCodigoTienda(v.sucursal_id) === normalizarCodigoTienda(sucursal);
  });

  let synced = 0;
  let failed = 0;
  const errores = [];

  for (const ventaInicial of pendientes) {
    let venta = ventaInicial;
    try {
      if (!esUuid(venta.venta_uuid)) {
        venta = { ...venta, venta_uuid: nuevoUuidVenta() };
        actualizarVentaEnCola(venta.id, { venta_uuid: venta.venta_uuid });
      }

      if (!venta.venta_insertada) {
        const ins = await insertarVentaEnSupabase(supabase, venta);
        if (!ins.ok) {
          failed += 1;
          errores.push(`${venta.id}: ${ins.error?.message || ins.error || 'insert'}`);
          if (ins.red) {
            return { ok: false, error: 'Se perdió la red durante el sync.', synced, failed, errores };
          }
          continue;
        }
        venta = { ...venta, venta_insertada: true };
        actualizarVentaEnCola(venta.id, { venta_insertada: true, venta_uuid: venta.venta_uuid });
      }

      const tienda = venta.sucursal_id;
      const hechos = new Set(Array.isArray(venta.stock_lineas_ok) ? venta.stock_lineas_ok : []);
      let redStock = false;
      const articulos = venta.articulos || [];
      for (let i = 0; i < articulos.length; i += 1) {
        if (hechos.has(i)) continue;
        const c = articulos[i];
        const need = c.qty || 1;
        let r;
        try {
          r = await descontarStockPorVenta(supabase, {
            productoId: c.id,
            qty: need,
            sucursal: tienda,
          });
        } catch (e) {
          if (esErrorDeRed(e)) {
            redStock = true;
            break;
          }
          r = { ok: false, error: e?.message || String(e) };
        }
        if (!r?.ok && esErrorDeRed(r?.error || r)) {
          redStock = true;
          break;
        }
        if (r?.ok) {
          guardarMovimientoLocal(
            {
              tipo: 'retiro',
              modo: 'venta',
              producto_id: c.id,
              producto_nombre: c.nombre,
              cantidad: need,
              stock_antes: r.antes,
              stock_despues: r.despues,
              ubicacion: 'piso',
              motivo: `Venta offline sync · ${venta.metodo_pago}`,
              usuario: venta.vendedor,
              sucursal: tienda,
              created_at: venta.created_at,
            },
            supabase,
          );
        }
        hechos.add(i);
        actualizarVentaEnCola(venta.id, { stock_lineas_ok: [...hechos], venta_insertada: true });
      }

      if (redStock) {
        failed += 1;
        errores.push(`${venta.id}: red durante descuento de stock`);
        return { ok: false, error: 'Se perdió la red durante el sync.', synced, failed, errores };
      }

      quitarVentaDeCola(venta.id);
      synced += 1;
    } catch (e) {
      failed += 1;
      errores.push(`${venta.id}: ${e?.message || e}`);
      if (esErrorDeRed(e)) {
        return { ok: false, error: 'Se perdió la red durante el sync.', synced, failed, errores };
      }
    }
  }

  return {
    ok: failed === 0,
    synced,
    failed,
    errores,
    pendientes: contarVentasOfflinePendientes(sucursal),
  };
}

export const MODULOS_PERMITIDOS_OFFLINE = new Set(['Ventas']);

export function moduloPermitidoOffline(nombre) {
  return MODULOS_PERMITIDOS_OFFLINE.has(nombre);
}
