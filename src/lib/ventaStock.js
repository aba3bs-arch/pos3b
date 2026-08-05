import { normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  descontarStockPorVenta,
  devolverStockPorCancelacion,
  AVISO_FALTA_RPC_STOCK,
} from './inventarioMovimientos.js';

/**
 * Descuenta piso de todas las líneas (permite dejar stock en 0 o negativo).
 * Si falla una línea, el caller debe revertir `descuentos`.
 */
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

export { AVISO_FALTA_RPC_STOCK };
