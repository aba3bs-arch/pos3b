import { montosPagoDesdeVentaRuta } from './compraGastoCorte.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { inicioDia, finDia } from './corteCaja.js';

const MAX_PAGINAS = 30;
const TAMANO_PAGINA = 1000;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function ventaCancelada(venta) {
  return String(venta?.estado || '').toLowerCase() === 'cancelada';
}

/** Clave y nombre de la tienda/cliente al que se vendió. */
export function tiendaDeVentaRuta(venta) {
  const tipo = String(venta?.cliente_tipo || '').toLowerCase();
  if (!tipo || tipo === 'sucursal') {
    const cod = normalizarCodigoTienda(venta?.cliente_id) || String(venta?.cliente_id || '').toUpperCase();
    if (cod) return { clave: cod, nombre: venta?.cliente_nombre || cod, externo: false };
  }
  const nombre = String(venta?.cliente_nombre || venta?.cliente_id || 'Sin cliente').trim();
  return { clave: `EXT:${nombre.toUpperCase()}`, nombre, externo: true };
}

/**
 * Totales de efectivo y crédito por tienda a partir de ventas de ruta.
 * Las canceladas no cuentan. Mixto usa el desglose guardado en la venta.
 */
export function resumirVentasPorTienda(ventas, { tienda = '' } = {}) {
  const porTienda = new Map();
  const total = { ventas: 0, efectivo: 0, credito: 0, total: 0, canceladas: 0 };

  for (const v of ventas || []) {
    if (ventaCancelada(v)) {
      total.canceladas += 1;
      continue;
    }
    const t = tiendaDeVentaRuta(v);
    if (tienda && t.clave !== tienda) continue;
    const pago = montosPagoDesdeVentaRuta(v);
    const monto = r2(v.total);
    const efectivo = r2(pago.montoEfectivo);
    const credito = r2(pago.montoCredito);

    let fila = porTienda.get(t.clave);
    if (!fila) {
      fila = { clave: t.clave, nombre: t.nombre, externo: t.externo, ventas: 0, efectivo: 0, credito: 0, total: 0, detalle: [] };
      porTienda.set(t.clave, fila);
    }
    fila.ventas += 1;
    fila.efectivo = r2(fila.efectivo + efectivo);
    fila.credito = r2(fila.credito + credito);
    fila.total = r2(fila.total + monto);
    fila.detalle.push({ ...v, _efectivo: efectivo, _credito: credito });

    total.ventas += 1;
    total.efectivo = r2(total.efectivo + efectivo);
    total.credito = r2(total.credito + credito);
    total.total = r2(total.total + monto);
  }

  const filas = [...porTienda.values()].sort((a, b) => b.total - a.total);
  return { filas, total };
}

/** Tiendas presentes en las ventas (para el selector), canceladas excluidas. */
export function tiendasDeVentas(ventas) {
  const mapa = new Map();
  for (const v of ventas || []) {
    if (ventaCancelada(v)) continue;
    const t = tiendaDeVentaRuta(v);
    if (!mapa.has(t.clave)) mapa.set(t.clave, t.nombre);
  }
  return [...mapa.entries()]
    .map(([clave, nombre]) => ({ clave, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Ventas de ruta del rango (días completos, hora de Nogales), paginadas. */
export async function listarVentasRutaPorRango(supabase, { desde, hasta } = {}) {
  if (!supabase) return { data: [] };
  const ini = inicioDia(desde).toISOString();
  const fin = finDia(hasta || desde).toISOString();
  const data = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { data: lote, error } = await supabase
      .from('ruta_ventas')
      .select('*')
      .gte('created_at', ini)
      .lte('created_at', fin)
      .order('created_at', { ascending: false })
      .range(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA - 1);
    if (error) return { data, error: error.message };
    data.push(...(lote || []));
    if (!lote || lote.length < TAMANO_PAGINA) break;
  }
  return { data };
}

export function gastoVigente(gasto) {
  return !/cancel|rechaz|anulad/i.test(String(gasto?.estatus || ''));
}

export function totalGastos(gastos) {
  return r2((gastos || []).filter(gastoVigente).reduce((s, g) => s + (Number(g?.monto) || 0), 0));
}

/** Gastos de ruta (Venta en Ruta → Gastos) del rango. No trae la foto de evidencia. */
export async function listarGastosRutaPorRango(supabase, { desde, hasta } = {}) {
  if (!supabase) return { data: [] };
  const ini = inicioDia(desde).toISOString();
  const fin = finDia(hasta || desde).toISOString();
  const data = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { data: lote, error } = await supabase
      .from('transito_efectivo')
      .select('id, monto, fecha_hora, num_traspaso, descripcion_gasto, estatus, repartidor_id')
      .eq('tipo_movimiento', 'Gasto')
      .gte('fecha_hora', ini)
      .lte('fecha_hora', fin)
      .order('fecha_hora', { ascending: false })
      .range(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA - 1);
    if (error) return { data, error: error.message };
    data.push(...(lote || []));
    if (!lote || lote.length < TAMANO_PAGINA) break;
  }
  return { data };
}

/**
 * Crédito aún por cobrar de las ventas a crédito del periodo.
 * Solo cuenta cargos ligados (venta_id o folio) a ventas no canceladas del rango, y los agrupa
 * con la misma tienda de la venta: así el pendiente nunca supera el crédito mostrado.
 * @returns {{ porTienda: Map<string, {clave, nombre, externo, monto, folios: object[]}>, total: number }}
 */
export function resumirCreditoPendiente(cargos, ventas) {
  const porId = new Map();
  const porFolio = new Map();
  for (const v of ventas || []) {
    if (ventaCancelada(v)) continue;
    if (v.id != null) porId.set(String(v.id), v);
    if (v.folio) porFolio.set(String(v.folio).trim().toUpperCase(), v);
  }
  const porTienda = new Map();
  let total = 0;
  for (const c of cargos || []) {
    const monto = r2(c?.monto);
    if (!(monto > 0)) continue;
    const venta = (c.venta_id != null && porId.get(String(c.venta_id)))
      || (c.folio_venta && porFolio.get(String(c.folio_venta).trim().toUpperCase()));
    if (!venta) continue;
    const t = tiendaDeVentaRuta(venta);
    let fila = porTienda.get(t.clave);
    if (!fila) {
      fila = { ...t, monto: 0, folios: [] };
      porTienda.set(t.clave, fila);
    }
    fila.monto = r2(fila.monto + monto);
    fila.folios.push(c);
    total = r2(total + monto);
  }
  return { porTienda, total };
}

/** Anota el pendiente en cada fila de tienda (no agrega filas ni cambia efectivo/crédito). */
export function combinarVentasYPendiente(filas, pendiente) {
  return (filas || []).map((f) => {
    const p = pendiente?.porTienda?.get(f.clave);
    return { ...f, pendiente: p?.monto || 0, foliosPendientes: p?.folios || [] };
  });
}

/** Crédito pendiente de una tienda, o el total de todas si no hay tienda elegida. */
export function pendienteMostrado(pendiente, tienda = '') {
  if (!pendiente) return 0;
  if (tienda) return pendiente.porTienda.get(tienda)?.monto || 0;
  return pendiente.total;
}
