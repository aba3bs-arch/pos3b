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
  if (!arts.length) return { ok: true, plan: [] };
  const cargaId = String(venta.carga_id || '').trim();
  if (!cargaId) return { ok: false, error: 'La venta no tiene carga asociada.' };

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
      // Actualiza copia local para siguientes productos
      lin.qty_vendida = round3(vendida - take);
      restante = round3(restante - take);
    }
    if (restante > 0.001) {
      return {
        ok: false,
        error: `No se puede devolver ${a.nombre || pid}: faltan ${restante} en qty_vendida del camión.`,
      };
    }
  }
  return { ok: true, plan };
}

async function aplicarRevertirCamion(supabase, plan) {
  const hechos = [];
  for (const p of plan || []) {
    const nueva = round3(Math.max(0, (Number(p.qtyAntes) || 0) - (Number(p.qtyRestar) || 0)));
    const { error } = await supabase
      .from('ruta_carga_lineas')
      .update({ qty_vendida: nueva })
      .eq('id', p.lineaId)
      .eq('qty_vendida', p.qtyAntes);
    if (error) {
      return { ok: false, error: `Camión ${p.nombre || p.lineaId}: ${error.message}`, hechos };
    }
    hechos.push({ ...p, qtyDespues: nueva });
  }
  return { ok: true, hechos };
}

async function eliminarCreditosDeVenta(supabase, ventaId) {
  if (!ventaId) return { ok: true, eliminados: 0, ids: [] };
  const { data, error } = await supabase
    .from('ruta_cxc_movimientos')
    .select('id, tipo, estatus, monto, pagado_at')
    .eq('venta_id', ventaId);
  if (error) {
    if (faltaTabla(error) || /ruta_cxc/i.test(String(error.message || ''))) {
      return { ok: true, eliminados: 0, ids: [], aviso: error.message };
    }
    return { ok: false, error: error.message };
  }
  const cargos = data || [];
  const pagados = cargos.filter(
    (m) => m.tipo === 'cargo' && (m.pagado_at || String(m.estatus || '').toLowerCase() === 'pagado'),
  );
  if (pagados.length) {
    return {
      ok: false,
      error: 'Hay crédito ya cobrado en Créditos por pagar. No se puede cancelar automáticamente.',
    };
  }
  const pendientes = cargos.filter(
    (m) => m.tipo === 'cargo' && String(m.estatus || 'pendiente') === 'pendiente',
  );
  const abonos = cargos.filter((m) => m.tipo === 'abono');
  const ids = [...pendientes, ...abonos].map((m) => String(m.id));
  if (!ids.length) return { ok: true, eliminados: 0, ids: [] };
  const { error: eDel } = await supabase.from('ruta_cxc_movimientos').delete().in('id', ids);
  if (eDel) return { ok: false, error: eDel.message };
  return { ok: true, eliminados: ids.length, ids };
}

async function revertirTransito(supabase, transitoId) {
  if (!transitoId) return { ok: true, omitido: true };
  const { data: tr, error } = await supabase
    .from('transito_efectivo')
    .select('id, estatus, monto, tipo_movimiento, num_traspaso')
    .eq('id', transitoId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!tr) return { ok: true, omitido: true, aviso: 'Tránsito ya no existe.' };
  const est = String(tr.estatus || '');
  if (est === 'Liquidado' || est === 'Entregado') {
    return {
      ok: false,
      error: `El efectivo ya está ${est} en RC/VentaRuta. No se puede borrar automáticamente.`,
    };
  }
  const del = await eliminarMovimientoTransito(supabase, tr.id);
  if (!del.ok) return del;
  return { ok: true, eliminado: true, id: tr.id, monto: tr.monto };
}

async function cancelarCompraPedido(supabase, compraId) {
  if (!compraId) return { ok: true, omitido: true };
  const { data: c, error } = await supabase
    .from('compras')
    .select('id, estado, notas, sucursal_id')
    .eq('id', compraId)
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: true, omitido: true, aviso: 'Sin tabla compras.' };
    return { ok: false, error: error.message };
  }
  if (!c) return { ok: true, omitido: true };
  const est = String(c.estado || '').toLowerCase();
  if (est === 'recibida' || est === 'recibido' || est === 'cerrada') {
    return {
      ok: false,
      error: 'La compra ya fue recibida en tienda. Cancela inventario/recepción manualmente o revierte antes.',
      recibida: true,
    };
  }
  const { error: eUp } = await supabase
    .from('compras')
    .update({
      estado: 'cancelada',
      notas: `${c.notas || ''} · Cancelada por devolución venta en ruta`.trim(),
    })
    .eq('id', c.id);
  if (eUp) {
    // Si no acepta estado cancelada, borrar pedido
    const { error: eDel } = await supabase.from('compras').delete().eq('id', c.id);
    if (eDel) return { ok: false, error: eUp.message };
    return { ok: true, eliminada: true, id: c.id };
  }
  return { ok: true, cancelada: true, id: c.id };
}

