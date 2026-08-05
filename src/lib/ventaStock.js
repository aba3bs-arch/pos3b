import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { stockEnUbicacionReal } from './inventarioMultitienda.js';
import {
  descontarStockPorVenta,
  devolverStockPorCancelacion,
  leerProductoInventarioFresco,
  AVISO_FALTA_RPC_STOCK,
} from './inventarioMovimientos.js';
import { leerConfigVenta } from './posConfig.js';
import { puedeVerStockNegativo } from './roles.js';

/** Existencia real en piso de la tienda que vende. */
export function existenciaPisoVenta(producto, sucursal) {
  const tienda = normalizarCodigoTienda(sucursal) || sucursal;
  return stockEnUbicacionReal(producto, tienda, 'piso', tienda);
}

export function qtyEnCarrito(carrito, productoId) {
  const row = (carrito || []).find((c) => String(c.id) === String(productoId));
  return row ? Math.max(1, Math.floor(Number(row.qty) || 1)) : 0;
}

export function puedeOverrideExistenciaVenta(rol, config = null) {
  const cfg = config || leerConfigVenta();
  if (cfg.existencia !== 'aviso_admin') return false;
  return puedeVerStockNegativo(rol);
}

export function evaluarExistenciaLinea({ producto, sucursal, qtyNecesaria, config, rol }) {
  const cfg = config || leerConfigVenta();
  const existencia = existenciaPisoVenta(producto, sucursal);
  const need = Math.max(1, Math.floor(Number(qtyNecesaria) || 1));
  if (need <= existencia) {
    return { ok: true, existencia, qty: need };
  }
  const faltan = need - Math.max(0, existencia);
  const nombre = producto?.nombre || producto?.id || '—';
  const msg = `${nombre}: hay ${existencia} en piso, pides ${need} (faltan ${faltan}).`;
  const puedeOverride = puedeOverrideExistenciaVenta(rol, cfg);
  return { ok: false, insuficiente: true, existencia, qty: need, faltan, msg, puedeOverride };
}

export function validarCarritoExistencia({ carrito, inventario, sucursal, config, rol }) {
  const cfg = config || leerConfigVenta();
  const problemas = [];
  for (const c of carrito || []) {
    const p = (inventario || []).find((x) => String(x.id) === String(c.id));
    if (!p) continue;
    const qty = Math.max(1, Math.floor(Number(c.qty) || 1));
    const r = evaluarExistenciaLinea({ producto: p, sucursal, qtyNecesaria: qty, config: cfg, rol });
    if (!r.ok) problemas.push({ ...r, id: c.id, nombre: c.nombre || p.nombre });
  }
  const bloqueantes = problemas.filter((p) => !p.puedeOverride);
  return {
    ok: problemas.length === 0,
    problemas,
    bloqueado: bloqueantes.length > 0,
  };
}

/** Valida existencia leyendo stock fresco de la nube (antes de cobrar). */
export async function validarExistenciaVentaFresca(supabase, { carrito, sucursal, config, rol }) {
  const cfg = config || leerConfigVenta();
  const tienda = normalizarCodigoTienda(sucursal) || sucursal;
  const problemas = [];
  for (const c of carrito || []) {
    const need = Math.max(1, Math.floor(Number(c.qty) || 1));
    const fresh = await leerProductoInventarioFresco(supabase, c.id);
    if (!fresh.ok) {
      return { ok: false, error: fresh.error, problemas: [], bloqueado: true };
    }
    const r = evaluarExistenciaLinea({
      producto: fresh.producto,
      sucursal: tienda,
      qtyNecesaria: need,
      config: cfg,
      rol,
    });
    if (!r.ok) {
      problemas.push({ ...r, id: c.id, nombre: c.nombre || fresh.producto.nombre, productoId: c.id });
    }
  }
  const bloqueantes = problemas.filter((p) => !p.puedeOverride);
  return {
    ok: problemas.length === 0,
    problemas,
    bloqueado: bloqueantes.length > 0,
    requiereConfirmacionAdmin: problemas.some((p) => p.puedeOverride),
  };
}

/** Descuenta piso de todas las líneas; si falla una, el caller debe revertir `descuentos`. */
export async function descontarStockCarritoVenta(supabase, { carrito, sucursal }) {
  const tienda = normalizarCodigoTienda(sucursal) || sucursal;
  const descuentos = [];
  for (const c of carrito || []) {
    const need = Math.max(1, Math.floor(Number(c.qty) || 1));
    const r = await descontarStockPorVenta(supabase, {
      productoId: c.id,
      qty: need,
      sucursal: tienda,
    });
    if (!r.ok) {
      return {
        ok: false,
        error: `${c.nombre || c.id}: ${r.error || 'No se pudo descontar'}`,
        descuentos,
        faltaRpc: Boolean(r.faltaRpc),
      };
    }
    descuentos.push({
      productoId: c.id,
      nombre: c.nombre,
      qty: need,
      antes: r.antes,
      despues: r.despues,
    });
  }
  return { ok: true, descuentos };
}

/** Revierte descuentos parciales si falla el ticket o una línea intermedia. */
export async function revertirDescuentosVenta(supabase, descuentos, sucursal) {
  const tienda = normalizarCodigoTienda(sucursal) || sucursal;
  const errores = [];
  for (const d of descuentos || []) {
    const r = await devolverStockPorCancelacion(supabase, {
      productoId: d.productoId,
      qty: d.qty,
      sucursal: tienda,
    });
    if (!r.ok) errores.push(`${d.nombre || d.productoId}: ${r.error}`);
  }
  return { ok: errores.length === 0, errores };
}

export function mensajeProblemasExistencia(problemas, max = 8) {
  const lines = (problemas || []).slice(0, max).map((p) => p.msg);
  const extra = problemas.length > max ? `\n…y ${problemas.length - max} más` : '';
  return lines.join('\n') + extra;
}

export { AVISO_FALTA_RPC_STOCK };
