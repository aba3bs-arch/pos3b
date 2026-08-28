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

export function esErrorDeRed(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('network request failed')
    || msg.includes('fetch failed')
    || msg.includes('err_internet_disconnected')
    || msg.includes('err_connection')
    || msg.includes('err_name_not_resolved')
    || msg.includes('load failed')
    || msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('offline')
    || err?.name === 'TypeError'
  );
}

/** Sondeo real a Supabase (navigator.onLine solo no basta). */
export async function sondarConexionSupabase(supabase) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('productos').select('id').limit(1);
    if (error && esErrorDeRed(error)) return false;
    // Error de esquema/permiso sigue siendo “hay red”.
    return true;
  } catch (e) {
    return !esErrorDeRed(e) ? true : false;
  }
}

function emitirCambioCola() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_VENTAS_OFFLINE));
  } catch {
    /* ignore */
  }
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
      en_venta: p.en_venta,
      foto_url: p.foto_url || null,
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

export function leerColaVentasOffline(sucursal = null) {
  const lista = leerColaRaw().filter((v) => v && v.estado !== 'sync_ok');
  if (!sucursal) return lista;
  const sid = normalizarCodigoTienda(sucursal);
  return lista.filter((v) => normalizarCodigoTienda(v.sucursal_id) === sid);
}

export function contarVentasOfflinePendientes(sucursal = null) {
  return leerColaVentasOffline(sucursal).length;
}

/**
 * Encola una venta para sync posterior.
 * @returns {{ ok: boolean, id?: string, error?: string }}
 */
export function encolarVentaOffline(payload) {
  try {
    const id = `off-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const row = {
      id,
      estado: 'pendiente',
      created_at: new Date().toISOString(),
      ...payload,
      sucursal_id: normalizarCodigoTienda(payload.sucursal_id) || payload.sucursal_id,
    };
    const cola = leerColaRaw();
    cola.unshift(row);
    guardarColaRaw(cola);
    return { ok: true, id };
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

  let cola = leerColaRaw();
  const pendientes = cola.filter((v) => {
    if (!v || v.estado === 'sync_ok') return false;
    if (!sucursal) return true;
    return normalizarCodigoTienda(v.sucursal_id) === normalizarCodigoTienda(sucursal);
  });

  let synced = 0;
  let failed = 0;
  const errores = [];

  for (const venta of pendientes) {
    try {
      const { error } = await supabase.from('ventas').insert([
        {
          vendedor: venta.vendedor,
          usuario_id: venta.usuario_id || null,
          sucursal_id: venta.sucursal_id,
          total: venta.total,
          metodo_pago: venta.metodo_pago,
          articulos: venta.articulos,
          turno_id: venta.turno_id || null,
          turno_nombre: venta.turno_nombre || null,
        },
      ]);
      if (error) throw error;

      const tienda = venta.sucursal_id;
      for (const c of venta.articulos || []) {
        const need = c.qty || 1;
        const r = await descontarStockPorVenta(supabase, {
          productoId: c.id,
          qty: need,
          sucursal: tienda,
        });
        if (r.ok) {
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
      }

      cola = leerColaRaw().filter((x) => x.id !== venta.id);
      guardarColaRaw(cola);
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
