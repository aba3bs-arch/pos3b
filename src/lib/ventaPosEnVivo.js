/**
 * Venta del POS del día en curso, en vivo (solo lectura).
 * No se suma al libro diario: el libro toma la venta del corte general de medianoche.
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { cargarDiaCaja, resumirMovimientosCaja } from './movimientosCaja.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function vacioVentaEnVivo() {
  return { total: 0, efectivo: 0, tarjeta: 0, otros: 0, tickets: 0, cancelaciones: 0 };
}

/** Resumen de caja (resumirMovimientosCaja) → montos para mostrar. */
export function montosVentaEnVivo(resumen) {
  const g = resumen?.grupos || {};
  const tarjeta = round2(g.tarjeta);
  const efectivo = round2(g.efectivo);
  const total = round2(resumen?.total);
  return {
    total,
    efectivo,
    tarjeta,
    otros: round2(total - efectivo - tarjeta),
    tickets: Number(resumen?.ticketsBruto ?? resumen?.tickets) || 0,
    cancelaciones: Number(resumen?.cancelaciones) || 0,
  };
}

export function sumarVentaEnVivo(lista = []) {
  const t = vacioVentaEnVivo();
  for (const m of lista) {
    t.total = round2(t.total + (Number(m?.total) || 0));
    t.efectivo = round2(t.efectivo + (Number(m?.efectivo) || 0));
    t.tarjeta = round2(t.tarjeta + (Number(m?.tarjeta) || 0));
    t.otros = round2(t.otros + (Number(m?.otros) || 0));
    t.tickets += Number(m?.tickets) || 0;
    t.cancelaciones += Number(m?.cancelaciones) || 0;
  }
  return t;
}

/**
 * @param {*} supabase
 * @param {{ sucursales: string[], fecha: string }} p fecha = día en curso (YYYY-MM-DD, hora Nogales)
 */
export async function cargarVentaPosEnVivo(supabase, { sucursales = [], fecha } = {}) {
  const tiendas = [...new Set((sucursales || []).map((s) => normalizarCodigoTienda(s)).filter(Boolean))];
  if (!supabase || !fecha || !tiendas.length) {
    return { ok: false, fecha, tiendas: {}, total: vacioVentaEnVivo(), actualizado: null, errores: [] };
  }
  const porTienda = {};
  const errores = [];
  for (let i = 0; i < tiendas.length; i += 3) {
    const lote = tiendas.slice(i, i + 3);
    // eslint-disable-next-line no-await-in-loop
    const rs = await Promise.all(lote.map(async (suc) => {
      try {
        const dia = await cargarDiaCaja(supabase, { sucursal: suc, fecha, turno: null });
        if (dia?.error) return { suc, error: String(dia.error) };
        return { suc, montos: montosVentaEnVivo(resumirMovimientosCaja(dia?.ventas || [], dia?.cancelaciones || [])) };
      } catch (err) {
        return { suc, error: err?.message || String(err) };
      }
    }));
    for (const r of rs) {
      if (r.error) errores.push({ sucursal: r.suc, error: r.error });
      else porTienda[r.suc] = r.montos;
    }
  }
  return {
    ok: Object.keys(porTienda).length > 0,
    fecha,
    tiendas: porTienda,
    total: sumarVentaEnVivo(Object.values(porTienda)),
    actualizado: new Date().toISOString(),
    errores,
  };
}