async function marcarVentaCancelada(supabase, venta, adminNombre) {
  const patch = {
    estado: 'cancelada',
    estado_credito: venta.estado_credito ? 'anulado' : null,
  };
  let { error } = await supabase.from('ruta_ventas').update(patch).eq('id', venta.id);
  if (error && /estado[^_]|column|schema cache/i.test(String(error.message || ''))) {
    const slim = { estado_credito: 'anulado' };
    ({ error } = await supabase.from('ruta_ventas').update(slim).eq('id', venta.id));
  }
  if (error && /estado_credito|column|schema cache/i.test(String(error.message || ''))) {
    // Último recurso: dejar nota en articulos
    const arts = [...(venta.articulos || []), {
      _cancelada: true,
      cancelada_por: adminNombre || 'admin',
      cancelada_at: new Date().toISOString(),
    }];
    ({ error } = await supabase.from('ruta_ventas').update({ articulos: arts }).eq('id', venta.id));
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Ejecuta la reversión completa de una venta (tras PIN admin).
 */
export async function ejecutarCancelacionVentaRuta(supabase, {
  venta,
  adminNombre = null,
} = {}) {
  if (!supabase || !venta?.id) return { ok: false, error: 'Venta inválida.' };
  if (String(venta.estado || '').toLowerCase() === 'cancelada') {
    return { ok: false, error: 'La venta ya está cancelada.' };
  }

  const planCamion = await planRevertirCamion(supabase, venta);
  if (!planCamion.ok) return planCamion;

  const tr = await revertirTransito(supabase, venta.transito_id);
  if (!tr.ok) return tr;

  const cxc = await eliminarCreditosDeVenta(supabase, venta.id);
  if (!cxc.ok) return cxc;

  const compra = await cancelarCompraPedido(supabase, venta.compra_id);
  if (!compra.ok) return compra;

  const cam = await aplicarRevertirCamion(supabase, planCamion.plan);
  if (!cam.ok) return cam;

  const mv = await marcarVentaCancelada(supabase, venta, adminNombre);
  if (!mv.ok) return mv;

  return {
    ok: true,
    camion: cam.hechos,
    transito: tr,
    creditos: cxc,
    compra,
    ventaId: venta.id,
    folio: venta.folio,
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

  // Precheck tránsito sin borrar
  if (venta.transito_id) {
    const { data: tr } = await supabase
      .from('transito_efectivo')
      .select('id, estatus')
      .eq('id', venta.transito_id)
      .maybeSingle();
    if (tr) {
      const est = String(tr.estatus || '');
      if (est === 'Liquidado' || est === 'Entregado') {
        return {
          ok: false,
          error: `El efectivo ya está ${est} en RC/VentaRuta. No se puede solicitar cancelación.`,
        };
      }
    }
  }

  const { data: cxcRows } = await supabase
    .from('ruta_cxc_movimientos')
    .select('id, tipo, estatus, pagado_at')
    .eq('venta_id', venta.id)
    .eq('tipo', 'cargo');
  if ((cxcRows || []).some((m) => m.pagado_at || String(m.estatus || '').toLowerCase() === 'pagado')) {
    return {
      ok: false,
      error: 'Hay crédito ya cobrado. No se puede solicitar cancelación automática.',
    };
  }

  if (venta.compra_id) {
    const { data: c } = await supabase
      .from('compras')
      .select('id, estado')
      .eq('id', venta.compra_id)
      .maybeSingle();
    const est = String(c?.estado || '').toLowerCase();
    if (est === 'recibida' || est === 'recibido' || est === 'cerrada') {
      return {
        ok: false,
        error: 'La compra ya fue recibida en tienda. Revierte la recepción antes de cancelar la venta.',
      };
    }
  }

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
    transito_id: venta.transito_id ? String(venta.transito_id) : null,
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
      + 'Aprueba con PIN de administrador para revertir camión, créditos y RC/VentaRuta.',
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

  const { data: venta, error: eV } = await supabase
    .from('ruta_ventas')
    .select('*')
    .eq('id', sol.venta_id)
    .maybeSingle();
  if (eV) return { ok: false, error: eV.message };
  if (!venta) return { ok: false, error: 'La venta ya no existe.' };

  const exec = await ejecutarCancelacionVentaRuta(supabase, {
    venta,
    adminNombre: auth.user?.nombre || auth.nombre,
  });
  if (!exec.ok) return exec;

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
