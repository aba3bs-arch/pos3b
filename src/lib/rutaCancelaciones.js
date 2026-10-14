/**
 * Cancelación / devolución de ventas en Ruta.
 * Solicitud → notificación admin + PIN → revierte camión, CxC, tránsito RC/VentaRuta, compra.
 */

import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { verificarPinAdministradorGlobal } from './autorizacionTurnoFueraHorario.js';
import {
  crearNotificacion,
  marcarNotificacionAtendida,
  TIPOS_NOTIF,
} from './contabilidadNotificaciones.js';
import { eliminarMovimientoTransito } from './controlEfectivo.js';
import { aplicarMovimientoInventario } from './inventarioMovimientos.js';
import { lineasDeCarga } from './ventaEnRuta.js';

export const AVISO_FALTA_CANCELACIONES =
  'Falta la tabla de cancelaciones de ruta. En Supabase ejecuta supabase/fix_ruta_cancelaciones.sql';

function faltaTabla(error) {
  const m = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || error?.code === 'PGRST205'
    || m.includes('does not exist')
    || m.includes('schema cache')
    || m.includes('ruta_cancelaciones')
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function artsDeVenta(venta) {
  return (venta?.articulos || []).filter((a) => a && !a._pago_mixto);
}

function montosDeVenta(venta) {
  const total = round2(venta?.total);
  const mp = String(venta?.metodo_pago || '').toLowerCase();
  const mixto = (venta?.articulos || []).find((a) => a && a._pago_mixto);
  if (mp === 'mixto' && mixto) {
    return {
      efectivo: round2(mixto.efectivo),
      credito: round2(mixto.credito),
    };
  }
  if (mp === 'credito') return { efectivo: 0, credito: total };
  return { efectivo: total, credito: 0 };
}

/** Plan para devolver qty_vendida al camión (por producto, líneas con vendido). */
async function planRevertirCamion(supabase, venta) {
  const arts = artsDeVenta(venta);
  if (!arts.length) return { ok: true, plan: [], avisos: [] };
  const cargaId = String(venta.carga_id || '').trim();
  if (!cargaId) {
    return {
      ok: true,
      plan: [],
      avisos: ['La venta no tiene carga asociada; no se pudo devolver al camión.'],
    };
  }

  const linRes = await lineasDeCarga(supabase, cargaId);
  if (linRes.error) return { ok: false, error: linRes.error };
  const lineas = linRes.data || [];
  const byProd = new Map();
  for (const l of lineas) {
    const pid = String(l.producto_id || '');
    if (!pid) continue;
    if (!byProd.has(pid)) byProd.set(pid, []);
    byProd.get(pid).push(l);
  }

  const plan = [];
  const avisos = [];
  for (const a of arts) {
    const pid = String(a.producto_id || a.productoId || '');
    let restante = round3(a.cantidad ?? a.qty ?? 0);
    if (!pid || !(restante > 0)) continue;
    const cands = (byProd.get(pid) || [])
      .filter((l) => (Number(l.qty_vendida) || 0) > 0)
      .sort((x, y) => (Number(y.qty_vendida) || 0) - (Number(x.qty_vendida) || 0));
    for (const lin of cands) {
      if (restante <= 0) break;
      const vendida = Number(lin.qty_vendida) || 0;
      const take = round3(Math.min(restante, vendida));
      if (!(take > 0)) continue;
      plan.push({
        lineaId: lin.id,
        productoId: pid,
        nombre: a.nombre || lin.nombre || pid,
        qtyRestar: take,
        qtyAntes: vendida,
      });
      lin.qty_vendida = round3(vendida - take);
      restante = round3(restante - take);
    }
    if (restante > 0.001) {
      avisos.push(
        `${a.nombre || pid}: faltan ${restante} en qty_vendida del camión (se devuelve lo posible).`,
      );
    }
  }
  return { ok: true, plan, avisos };
}

async function aplicarRevertirCamion(supabase, plan) {
  const hechos = [];
  for (const p of plan || []) {
    const qtyRestar = round3(p.qtyRestar);
    if (!(qtyRestar > 0) || !p.lineaId) continue;

    // 1) Intento con candado optimista
    let nueva = round3(Math.max(0, (Number(p.qtyAntes) || 0) - qtyRestar));
    let { data, error } = await supabase
      .from('ruta_carga_lineas')
      .update({ qty_vendida: nueva })
      .eq('id', p.lineaId)
      .eq('qty_vendida', p.qtyAntes)
      .select('id, qty_vendida');
    if (error) {
      return { ok: false, error: `Camión ${p.nombre || p.lineaId}: ${error.message}`, hechos };
    }

    // 2) Si el candado no pegó (qty cambió), relee y fuerza resta
    if (!data?.length) {
      const { data: lin, error: eR } = await supabase
        .from('ruta_carga_lineas')
        .select('id, qty_vendida')
        .eq('id', p.lineaId)
        .maybeSingle();
      if (eR) return { ok: false, error: `Camión ${p.nombre || p.lineaId}: ${eR.message}`, hechos };
      const actual = Number(lin?.qty_vendida) || 0;
      nueva = round3(Math.max(0, actual - qtyRestar));
      ({ data, error } = await supabase
        .from('ruta_carga_lineas')
        .update({ qty_vendida: nueva })
        .eq('id', p.lineaId)
        .select('id, qty_vendida'));
      if (error) {
        return { ok: false, error: `Camión ${p.nombre || p.lineaId}: ${error.message}`, hechos };
      }
      if (!data?.length) {
        return {
          ok: false,
          error: `Camión ${p.nombre || p.lineaId}: no se actualizó qty_vendida.`,
          hechos,
        };
      }
    }
    hechos.push({ ...p, qtyDespues: Number(data[0]?.qty_vendida ?? nueva) });
  }
  return { ok: true, hechos };
}

/**
 * Borra cargos/abonos de CxC de la venta (crédito o parte crédito del mixto).
 * Busca por venta_id y por folio VR.
 */
async function eliminarCreditosDeVenta(supabase, { ventaId = null, folioVenta = null } = {}) {
  if (!ventaId && !folioVenta) return { ok: true, eliminados: 0, ids: [] };

  const byId = new Map();
  if (ventaId) {
    const { data, error } = await supabase
      .from('ruta_cxc_movimientos')
      .select('id, tipo, estatus, monto, pagado_at, transito_id, folio_venta, venta_id')
      .eq('venta_id', ventaId);
    if (error) {
      if (faltaTabla(error) || /ruta_cxc/i.test(String(error.message || ''))) {
        return { ok: true, eliminados: 0, ids: [], aviso: error.message };
      }
      return { ok: false, error: error.message };
    }
    for (const m of data || []) byId.set(String(m.id), m);
  }

  const folio = String(folioVenta || '').trim();
  if (folio) {
    const { data, error } = await supabase
      .from('ruta_cxc_movimientos')
      .select('id, tipo, estatus, monto, pagado_at, transito_id, folio_venta, venta_id')
      .eq('folio_venta', folio);
    if (error && !/folio_venta|column|schema cache/i.test(String(error.message || ''))) {
      if (faltaTabla(error) || /ruta_cxc/i.test(String(error.message || ''))) {
        return { ok: true, eliminados: byId.size, ids: [...byId.keys()], aviso: error.message };
      }
      return { ok: false, error: error.message };
    }
    for (const m of data || []) byId.set(String(m.id), m);
  }

  const movimientos = [...byId.values()];
  if (!movimientos.length) return { ok: true, eliminados: 0, ids: [] };

  // Si hubo cobro de crédito, quitar también su tránsito En Tránsito
  for (const m of movimientos) {
    if (m.transito_id) {
      await revertirTransito(supabase, { transitoId: m.transito_id, folioVenta: folio || null });
    }
  }

  const ids = movimientos.map((m) => String(m.id));
  const { error: eDel } = await supabase.from('ruta_cxc_movimientos').delete().in('id', ids);
  if (eDel) return { ok: false, error: eDel.message };

  // Confirma
  const { data: still } = await supabase
    .from('ruta_cxc_movimientos')
    .select('id')
    .in('id', ids);
  if ((still || []).length) {
    return {
      ok: false,
      error: `No se pudieron borrar ${(still || []).length} movimiento(s) de crédito.`,
    };
  }
  return { ok: true, eliminados: ids.length, ids };
}

/**
 * Localiza movimientos En Tránsito de «Venta Ruta» por id y/o folio VR.
 * Si la venta no guardó transito_id, aún así se limpia RC/VentaRuta Pendientes.
 */
async function localizarTransitosVentaRuta(supabase, { transitoId = null, folioVenta = null } = {}) {
  const found = new Map();
  const tid = transitoId != null ? String(transitoId).trim() : '';
  if (tid) {
    const { data: tr, error } = await supabase
      .from('transito_efectivo')
      .select('id, estatus, monto, tipo_movimiento, num_traspaso')
      .eq('id', tid)
      .maybeSingle();
    if (error) return { ok: false, error: error.message, rows: [] };
    if (tr) found.set(String(tr.id), tr);
  }

  const folio = String(folioVenta || '').trim();
  if (folio) {
    const { data, error } = await supabase
      .from('transito_efectivo')
      .select('id, estatus, monto, tipo_movimiento, num_traspaso')
      .eq('num_traspaso', folio)
      .order('fecha_hora', { ascending: false })
      .limit(10);
    if (error) return { ok: false, error: error.message, rows: [...found.values()] };
    for (const row of data || []) {
      const tipo = String(row.tipo_movimiento || '');
      // Prioriza Venta Ruta; también limpia filas sin tipo si el folio es VR-
      if (tipo === 'Venta Ruta' || (!tipo && /^VR-/i.test(folio))) {
        found.set(String(row.id), row);
      }
    }
  }

  return { ok: true, rows: [...found.values()] };
}

async function revertirTransito(supabase, { transitoId = null, folioVenta = null } = {}) {
  const loc = await localizarTransitosVentaRuta(supabase, { transitoId, folioVenta });
  if (!loc.ok) return loc;
  const rows = loc.rows || [];
  if (!rows.length) {
    return { ok: true, omitido: true, aviso: 'Sin tránsito RC/VentaRuta para este folio.' };
  }

  const bloqueados = rows.filter((tr) => {
    const est = String(tr.estatus || '');
    return est === 'Liquidado' || est === 'Entregado';
  });
  if (bloqueados.length) {
    const est = String(bloqueados[0].estatus || '');
    return {
      ok: false,
      error: `El efectivo ya está ${est} en RC/VentaRuta. No se puede borrar automáticamente.`,
    };
  }

  const eliminados = [];
  for (const tr of rows) {
    const est = String(tr.estatus || '');
    // Solo borra pendientes de liquidar (no otros estatus raros)
    if (est && est !== 'En Tránsito' && est !== 'Por Aceptar') {
      continue;
    }
    const del = await eliminarMovimientoTransito(supabase, tr.id);
    if (!del.ok) return del;
    // Confirma que ya no existe (delete sin match devolvía ok antes)
    const { data: still } = await supabase
      .from('transito_efectivo')
      .select('id')
      .eq('id', tr.id)
      .maybeSingle();
    if (still) {
      return {
        ok: false,
        error: `No se pudo eliminar el tránsito ${tr.num_traspaso || tr.id} de RC/VentaRuta.`,
      };
    }
    eliminados.push({ id: tr.id, monto: tr.monto, folio: tr.num_traspaso });
  }

  if (!eliminados.length) {
    return { ok: true, omitido: true, aviso: 'Tránsito no estaba En Tránsito.' };
  }
  return {
    ok: true,
    eliminado: true,
    id: eliminados[0].id,
    monto: eliminados.reduce((a, x) => a + (Number(x.monto) || 0), 0),
    eliminados,
  };
}

/**
 * Repara cancelaciones ya aprobadas que no revirtieron del todo:
 * inventario (si la venta aún existe), crédito, RC/VentaRuta, compra y borra la venta.
 */
export async function repararTransitosCancelacionesAprobadas(supabase, { limit = 80 } = {}) {
  if (!supabase) return { ok: true, limpiados: 0, reparadas: 0 };

  let limpiados = 0;
  let reparadas = 0;
  const folios = [];

  const { data, error, aviso } = await listarCancelacionesRuta(supabase, {
    estado: 'aprobado',
    limit,
  });
  if (error) return { ok: false, error, limpiados: 0, reparadas: 0 };

  for (const sol of data || []) {
    const folio = sol.folio_venta || null;
    let venta = null;
    if (sol.venta_id) {
      const { data: v } = await supabase
        .from('ruta_ventas')
        .select('*')
        .eq('id', sol.venta_id)
        .maybeSingle();
      venta = v || null;
    }
    if (!venta && folio) {
      const { data: v2 } = await supabase
        .from('ruta_ventas')
        .select('*')
        .eq('folio', folio)
        .limit(1)
        .maybeSingle();
      venta = v2 || null;
    }

    if (venta) {
      const exec = await ejecutarCancelacionVentaRuta(supabase, {
        venta: {
          ...venta,
          folio: venta.folio || folio,
          articulos: venta.articulos?.length ? venta.articulos : (sol.articulos || []),
          carga_id: venta.carga_id || sol.carga_id,
          compra_id: venta.compra_id || sol.compra_id,
          transito_id: venta.transito_id || sol.transito_id,
          cliente_tipo: venta.cliente_tipo || sol.cliente_tipo,
          cliente_id: venta.cliente_id || sol.cliente_id,
        },
        adminNombre: sol.admin_nombre || 'reparacion',
        transitoIdFallback: sol.transito_id || null,
      });
      if (exec.ok) {
        reparadas += 1;
        if (folio) folios.push(folio);
        if (exec.transito?.eliminado) limpiados += 1;
      }
      continue;
    }

    // Venta ya no existe: limpia residuales por folio/ids de la solicitud
    const cxc = await eliminarCreditosDeVenta(supabase, {
      ventaId: sol.venta_id,
      folioVenta: folio,
    });
    const tr = await revertirTransito(supabase, {
      transitoId: sol.transito_id,
      folioVenta: folio,
    });
    if (sol.compra_id) {
      await cancelarCompraPedido(supabase, sol.compra_id, { yaDescontoTienda: true });
    }
    if ((cxc.ok && cxc.eliminados) || (tr.ok && tr.eliminado)) {
      reparadas += 1;
      if (tr.eliminado) limpiados += (tr.eliminados || [tr]).length;
      if (folio) folios.push(folio);
    }
  }

  return { ok: true, limpiados, reparadas, folios, aviso };
}

function compraYaRecibida(compra) {
  const est = String(compra?.estado || '').toLowerCase();
  return est === 'recibida' || est === 'recibido' || est === 'cerrada';
}

/** Líneas a descontar del piso de la tienda (qty recibida o qty de la venta). */
function lineasDescontarTienda(compra, venta) {
  const itemsRec = Array.isArray(compra?.items) ? compra.items : [];
  if (itemsRec.length) {
    return itemsRec
      .map((l) => ({
        id: String(l.id || l.producto_id || ''),
        nombre: l.nombre || l.id,
        qty: Math.floor(Number(l.qty ?? l.cantidad ?? l.qty_recibido) || 0),
        costo: Number(l.costo ?? l.costo_est) || 0,
      }))
      .filter((l) => l.id && l.qty > 0);
  }
  return artsDeVenta(venta)
    .map((a) => ({
      id: String(a.producto_id || a.productoId || ''),
      nombre: a.nombre || a.producto_id,
      qty: Math.floor(Number(a.cantidad ?? a.qty) || 0),
      costo: Number(a.precio) || 0,
    }))
    .filter((l) => l.id && l.qty > 0);
}

/**
 * Si la compra ya se recibió en la tienda, descuenta el inventario de piso
 * (Petroleos, etc.) para que la devolución quite lo que entró por Compras.
 */
async function descontarInventarioTienda(supabase, {
  venta,
  compra = null,
  adminNombre = null,
} = {}) {
  const tipoCli = String(venta?.cliente_tipo || '') === 'externo' ? 'externo' : 'sucursal';
  if (tipoCli !== 'sucursal') return { ok: true, omitido: 'cliente_externo', aplicados: 0 };

  const suc = normalizarCodigoTienda(venta.cliente_id || compra?.sucursal_id);
  if (!suc || suc === 'MAIN' || suc === 'CEDIS') {
    return { ok: true, omitido: 'sin_sucursal', aplicados: 0 };
  }

  // Solo descuenta piso si la mercancía ya entró (compra recibida) o si no hay compra
  // pero el cliente es sucursal y pedimos forzar (no debería).
  if (compra && !compraYaRecibida(compra)) {
    return { ok: true, omitido: 'compra_no_recibida', aplicados: 0 };
  }
  if (!compra) {
    return { ok: true, omitido: 'sin_compra', aplicados: 0 };
  }

  const lineas = lineasDescontarTienda(compra, venta);
  if (!lineas.length) return { ok: true, omitido: 'sin_lineas', aplicados: 0 };

  const folioVenta = venta.folio || String(venta.id || '').slice(0, 8);
  const motivo = `Devolución venta en ruta ${folioVenta} · cancela recepción en ${suc}`;
  const errores = [];
  const hechos = [];
  let aplicados = 0;

  for (const l of lineas) {
    const r = await aplicarMovimientoInventario(supabase, {
      tipo: 'retiro',
      modo: 'devolucion_ruta',
      productoOrigen: { id: l.id, nombre: l.nombre },
      cantidad: l.qty,
      motivo,
      usuario: adminNombre || 'Admin ruta',
      sucursal: suc,
      sucursalOperacion: suc,
      meta: {
        devolucion_ruta: true,
        venta_id: venta.id,
        folio_venta: folioVenta,
        compra_id: compra.id,
        precio: l.costo || null,
        subtotal: l.costo ? round2(l.costo * l.qty) : null,
      },
    });
    if (!r.ok) {
      errores.push(`${l.nombre || l.id}: ${r.error}`);
      continue;
    }
    aplicados += 1;
    hechos.push({ productoId: l.id, nombre: l.nombre, qty: l.qty });
  }

  if (!aplicados) {
    return {
      ok: false,
      error: `No se pudo descontar inventario en ${etiquetaTienda(suc) || suc}: ${errores.join('; ') || 'sin líneas'}`,
      errores,
    };
  }
  return {
    ok: true,
    aplicados,
    hechos,
    sucursalId: suc,
    parcial: errores.length > 0,
    errores: errores.length ? errores : undefined,
  };
}

async function anularGastoCompraCorte(supabase, compra, venta) {
  if (!supabase || !compra?.id) return { ok: true, omitido: true };
  const suc = normalizarCodigoTienda(compra.sucursal_id || venta?.cliente_id);
  const folioInv = (String(compra.notas || '').match(/Folio inv\s+([A-Z0-9-]+)/i) || [])[1];
  const folioVenta = venta?.folio || folioVentaRutaDesdeNotasSafe(compra.notas);
  // Busca gastos ligados a esta recepción / folio VR
  let q = supabase
    .from('cortes_contabilidad_gastos')
    .select('id, comentario, monto, deleted_at')
    .eq('modulo', 'abarrotes')
    .order('created_at', { ascending: false })
    .limit(40);
  if (suc) q = q.eq('sucursal_id', suc);
  const { data, error } = await q;
  if (error) return { ok: true, omitido: true, aviso: error.message };
  const hits = (data || []).filter((g) => {
    if (g.deleted_at) return false;
    const c = String(g.comentario || '');
    if (folioInv && c.includes(folioInv)) return true;
    if (folioVenta && c.toUpperCase().includes(String(folioVenta).toUpperCase())) return true;
    if (c.includes(String(compra.id))) return true;
    return false;
  });
  if (!hits.length) return { ok: true, omitido: true };
  let anulados = 0;
  for (const g of hits) {
    let { error: eUp } = await supabase
      .from('cortes_contabilidad_gastos')
      .update({
        deleted_at: new Date().toISOString(),
        comentario: `${g.comentario || ''} · ANULADO por devolución ruta`.trim(),
      })
      .eq('id', g.id);
    if (eUp && /deleted_at|column|schema cache/i.test(String(eUp.message || ''))) {
      ({ error: eUp } = await supabase.from('cortes_contabilidad_gastos').delete().eq('id', g.id));
    }
    if (!eUp) anulados += 1;
  }
  return { ok: true, anulados, ids: hits.map((h) => h.id) };
}

function folioVentaRutaDesdeNotasSafe(notas) {
  const m = String(notas || '').match(/\b(VR-[A-Z0-9-]+)\b/i);
  return m ? String(m[1]).toUpperCase() : null;
}

async function cancelarCompraPedido(supabase, compraId, { yaDescontoTienda = false } = {}) {
  if (!compraId) return { ok: true, omitido: true };
  const { data: c, error } = await supabase
    .from('compras')
    .select('id, estado, notas, sucursal_id, items, items_pedido')
    .eq('id', compraId)
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: true, omitido: true, aviso: 'Sin tabla compras.' };
    return { ok: false, error: error.message };
  }
  if (!c) return { ok: true, omitido: true };
  const recibida = compraYaRecibida(c);
  if (recibida && !yaDescontoTienda) {
    return {
      ok: false,
      error: 'La compra ya fue recibida y no se descontó el inventario de tienda.',
      recibida: true,
      compra: c,
    };
  }

  // Preferir borrar el registro (desaparece de Compras / Por recibir).
  const { error: eDel } = await supabase.from('compras').delete().eq('id', c.id);
  if (!eDel) return { ok: true, eliminada: true, id: c.id, recibida, compra: c };

  // Fallback: marcar cancelada si hay FK que impide borrar
  const { error: eUp } = await supabase
    .from('compras')
    .update({
      estado: 'cancelada',
      notas: `${c.notas || ''} · Cancelada por devolución venta en ruta`.trim(),
    })
    .eq('id', c.id);
  if (eUp) return { ok: false, error: eDel.message || eUp.message, compra: c };
  return { ok: true, cancelada: true, id: c.id, recibida, compra: c, aviso: eDel.message };
}

