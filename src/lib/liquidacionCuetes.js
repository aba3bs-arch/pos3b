/**
 * Liquidación de fin de año a partir de las ventas de ruta de CUETES.
 * El crédito que sigue pendiente se queda en el total.
 * El efectivo y los abonos entran a la liquidación en curso hasta que se cierran.
 */

import { montosPagoDesdeVentaRuta } from './compraGastoCorte.js';
import { round2 } from './creditoFinAnio.js';
import { tiendaDeVentaRuta, ventaCancelada } from './ventasRutaPorTienda.js';

const TABLA_LIQUIDACIONES = 'credito_fin_anio_liquidaciones';

function roundShare(monto, share) {
  return round2((Number(monto) || 0) * share);
}

export function importeCuetesVenta(venta, idsCuete) {
  const set = idsCuete instanceof Set ? idsCuete : new Set((idsCuete || []).map((id) => String(id)));
  let cuete = 0;
  let todos = 0;
  for (const a of venta?.articulos || []) {
    if (!a || a._pago_mixto || a._lineas_camion || !a.producto_id) continue;
    const imp = Number(a.importe) || (Number(a.precio) || 0) * (Number(a.cantidad) || 0);
    if (!(imp > 0)) continue;
    todos += imp;
    if (set.has(String(a.producto_id))) cuete += imp;
  }
  return { cuete: round2(cuete), todos: round2(todos) };
}

/** Parte de cuetes de una venta: lo pendiente y cada cobro (contado o abono). */
export function cobrosCueteDeVenta(venta, idsCuete, abonos = []) {
  if (!venta || ventaCancelada(venta)) return null;
  if (String(venta.estado_credito || '').toLowerCase() === 'anulado') return null;
  const { cuete, todos } = importeCuetesVenta(venta, idsCuete);
  if (!(cuete > 0) || !(todos > 0)) return null;
  const share = cuete / todos;
  const pagos = montosPagoDesdeVentaRuta(venta, todos);
  const tienda = tiendaDeVentaRuta(venta);
  const estado = String(venta.estado_credito || '').toLowerCase();
  const deEsta = (abonos || []).filter((a) => String(a.venta_id || '') === String(venta.id));
  const cobros = [];
  const efectivo = roundShare(pagos.montoEfectivo, share);
  let credito = roundShare(pagos.montoCredito, share);
  if (efectivo > 0) {
    cobros.push({
      ref: `venta:${venta.id}:efectivo`,
      sucursal_id: tienda.clave,
      nombre: tienda.nombre,
      monto: efectivo,
      created_at: venta.created_at || null,
      notas: venta.folio ? `Venta ${venta.folio}` : 'Venta de contado',
    });
  }
  const abonoCuete = round2(deEsta.reduce((s, a) => s + roundShare(a.monto, share), 0));
  if (abonoCuete > 0) {
    for (const a of deEsta) {
      const monto = roundShare(a.monto, share);
      if (!(monto > 0)) continue;
      cobros.push({
        ref: `abono:${a.id}`,
        sucursal_id: tienda.clave,
        nombre: tienda.nombre,
        monto,
        created_at: a.created_at || null,
        notas: a.folio_venta ? `Abono ${a.folio_venta}` : 'Abono',
      });
    }
    credito = round2(Math.max(0, credito - abonoCuete));
  } else if (credito > 0 && estado && estado !== 'pendiente') {
    cobros.push({
      ref: `venta:${venta.id}:credito`,
      sucursal_id: tienda.clave,
      nombre: tienda.nombre,
      monto: credito,
      created_at: venta.created_at || null,
      notas: venta.folio ? `Crédito cobrado ${venta.folio}` : 'Crédito cobrado',
    });
    credito = 0;
  }
  return { sucursal_id: tienda.clave, nombre: tienda.nombre, vendido: cuete, pendiente: credito, cobros };
}

function lineasCueteDeVenta(venta, idsCuete) {
  const set = idsCuete instanceof Set ? idsCuete : new Set((idsCuete || []).map((id) => String(id)));
  const out = [];
  for (const a of venta?.articulos || []) {
    if (!a || a._pago_mixto || a._lineas_camion || !a.producto_id) continue;
    if (!set.has(String(a.producto_id))) continue;
    const cantidad = Number(a.cantidad) || 0;
    const importe = Number(a.importe) || (Number(a.precio) || 0) * cantidad;
    if (!(importe > 0)) continue;
    out.push({
      nombre: a.nombre || String(a.producto_id),
      cantidad,
      precio: round2(a.precio),
      importe: round2(importe),
    });
  }
  return out;
}

/** Ticket de una venta a crédito, solo con la parte de cuetes. El contado no entra. */
export function ticketCreditoCuete(venta, idsCuete, abonos = []) {
  const base = cobrosCueteDeVenta(venta, idsCuete, abonos);
  if (!base) return null;
  const { cuete, todos } = importeCuetesVenta(venta, idsCuete);
  if (!(todos > 0)) return null;
  const credito = roundShare(montosPagoDesdeVentaRuta(venta, todos).montoCredito, cuete / todos);
  if (!(credito > 0)) return null;
  return {
    id: venta.id,
    folio: venta.folio || '',
    created_at: venta.created_at || null,
    vendedor: venta.vendedor_nombre || '',
    estado: String(venta.estado_credito || '').toLowerCase() || 'pendiente',
    sucursal_id: base.sucursal_id,
    nombre: base.nombre,
    credito,
    pendiente: base.pendiente,
    abonado: round2(Math.max(0, credito - base.pendiente)),
    lineas: lineasCueteDeVenta(venta, idsCuete),
  };
}

