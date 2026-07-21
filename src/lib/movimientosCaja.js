import { clasificarPago, inicioDia, finDia, resumirVentas } from './corteCaja.js';
import { consultarVentas } from './ventasQuery.js';
import { filtrarVentasPorTurno } from './turnos.js';
import { aplicarDeltaStock } from './inventarioMultitienda.js';
import { guardarMovimientoLocal } from './inventarioMovimientos.js';

const LS_CANCELACIONES = 'pos3b_cancelaciones';

export const AVISO_FALTA_CANCELACIONES =
  'Falta la tabla cancelaciones. En Supabase → SQL Editor ejecuta: supabase/fix_cancelaciones.sql';

function faltaTablaCancelaciones(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('relation') ||
    (msg.includes('cancelaciones') && (msg.includes('does not exist') || msg.includes('could not find')))
  );
}

export function leerCancelacionesLocales() {
  try {
    const raw = localStorage.getItem(LS_CANCELACIONES);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function guardarCancelacionLocal(row) {
  const prev = leerCancelacionesLocales();
  const next = [{ ...row, id: row.id || `cancel_${Date.now()}` }, ...prev].slice(0, 300);
  localStorage.setItem(LS_CANCELACIONES, JSON.stringify(next));
  return next;
}

/** Cantidad ya cancelada por producto en una venta. */
export function canceladoPorVenta(cancelaciones, ventaId) {
  const map = {};
  for (const c of cancelaciones || []) {
    if (String(c.venta_id) !== String(ventaId)) continue;
    for (const a of c.articulos || []) {
      const id = String(a.id);
      map[id] = (map[id] || 0) + (Number(a.qty) || 0);
    }
  }
  return map;
}

/** Líneas de venta con cantidad aún cancelable. */
export function lineasCancelablesVenta(venta, cancelaciones) {
  const ya = canceladoPorVenta(cancelaciones, venta.id);
  const arts = Array.isArray(venta.articulos) ? venta.articulos : [];
  return arts
    .map((a) => {
      const id = String(a.id);
      const vendido = Number(a.qty ?? a.cantidad ?? 1) || 1;
      const cancelado = ya[id] || 0;
      const pendiente = Math.max(0, vendido - cancelado);
      return {
        id,
        nombre: a.nombre || id,
        precio: Number(a.precio) || 0,
        vendido,
        cancelado,
        pendiente,
      };
    })
    .filter((l) => l.pendiente > 0);
}

export function resumirMovimientosCaja(ventas, cancelaciones) {
  const base = resumirVentas(ventas);
  const porMetodo = {};
  for (const d of base.detalleMetodos) porMetodo[d.metodo] = d.monto;

  let totalCancelaciones = 0;
  const gruposCancel = { efectivo: 0, tarjeta: 0, transferencia: 0, qr: 0, otros: 0 };

  for (const c of cancelaciones || []) {
    const t = Number(c.total) || 0;
    totalCancelaciones += t;
    const mp = String(c.metodo_pago || 'Sin método');
    porMetodo[mp] = (porMetodo[mp] || 0) - t;
    const g = clasificarPago(mp);
    gruposCancel[g] = (gruposCancel[g] || 0) + t;
  }

  const grupos = { ...base.grupos };
  for (const [g, m] of Object.entries(gruposCancel)) {
    grupos[g] = (grupos[g] || 0) - m;
  }

  const detalleMetodos = Object.entries(porMetodo)
    .filter(([, m]) => Math.abs(m) >= 0.001)
    .map(([metodo, monto]) => ({ metodo, monto }))
    .sort((a, b) => b.monto - a.monto);

  const totalNeto = base.total - totalCancelaciones;

  return {
    ...base,
    totalBruto: base.total,
    totalCancelaciones,
    total: totalNeto,
    ticketsBruto: base.tickets,
    cancelaciones: (cancelaciones || []).length,
    grupos,
    efectivoEsperado: grupos.efectivo,
    electronico: grupos.tarjeta + grupos.transferencia + grupos.qr + grupos.otros,
    detalleMetodos,
  };
}

export function listaMovimientosCaja(ventas, cancelaciones) {
  const rows = [];
  for (const v of ventas || []) {
    rows.push({
      tipo: 'venta',
      id: v.id,
      venta_id: v.id,
      hora: v.created_at,
      usuario: v.vendedor,
      metodo: v.metodo_pago,
      monto: Number(v.total) || 0,
      articulos: Array.isArray(v.articulos) ? v.articulos : [],
      detalle: `Ticket · ${v.vendedor || '—'}`,
    });
  }
  for (const c of cancelaciones || []) {
    rows.push({
      tipo: 'cancelacion',
      id: c.id,
      venta_id: c.venta_id,
      hora: c.created_at || c.hora,
      usuario: c.usuario,
      metodo: c.metodo_pago,
      monto: -(Number(c.total) || 0),
      articulos: c.articulos || [],
      motivo: c.motivo,
      detalle: `Cancelación · ${c.usuario || '—'}`,
    });
  }
  rows.sort((a, b) => new Date(a.hora || 0) - new Date(b.hora || 0));
  let acumulado = 0;
  return rows.map((r) => {
    acumulado += r.monto;
    return { ...r, acumulado };
  });
}

export async function cargarCancelacionesDelDia(supabase, { sucursal, fecha }) {
  const ini = inicioDia(fecha);
  const fin = finDia(fecha);
  const locales = leerCancelacionesLocales().filter((c) => {
    if (sucursal && String(c.sucursal_id || c.sucursal) !== sucursal) return false;
    const t = new Date(c.created_at || c.hora || 0);
    return t >= ini && t <= fin;
  });

  if (!supabase) return { data: locales, soloLocal: true };

  let q = supabase
    .from('cancelaciones')
    .select('*')
    .gte('created_at', ini.toISOString())
    .lte('created_at', fin.toISOString())
    .order('created_at', { ascending: true });
  if (sucursal) q = q.eq('sucursal_id', sucursal);

  const { data, error } = await q;
  if (error) {
    if (faltaTablaCancelaciones(error)) {
      return { data: locales, soloLocal: true, aviso: AVISO_FALTA_CANCELACIONES };
    }
    return { data: locales, error: error.message, soloLocal: false };
  }

  const nube = (data || []).map((c) => ({
    id: c.id,
    venta_id: c.venta_id,
    sucursal_id: c.sucursal_id,
    usuario: c.usuario,
    metodo_pago: c.metodo_pago,
    articulos: c.articulos || [],
    total: Number(c.total) || 0,
    motivo: c.motivo,
    created_at: c.created_at,
    origen: 'nube',
  }));

  if (nube.length === 0 && locales.length > 0) return { data: locales, soloLocal: true };
  return { data: nube.length ? nube : locales, soloLocal: nube.length === 0 };
}

export async function cargarDiaCaja(supabase, { sucursal, fecha, turno = null }) {
  const ini = inicioDia(fecha);
  const fin = finDia(fecha);
  const colsFull = 'id,total,metodo_pago,vendedor,sucursal_id,articulos,created_at,turno_id,turno_nombre,usuario_id';
  const colsBase = 'id,total,metodo_pago,vendedor,sucursal_id,articulos,created_at';
  let ventasRaw = [];
  let error = null;
  let sinFecha = false;
  let aviso = null;

  let r = await consultarVentas(supabase, {
    columns: colsFull,
    desde: ini,
    hasta: fin,
    sucursal,
    limit: 2000,
  });
  if (r.error && String(r.error).includes('turno')) {
    r = await consultarVentas(supabase, {
      columns: colsBase,
      desde: ini,
      hasta: fin,
      sucursal,
      limit: 2000,
    });
    aviso = 'Ejecuta supabase/fix_turnos_seguridad.sql para ligar ventas al turno (turno_id en ventas).';
  }
  ventasRaw = r.data || [];
  error = r.error;
  sinFecha = r.sinFecha;
  if (r.aviso) aviso = r.aviso;

  const ventas = turno ? filtrarVentasPorTurno(ventasRaw, turno) : ventasRaw;
  const cancel = await cargarCancelacionesDelDia(supabase, { sucursal, fecha });
  let ventasOtrasTiendas = null;
  if (supabase && (!ventas || ventas.length === 0)) {
    const { data: todas } = await supabase
      .from('ventas')
      .select('sucursal_id')
      .gte('created_at', ini.toISOString())
      .lte('created_at', fin.toISOString());
    const counts = {};
    for (const v of todas || []) {
      const s = v.sucursal_id || '—';
      if (sucursal && s === sucursal) continue;
      counts[s] = (counts[s] || 0) + 1;
    }
    if (Object.keys(counts).length) ventasOtrasTiendas = counts;
  }
  return {
    ventas: ventas || [],
    ventasDiaSinTurno: ventasRaw.length,
    cancelaciones: cancel.data || [],
    error: error || null,
    aviso: cancel.aviso || (sinFecha ? aviso : null),
    ventasOtrasTiendas,
  };
}

export async function registrarCancelacion(supabase, opts) {
  const { venta, lineas, user, sucursal, inventario, motivo } = opts;
  if (!venta?.id) return { ok: false, error: 'Selecciona un ticket.' };
  const arts = (lineas || []).filter((l) => Number(l.qtyCancelar) > 0);
  if (!arts.length) return { ok: false, error: 'Indica qué productos cancelar.' };

  const total = arts.reduce((a, l) => a + (Number(l.precio) || 0) * Number(l.qtyCancelar), 0);
  const tiendaVenta = venta.sucursal_id || sucursal || '';
  const payload = {
    venta_id: venta.id,
    sucursal_id: tiendaVenta,
    usuario: user?.nombre || '—',
    metodo_pago: venta.metodo_pago,
    articulos: arts.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      precio: l.precio,
      qty: Number(l.qtyCancelar),
    })),
    total,
    motivo: (motivo || '').trim(),
  };

  let cloudId = null;
  if (supabase) {
    const { data, error } = await supabase.from('cancelaciones').insert([payload]).select('id').single();
    if (error && !faltaTablaCancelaciones(error)) {
      return { ok: false, error: error.message };
    }
    if (data?.id) cloudId = data.id;
  }

  const localRow = { ...payload, id: cloudId || `cancel_${Date.now()}`, created_at: new Date().toISOString() };
  guardarCancelacionLocal(localRow);

  if (supabase && inventario) {
    const tienda = tiendaVenta;
    const erroresStock = [];
    for (const l of arts) {
      const prod = inventario.find((p) => String(p.id) === String(l.id));
      if (!prod) {
        erroresStock.push(`${l.nombre || l.id}: no encontrado en catálogo`);
        continue;
      }
      const calc = aplicarDeltaStock(prod, tienda, 'piso', Number(l.qtyCancelar), tienda);
      if (!calc.ok) {
        erroresStock.push(`${prod.nombre}: ${calc.error}`);
        continue;
      }
      const { error: eStock } = await supabase.from('productos').update(calc.patch).eq('id', prod.id);
      if (eStock) {
        erroresStock.push(`${prod.nombre}: ${eStock.message}`);
        continue;
      }
      guardarMovimientoLocal({
        tipo: 'entrada',
        modo: 'cancelacion',
        producto_id: prod.id,
        producto_nombre: prod.nombre,
        cantidad: Number(l.qtyCancelar),
        stock_antes: calc.antes,
        stock_despues: calc.despues,
        ubicacion: 'piso',
        motivo: `Cancelación ticket #${venta.id}${motivo ? ` · ${motivo.trim()}` : ''}`,
        usuario: user?.nombre || '—',
        sucursal: tiendaVenta,
        created_at: localRow.created_at,
      });
    }
    if (erroresStock.length) {
      return {
        ok: false,
        error: `Cancelación registrada pero hubo errores al devolver inventario:\n${erroresStock.join('\n')}`,
        cancelacion: localRow,
        avisoLocal: !cloudId ? AVISO_FALTA_CANCELACIONES : null,
      };
    }
  }

  return { ok: true, cancelacion: localRow, avisoLocal: !cloudId ? AVISO_FALTA_CANCELACIONES : null };
}