async function cancelarTraspasoVenta(supabase, venta, adminNombre) {
  const tid = venta?.traspaso_id;
  if (!tid) return { ok: true, omitido: true };
  try {
    const { cancelarTraspasoAdmin, eliminarTraspasoAdmin } = await import('./traspasosInventario.js');
    const elim = await eliminarTraspasoAdmin(supabase, {
      traspasoId: tid,
      usuario: adminNombre || 'Admin ruta',
    });
    if (elim?.ok) return { ok: true, eliminado: true, id: tid };
    const can = await cancelarTraspasoAdmin(supabase, {
      traspasoId: tid,
      usuario: adminNombre || 'Admin ruta',
    });
    if (can?.ok) return { ok: true, cancelado: true, id: tid };
    return { ok: true, omitido: true, aviso: elim?.error || can?.error };
  } catch (e) {
    return { ok: true, omitido: true, aviso: e?.message || String(e) };
  }
}

/** Elimina el registro de venta (no solo lo marca). El historial queda en ruta_cancelaciones. */
async function eliminarRegistroVenta(supabase, venta) {
  if (!venta?.id) return { ok: false, error: 'Venta inválida.' };
  const { error } = await supabase.from('ruta_ventas').delete().eq('id', venta.id);
  if (error) return { ok: false, error: error.message };
  const { data: still } = await supabase
    .from('ruta_ventas')
    .select('id')
    .eq('id', venta.id)
    .maybeSingle();
  if (still) return { ok: false, error: 'No se pudo eliminar el registro de la venta.' };
  return { ok: true, eliminada: true, id: venta.id, folio: venta.folio };
}