/** Crédito de cuetes agrupado por tienda, con sus tickets. */
export function agruparCreditoPorTienda(ventas, idsCuete, abonos = []) {
  const map = new Map();
  for (const venta of ventas || []) {
    const t = ticketCreditoCuete(venta, idsCuete, abonos);
    if (!t) continue;
    const g = map.get(t.sucursal_id) || {
      sucursal_id: t.sucursal_id,
      nombre: t.nombre,
      credito: 0,
      pendiente: 0,
      abonado: 0,
      tickets: [],
    };
    g.credito = round2(g.credito + t.credito);
    g.pendiente = round2(g.pendiente + t.pendiente);
    g.abonado = round2(g.abonado + t.abonado);
    g.tickets.push(t);
    map.set(t.sucursal_id, g);
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      tickets: g.tickets.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    }))
    .sort((a, b) => b.credito - a.credito || a.sucursal_id.localeCompare(b.sucursal_id, 'es'));
}

export function refsLiquidadas(liquidaciones) {
  const set = new Set();
  for (const row of liquidaciones || []) {
    if (String(row?.estado || '') !== 'cerrada' || row?.archived_at) continue;
    for (const p of Array.isArray(row.detalle) ? row.detalle : []) {
      for (const a of p?.abonos || []) {
        if (a?.ref) set.add(String(a.ref));
      }
    }
  }
  return set;
}

/** Totales abiertos: crédito que sigue y cobros que todavía no se liquidan. */
export function armarLiquidacionCuetes(ventas, idsCuete, abonos, liquidaciones) {
  const ya = refsLiquidadas(liquidaciones);
  const porTienda = new Map();
  const pendienteDe = (sid, nombre) => {
    const g = porTienda.get(sid) || { sucursal_id: sid, nombre, monto: 0, pendiente: 0, abonos: [] };
    porTienda.set(sid, g);
    return g;
  };
  let pendiente = 0;
  for (const venta of ventas || []) {
    const r = cobrosCueteDeVenta(venta, idsCuete, abonos);
    if (!r) continue;
    pendiente = round2(pendiente + r.pendiente);
    if (r.pendiente > 0) {
      const g = pendienteDe(r.sucursal_id, r.nombre);
      g.pendiente = round2(g.pendiente + r.pendiente);
    }
    for (const c of r.cobros) {
      if (ya.has(c.ref)) continue;
      const g = pendienteDe(c.sucursal_id, c.nombre);
      g.monto = round2(g.monto + c.monto);
      g.abonos.push(c);
      porTienda.set(c.sucursal_id, g);
    }
  }
  const grupos = [...porTienda.values()];
  const partes = grupos.filter((p) => p.monto > 0);
  const abonado = round2(partes.reduce((s, p) => s + p.monto, 0));
  return {
    pendiente,
    abonado,
    partes,
    pendientePorSucursal: grupos.filter((p) => p.pendiente > 0),
    totalAntes: round2(pendiente + abonado),
  };
}

async function paginar(supabase, tabla, select, afinar) {
  const out = [];
  const tam = 500;
  for (let desde = 0; desde < 20000; desde += tam) {
    let q = supabase.from(tabla).select(select).range(desde, desde + tam - 1);
    if (afinar) q = afinar(q);
    const { data, error } = await q;
    if (error) return { data: out, error: error.message || 'No se pudo leer.' };
    out.push(...(data || []));
    if (!data || data.length < tam) break;
  }
  return { data: out };
}

export async function listarLiquidacionCuetes(supabase, liquidaciones = []) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', resumen: armarLiquidacionCuetes([], [], [], []) };
  const prods = await paginar(supabase, 'productos', 'id, cat', (q) => q.ilike('cat', 'cuetes'));
  if (prods.error) return { ok: false, error: prods.error, resumen: armarLiquidacionCuetes([], [], [], []) };
  const ids = new Set((prods.data || []).map((p) => String(p.id)));
  const ventas = await paginar(
    supabase,
    'ruta_ventas',
    'id,folio,cliente_id,cliente_tipo,cliente_nombre,metodo_pago,total,estado,estado_credito,created_at,articulos,vendedor_nombre',
    (q) => q.order('created_at', { ascending: false }),
  );
  if (ventas.error) return { ok: false, error: ventas.error, resumen: armarLiquidacionCuetes([], ids, [], liquidaciones) };
  const abonos = await paginar(
    supabase,
    'ruta_cxc_movimientos',
    'id,venta_id,folio_venta,cliente_id,monto,created_at,tipo',
    (q) => q.eq('tipo', 'abono'),
  );
  if (abonos.error) return { ok: false, error: abonos.error, resumen: armarLiquidacionCuetes(ventas.data, ids, [], liquidaciones) };
  return {
    ok: true,
    resumen: armarLiquidacionCuetes(ventas.data, ids, abonos.data, liquidaciones),
    tiendas: agruparCreditoPorTienda(ventas.data, ids, abonos.data),
  };
}

export async function guardarLiquidacionCuetes(supabase, resumen, user) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!(Number(resumen?.abonado) > 0)) return { ok: false, error: 'No hay abonos de cuetes para liquidar.' };
  const { data, error } = await supabase.from(TABLA_LIQUIDACIONES).insert({
    monto: round2(resumen.abonado),
    pendiente: round2(resumen.pendiente),
    total_antes: round2(resumen.totalAntes),
    detalle: resumen.partes || [],
    estado: 'cerrada',
    created_by: user?.nombre || null,
  }).select('*').single();
  if (error) return { ok: false, error: error.message || 'No se pudo guardar la liquidación.' };
  return { ok: true, data };
}