/**
 * Ejecuta la reversión completa de una venta (tras PIN admin).
 * Orden: 1) inventario camión 2) inventario tienda 3) crédito/efectivo/compra/traspaso 4) borrar venta.
 */
export async function ejecutarCancelacionVentaRuta(supabase, {
  venta,
  adminNombre = null,
  transitoIdFallback = null,
  soloLimpiarTransito = false,
} = {}) {
  if (!supabase || !venta?.id) return { ok: false, error: 'Venta inválida.' };
  const folio = venta.folio || null;
  const tid = venta.transito_id || transitoIdFallback || null;
  const artsFlag = (venta.articulos || []).some((a) => a && a._cancelada);
  const yaCancelada = String(venta.estado || '').toLowerCase() === 'cancelada' || artsFlag;

  if (soloLimpiarTransito) {
    const trOrphan = await revertirTransito(supabase, { transitoId: tid, folioVenta: folio });
    if (!trOrphan.ok) return trOrphan;
    return { ok: true, soloTransito: true, transito: trOrphan, ventaId: venta.id, folio };
  }

  // Carga compra (si existe) para saber si hay que descontar piso de tienda.
  let compraRow = null;
  if (venta.compra_id) {
    const { data: c } = await supabase
      .from('compras')
      .select('id, estado, notas, sucursal_id, items, items_pedido')
      .eq('id', venta.compra_id)
      .maybeSingle();
    compraRow = c || null;
  }

  // 1) PRIMERO: devolver inventario al camión (baja qty_vendida → vuelve disponible).
  const planCamion = await planRevertirCamion(supabase, venta);
  if (!planCamion.ok) return planCamion;
  const cam = await aplicarRevertirCamion(supabase, planCamion.plan);
  if (!cam.ok) return cam;

  // 2) Si ya se recibió en Petroleos/tienda → descontar inventario de piso.
  const invTienda = await descontarInventarioTienda(supabase, {
    venta,
    compra: compraRow,
    adminNombre,
  });
  if (!invTienda.ok) return invTienda;

  // 3) Anular gasto de corte ligado a esa recepción (si hubo).
  const gasto = compraRow && compraYaRecibida(compraRow)
    ? await anularGastoCompraCorte(supabase, compraRow, venta)
    : { ok: true, omitido: true };

  // 4) Eliminar crédito (crédito o parte crédito del mixto) en CxC.
  const cxc = await eliminarCreditosDeVenta(supabase, {
    ventaId: venta.id,
    folioVenta: folio,
  });
  if (!cxc.ok) return cxc;

  // 5) Quitar efectivo de RC/VentaRuta Pendientes (efectivo o parte efectivo del mixto).
  const tr = await revertirTransito(supabase, { transitoId: tid, folioVenta: folio });
  if (!tr.ok) return tr;

  // 6) Eliminar compra / pedido en Compras.
  const compra = await cancelarCompraPedido(supabase, venta.compra_id, {
    yaDescontoTienda: !compraYaRecibida(compraRow) || (Number(invTienda.aplicados) || 0) > 0,
  });
  if (!compra.ok) return compra;

  // 7) Traspaso ligado (si existe).
  const traspaso = await cancelarTraspasoVenta(supabase, venta, adminNombre);

  // 8) Eliminar registro de la venta en todos lados.
  const mv = await eliminarRegistroVenta(supabase, venta);
  if (!mv.ok) {
    // Si ya no existe (reintento), ok; si falló por otra razón, error.
    if (!yaCancelada) return mv;
  }

  return {
    ok: true,
    camion: cam.hechos,
    camionAvisos: planCamion.avisos,
    inventarioTienda: invTienda,
    gastoCorte: gasto,
    transito: tr,
    creditos: cxc,
    compra,
    traspaso,
    venta: mv.ok ? mv : { ok: true, yaEliminada: true, id: venta.id },
    ventaId: venta.id,
    folio: venta.folio,
    yaCancelada,
  };
}

export async function solicitarCancelacionVentaRuta(supabase, {
  ventaId,
  motivo = '',
  solicitadoPor = null,
  solicitadoPorId = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!ventaId) return { ok: false, error: 'Selecciona una venta.' };

  const { data: venta, error: eV } = await supabase
    .from('ruta_ventas')
    .select('*')
    .eq('id', ventaId)
    .maybeSingle();
  if (eV) return { ok: false, error: eV.message };
  if (!venta) return { ok: false, error: 'Venta no encontrada.' };
  if (String(venta.estado || '').toLowerCase() === 'cancelada') {
    return { ok: false, error: 'Esa venta ya está cancelada.' };
  }

  const { data: prev } = await supabase
    .from('ruta_cancelaciones')
    .select('id, estado')
    .eq('venta_id', ventaId)
    .eq('estado', 'pendiente')
    .limit(1);
  if ((prev || []).length) {
    return { ok: false, error: 'Ya hay una cancelación pendiente para este folio.' };
  }

  // Validación previa (sin aplicar) para fallar temprano
  const plan = await planRevertirCamion(supabase, venta);
  if (!plan.ok) return plan;

  // Precheck tránsito (por id o folio VR) sin borrar
  const locTr = await localizarTransitosVentaRuta(supabase, {
    transitoId: venta.transito_id,
    folioVenta: venta.folio,
  });
  if (!locTr.ok) return locTr;
  const trBloqueado = (locTr.rows || []).find((tr) => {
    const est = String(tr.estatus || '');
    return est === 'Liquidado' || est === 'Entregado';
  });
  if (trBloqueado) {
    return {
      ok: false,
      error: `El efectivo ya está ${trBloqueado.estatus} en RC/VentaRuta. No se puede solicitar cancelación.`,
    };
  }
  const transitoIdResuelto = venta.transito_id
    || (locTr.rows || []).find((r) => String(r.estatus || '') === 'En Tránsito')?.id
    || (locTr.rows || [])[0]?.id
    || null;

  // Compra recibida / crédito cobrado: se permite; al aprobar se elimina en todos lados.

  const montos = montosDeVenta(venta);
  const suc =
    normalizarCodigoTienda(venta.cliente_tipo === 'sucursal' ? venta.cliente_id : 'MAIN')
    || 'MAIN';

  const row = {
    estado: 'pendiente',
    venta_id: venta.id,
    folio_venta: venta.folio || String(venta.id).slice(0, 8),
    carga_id: venta.carga_id ? String(venta.carga_id) : null,
    cliente_tipo: venta.cliente_tipo || null,
    cliente_id: venta.cliente_id ? String(venta.cliente_id) : null,
    cliente_nombre: venta.cliente_nombre || null,
    metodo_pago: venta.metodo_pago || null,
    total: round2(venta.total),
    monto_efectivo: montos.efectivo,
    monto_credito: montos.credito,
    articulos: venta.articulos || [],
    transito_id: transitoIdResuelto ? String(transitoIdResuelto) : null,
    compra_id: venta.compra_id ? String(venta.compra_id) : null,
    vendedor_nombre: venta.vendedor_nombre || null,
    sucursal_id: suc,
    motivo: String(motivo || '').trim() || null,
    solicitado_por: solicitadoPor || null,
    solicitado_por_id: solicitadoPorId != null ? String(solicitadoPorId) : null,
    meta: { plan_camion: plan.plan },
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ruta_cancelaciones')
    .insert([row])
    .select('*')
    .single();
  if (error && faltaTabla(error)) {
    return { ok: false, error: AVISO_FALTA_CANCELACIONES, aviso: AVISO_FALTA_CANCELACIONES };
  }
  if (error) return { ok: false, error: error.message };

  const notif = await crearNotificacion(supabase, {
    sucursal_id: 'MAIN',
    tipo: TIPOS_NOTIF.RUTA_CANCELACION_PIN,
    ref_tabla: 'ruta_cancelaciones',
    ref_id: data.id,
    titulo: `Cancelar venta ${row.folio_venta} · $${Number(row.total).toFixed(2)}`,
    mensaje:
      `${solicitadoPor || 'Usuario'} solicita cancelar/devolver ${row.folio_venta} `
      + `(${row.metodo_pago || '—'} · ${row.cliente_nombre || row.cliente_id || 'cliente'}`
      + `${suc !== 'MAIN' ? ` · ${etiquetaTienda(suc)}` : ''}).\n`
      + (row.motivo ? `Motivo: ${row.motivo}\n` : '')
      + 'Aprueba con PIN: devuelve inventario, elimina venta, crédito/efectivo (o ambos si es mixto), '
      + 'RC/VentaRuta y compra.',
  });

  return {
    ok: true,
    data,
    notificacionId: notif?.id || null,
    aviso: notif?.aviso || null,
  };
}

export async function listarCancelacionesRuta(supabase, { estado = null, limit = 100 } = {}) {
  if (!supabase) return { data: [] };
  let q = supabase
    .from('ruta_cancelaciones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (estado) q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_CANCELACIONES };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function listarCancelacionesPendientes(supabase, { limit = 40 } = {}) {
  return listarCancelacionesRuta(supabase, { estado: 'pendiente', limit });
}

export async function obtenerCancelacionRuta(supabase, id) {
  if (!supabase || !id) return { data: null };
  const { data, error } = await supabase
    .from('ruta_cancelaciones')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error && faltaTabla(error)) return { data: null, aviso: AVISO_FALTA_CANCELACIONES };
  if (error) return { data: null, error: error.message };
  return { data };
}

export async function aprobarCancelacionVentaConPin(supabase, {
  cancelacionId,
  pin,
  adminUser = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!cancelacionId) return { ok: false, error: 'Solicitud inválida.' };

  let auth;
  if (adminUser?.id || adminUser?.nombre) {
    auth = { ok: true, user: adminUser, nombre: adminUser.nombre };
  } else {
    auth = await verificarPinAdministradorGlobal(supabase, pin);
    if (!auth.ok) return auth;
  }

  const { data: sol, error: eSol } = await supabase
    .from('ruta_cancelaciones')
    .select('*')
    .eq('id', cancelacionId)
    .maybeSingle();
  if (eSol && faltaTabla(eSol)) {
    return { ok: false, error: AVISO_FALTA_CANCELACIONES, aviso: AVISO_FALTA_CANCELACIONES };
  }
  if (eSol) return { ok: false, error: eSol.message };
  if (!sol) return { ok: false, error: 'Solicitud no encontrada.' };
  if (sol.estado !== 'pendiente') return { ok: false, error: `La solicitud ya está ${sol.estado}.` };

  const { data: ventaDb, error: eV } = await supabase
    .from('ruta_ventas')
    .select('*')
    .eq('id', sol.venta_id)
    .maybeSingle();
  if (eV) return { ok: false, error: eV.message };

  // Snapshot de la solicitud por si la venta ya no está o faltan campos.
  const venta = ventaDb || {
    id: sol.venta_id,
    folio: sol.folio_venta,
    articulos: sol.articulos || [],
    carga_id: sol.carga_id,
    compra_id: sol.compra_id,
    transito_id: sol.transito_id,
    cliente_tipo: sol.cliente_tipo,
    cliente_id: sol.cliente_id,
    cliente_nombre: sol.cliente_nombre,
    metodo_pago: sol.metodo_pago,
    total: sol.total,
    vendedor_nombre: sol.vendedor_nombre,
  };

  const exec = await ejecutarCancelacionVentaRuta(supabase, {
    venta: {
      ...venta,
      folio: venta.folio || sol.folio_venta,
      articulos: (venta.articulos && venta.articulos.length) ? venta.articulos : (sol.articulos || []),
      carga_id: venta.carga_id || sol.carga_id,
      compra_id: venta.compra_id || sol.compra_id,
      transito_id: venta.transito_id || sol.transito_id,
    },
    adminNombre: auth.user?.nombre || auth.nombre,
    transitoIdFallback: sol.transito_id || null,
  });
  if (!exec.ok) return exec;

  // Doble check residuales por folio
  await eliminarCreditosDeVenta(supabase, {
    ventaId: sol.venta_id || venta.id,
    folioVenta: sol.folio_venta || venta.folio,
  });
  const trExtra = await revertirTransito(supabase, {
    transitoId: sol.transito_id || venta.transito_id,
    folioVenta: sol.folio_venta || venta.folio,
  });
  if (trExtra.ok && trExtra.eliminado) {
    exec.transitoExtra = trExtra;
  }

  const ahora = new Date().toISOString();
  const { error: eUp } = await supabase
    .from('ruta_cancelaciones')
    .update({
      estado: 'aprobado',
      admin_id: auth.user?.id != null ? String(auth.user.id) : null,
      admin_nombre: auth.user?.nombre || auth.nombre || null,
      aprobado_at: ahora,
      resultado: exec,
      updated_at: ahora,
    })
    .eq('id', sol.id);
  if (eUp) return { ok: false, error: eUp.message, parcial: exec };

  await marcarNotificacionAtendida(
    supabase,
    'ruta_cancelaciones',
    sol.id,
    auth.user?.nombre || auth.nombre || 'Admin',
  );

  return {
    ok: true,
    data: { ...sol, estado: 'aprobado' },
    resultado: exec,
    admin: auth.user?.nombre || auth.nombre,
  };
}

export async function rechazarCancelacionVentaConPin(supabase, {
  cancelacionId,
  pin,
  motivo = '',
  adminUser = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  let auth;
  if (adminUser?.id || adminUser?.nombre) {
    auth = { ok: true, user: adminUser, nombre: adminUser.nombre };
  } else {
    auth = await verificarPinAdministradorGlobal(supabase, pin);
    if (!auth.ok) return auth;
  }

  const { data: sol, error } = await supabase
    .from('ruta_cancelaciones')
    .select('*')
    .eq('id', cancelacionId)
    .maybeSingle();
  if (error && faltaTabla(error)) {
    return { ok: false, error: AVISO_FALTA_CANCELACIONES, aviso: AVISO_FALTA_CANCELACIONES };
  }
  if (error) return { ok: false, error: error.message };
  if (!sol) return { ok: false, error: 'Solicitud no encontrada.' };
  if (sol.estado !== 'pendiente') return { ok: false, error: `La solicitud ya está ${sol.estado}.` };

  const ahora = new Date().toISOString();
  const { error: eUp } = await supabase
    .from('ruta_cancelaciones')
    .update({
      estado: 'rechazado',
      admin_id: auth.user?.id != null ? String(auth.user.id) : null,
      admin_nombre: auth.user?.nombre || auth.nombre || null,
      motivo_rechazo: String(motivo || '').trim() || null,
      updated_at: ahora,
    })
    .eq('id', sol.id);
  if (eUp) return { ok: false, error: eUp.message };

  await marcarNotificacionAtendida(
    supabase,
    'ruta_cancelaciones',
    sol.id,
    auth.user?.nombre || auth.nombre || 'Admin',
  );

  return { ok: true, data: { ...sol, estado: 'rechazado' } };
}
