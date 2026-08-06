/**
 * Venta en Ruta — CEDIS Ruta (stock aislado de MAIN).
 * LocalStorage fallback si faltan tablas en Supabase.
 */

import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import { precioCedisRuta, registrarCargoCreditoRuta } from './rutaCxc.js';

const LS_STOCK = 'pos3b_cedis_ruta_stock';
const LS_MOV = 'pos3b_cedis_ruta_mov';
const LS_CLIENTES = 'pos3b_ruta_clientes';
const LS_CARGAS = 'pos3b_ruta_cargas';
const LS_LINEAS = 'pos3b_ruta_carga_lineas';
const LS_VENTAS = 'pos3b_ruta_ventas';
const LS_LIQ = 'pos3b_ruta_liquidaciones';

export const AVISO_FALTA_VENTA_RUTA =
  'Faltan tablas de Venta en Ruta. En Supabase → SQL Editor ejecuta: supabase/fix_venta_en_ruta.sql';

export const NOMBRE_ALMACEN_RUTA = 'CEDIS Ruta';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}
function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('schema cache') || msg.includes('does not exist');
}
function leerLS(key, fallback = []) {
  try {
    const j = JSON.parse(localStorage.getItem(key) || 'null');
    return j ?? fallback;
  } catch {
    return fallback;
  }
}
function guardarLS(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota */
  }
}
function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function folioCarga() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `CR-${ymd}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}
function folioVenta() {
  return `VR-${Date.now().toString(36).toUpperCase()}`;
}

/** Clientes destino: sucursales propias + externos activos. */
export function listarDestinosVentaRuta(clientesExternos = []) {
  const propias = listarSucursalesOperativas().map((s) => ({
    tipo: 'sucursal',
    id: s,
    nombre: etiquetaTienda(s),
    propio: true,
  }));
  const externos = (clientesExternos || [])
    .filter((c) => c.activo !== false)
    .map((c) => ({
      tipo: 'externo',
      id: String(c.id),
      nombre: c.nombre,
      propio: false,
      credito_limite: Number(c.credito_limite) || 0,
    }));
  return [...propias, ...externos];
}

// ─── Stock CEDIS Ruta ─────────────────────────────────────────────

export async function listarStockCedisRuta(supabase) {
  if (!supabase) {
    const map = leerLS(LS_STOCK, {});
    return { data: Object.entries(map).map(([producto_id, cantidad]) => ({ producto_id, cantidad: Number(cantidad) || 0 })), soloLocal: true };
  }
  const { data, error } = await supabase.from('cedis_ruta_stock').select('*').order('producto_id');
  if (error && faltaTabla(error)) {
    const map = leerLS(LS_STOCK, {});
    return { data: Object.entries(map).map(([producto_id, cantidad]) => ({ producto_id, cantidad: Number(cantidad) || 0 })), aviso: AVISO_FALTA_VENTA_RUTA, soloLocal: true };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function stockProductoCedisRuta(supabase, productoId) {
  const pid = String(productoId || '');
  if (!pid) return 0;
  if (!supabase) {
    const map = leerLS(LS_STOCK, {});
    return Number(map[pid]) || 0;
  }
  const { data, error } = await supabase.from('cedis_ruta_stock').select('cantidad').eq('producto_id', pid).maybeSingle();
  if (error && faltaTabla(error)) {
    const map = leerLS(LS_STOCK, {});
    return Number(map[pid]) || 0;
  }
  return Number(data?.cantidad) || 0;
}

async function setStockLocal(productoId, cantidad) {
  const map = leerLS(LS_STOCK, {});
  const q = Math.max(0, round3(cantidad));
  if (q <= 0) delete map[productoId];
  else map[productoId] = q;
  guardarLS(LS_STOCK, map);
  return q;
}

async function registrarMovLocal(row) {
  const list = leerLS(LS_MOV, []);
  list.unshift({ ...row, id: row.id || uid('mov'), created_at: new Date().toISOString() });
  guardarLS(LS_MOV, list.slice(0, 2000));
}

/** Ingreso / retiro / ajuste en CEDIS Ruta. */
export async function moverStockCedisRuta(supabase, { productoId, tipo, cantidad, nota, usuarioNombre, refTabla, refId } = {}) {
  const pid = String(productoId || '');
  const qty = round3(Math.abs(Number(cantidad) || 0));
  if (!pid) return { ok: false, error: 'Producto inválido.' };
  if (!(qty > 0)) return { ok: false, error: 'Cantidad inválida.' };
  const t = String(tipo || 'ingreso').toLowerCase();
  const signo = t === 'retiro' || t === 'carga' ? -1 : 1;

  const antes = await stockProductoCedisRuta(supabase, pid);
  let despues;
  if (t === 'ajuste') {
    despues = qty;
  } else {
    despues = round3(antes + signo * qty);
  }
  if (despues < -0.0001) return { ok: false, error: `Stock insuficiente en ${NOMBRE_ALMACEN_RUTA} (hay ${antes}, pediste ${qty}).` };
  despues = Math.max(0, despues);

  const mov = {
    producto_id: pid,
    tipo: t,
    cantidad: t === 'ajuste' ? despues - antes : qty * (signo < 0 ? -1 : 1),
    stock_antes: antes,
    stock_despues: despues,
    ref_tabla: refTabla || null,
    ref_id: refId != null ? String(refId) : null,
    nota: nota || null,
    usuario_nombre: usuarioNombre || null,
  };

  if (!supabase) {
    await setStockLocal(pid, despues);
    await registrarMovLocal(mov);
    return { ok: true, antes, despues, soloLocal: true };
  }

  const { error: eStock } = await supabase.from('cedis_ruta_stock').upsert(
    { producto_id: pid, cantidad: despues, updated_at: new Date().toISOString() },
    { onConflict: 'producto_id' },
  );
  if (eStock && faltaTabla(eStock)) {
    await setStockLocal(pid, despues);
    await registrarMovLocal(mov);
    return { ok: true, antes, despues, soloLocal: true, aviso: AVISO_FALTA_VENTA_RUTA };
  }
  if (eStock) return { ok: false, error: eStock.message };

  const { error: eMov } = await supabase.from('cedis_ruta_movimientos').insert([mov]);
  if (eMov && !faltaTabla(eMov)) {
    /* no revertir stock por fallo de bitácora */
  }
  if (eMov && faltaTabla(eMov)) {
    await registrarMovLocal(mov);
  }
  return { ok: true, antes, despues };
}

// ─── Clientes externos ────────────────────────────────────────────

export async function listarClientesRuta(supabase) {
  if (!supabase) return { data: leerLS(LS_CLIENTES, []) };
  const { data, error } = await supabase.from('ruta_clientes').select('*').order('nombre');
  if (error && faltaTabla(error)) return { data: leerLS(LS_CLIENTES, []), aviso: AVISO_FALTA_VENTA_RUTA };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function guardarClienteRuta(supabase, row) {
  const payload = {
    nombre: String(row.nombre || '').trim(),
    direccion: row.direccion || null,
    telefono: row.telefono || null,
    credito_limite: round2(row.credito_limite),
    activo: row.activo !== false,
    notas: row.notas || null,
  };
  if (!payload.nombre) return { ok: false, error: 'Nombre requerido.' };

  if (!supabase) {
    const list = leerLS(LS_CLIENTES, []);
    if (row.id) {
      const next = list.map((c) => (String(c.id) === String(row.id) ? { ...c, ...payload } : c));
      guardarLS(LS_CLIENTES, next);
      return { ok: true, id: row.id, soloLocal: true };
    }
    const id = uid('cli');
    list.unshift({ ...payload, id, created_at: new Date().toISOString() });
    guardarLS(LS_CLIENTES, list);
    return { ok: true, id, soloLocal: true };
  }

  if (row.id) {
    const { error } = await supabase.from('ruta_clientes').update(payload).eq('id', row.id);
    if (error && faltaTabla(error)) return guardarClienteRuta(null, row);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: row.id };
  }
  const { data, error } = await supabase.from('ruta_clientes').insert([payload]).select('id').single();
  if (error && faltaTabla(error)) return guardarClienteRuta(null, row);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

// ─── Cargas ───────────────────────────────────────────────────────

export async function listarCargasRuta(supabase, { estado, limit = 80 } = {}) {
  if (!supabase) {
    let list = leerLS(LS_CARGAS, []);
    if (estado) list = list.filter((c) => c.estado === estado);
    return { data: list.slice(0, limit) };
  }
  let q = supabase.from('ruta_cargas').select('*').order('created_at', { ascending: false }).limit(limit);
  if (estado) q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let list = leerLS(LS_CARGAS, []);
    if (estado) list = list.filter((c) => c.estado === estado);
    return { data: list.slice(0, limit), aviso: AVISO_FALTA_VENTA_RUTA };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function lineasDeCarga(supabase, cargaId) {
  if (!cargaId) return { data: [] };
  if (!supabase) {
    const all = leerLS(LS_LINEAS, []);
    return { data: all.filter((l) => String(l.carga_id) === String(cargaId)) };
  }
  const { data, error } = await supabase.from('ruta_carga_lineas').select('*').eq('carga_id', cargaId);
  if (error && faltaTabla(error)) {
    const all = leerLS(LS_LINEAS, []);
    return { data: all.filter((l) => String(l.carga_id) === String(cargaId)), aviso: AVISO_FALTA_VENTA_RUTA };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

/**
 * Crea carga y descuenta CEDIS Ruta.
 * @param {Array<{productoId, nombre, precio, cantidad}>} lineas
 */
export async function crearCargaRuta(supabase, { vendedorNombre, vendedorId, notas, lineas, usuarioNombre } = {}) {
  const items = (lineas || [])
    .map((l) => ({
      productoId: String(l.productoId || l.producto_id || ''),
      nombre: l.nombre || l.producto_nombre || '',
      precio: round2(l.precio),
      cantidad: round3(Math.abs(Number(l.cantidad) || 0)),
    }))
    .filter((l) => l.productoId && l.cantidad > 0);
  if (!items.length) return { ok: false, error: 'Agrega al menos un producto a la carga.' };

  for (const it of items) {
    const disp = await stockProductoCedisRuta(supabase, it.productoId);
    if (disp + 0.0001 < it.cantidad) {
      return { ok: false, error: `Sin stock en ${NOMBRE_ALMACEN_RUTA} para ${it.nombre || it.productoId} (hay ${disp}, pides ${it.cantidad}).` };
    }
  }

  const folio = folioCarga();
  const carga = {
    id: uid('carga'),
    folio,
    vendedor_id: vendedorId || null,
    vendedor_nombre: vendedorNombre || usuarioNombre || '—',
    fecha: new Date().toISOString().slice(0, 10),
    estado: 'en_ruta',
    notas: notas || null,
    created_at: new Date().toISOString(),
  };

  if (!supabase) {
    const cargas = leerLS(LS_CARGAS, []);
    cargas.unshift(carga);
    guardarLS(LS_CARGAS, cargas);
    const lineasLs = leerLS(LS_LINEAS, []);
    for (const it of items) {
      lineasLs.push({
        id: uid('lin'),
        carga_id: carga.id,
        producto_id: it.productoId,
        producto_nombre: it.nombre,
        precio: it.precio,
        qty_cargada: it.cantidad,
        qty_vendida: 0,
        qty_devuelta: 0,
      });
      const r = await moverStockCedisRuta(null, {
        productoId: it.productoId,
        tipo: 'carga',
        cantidad: it.cantidad,
        nota: `Carga ${folio}`,
        usuarioNombre,
        refTabla: 'ruta_cargas',
        refId: carga.id,
      });
      if (!r.ok) return r;
    }
    guardarLS(LS_LINEAS, lineasLs);
    return { ok: true, carga, soloLocal: true };
  }

  const { data: row, error } = await supabase
    .from('ruta_cargas')
    .insert([{
      folio: carga.folio,
      vendedor_id: carga.vendedor_id,
      vendedor_nombre: carga.vendedor_nombre,
      fecha: carga.fecha,
      estado: 'en_ruta',
      notas: carga.notas,
    }])
    .select('*')
    .single();

  if (error && faltaTabla(error)) {
    return crearCargaRuta(null, { vendedorNombre, vendedorId, notas, lineas, usuarioNombre });
  }
  if (error) return { ok: false, error: error.message };

  const cargaId = row.id;
  for (const it of items) {
    const r = await moverStockCedisRuta(supabase, {
      productoId: it.productoId,
      tipo: 'carga',
      cantidad: it.cantidad,
      nota: `Carga ${folio}`,
      usuarioNombre,
      refTabla: 'ruta_cargas',
      refId: cargaId,
    });
    if (!r.ok) return r;
    const { error: eLin } = await supabase.from('ruta_carga_lineas').insert([{
      carga_id: cargaId,
      producto_id: it.productoId,
      producto_nombre: it.nombre,
      precio: it.precio,
      qty_cargada: it.cantidad,
      qty_vendida: 0,
      qty_devuelta: 0,
    }]);
    if (eLin) return { ok: false, error: eLin.message };
  }
  return { ok: true, carga: row };
}

// ─── Ventas ───────────────────────────────────────────────────────

export async function listarVentasRuta(supabase, { cargaId, limit = 200 } = {}) {
  if (!supabase) {
    let list = leerLS(LS_VENTAS, []);
    if (cargaId) list = list.filter((v) => String(v.carga_id) === String(cargaId));
    return { data: list.slice(0, limit) };
  }
  let q = supabase.from('ruta_ventas').select('*').order('created_at', { ascending: false }).limit(limit);
  if (cargaId) q = q.eq('carga_id', cargaId);
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let list = leerLS(LS_VENTAS, []);
    if (cargaId) list = list.filter((v) => String(v.carga_id) === String(cargaId));
    return { data: list.slice(0, limit), aviso: AVISO_FALTA_VENTA_RUTA };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

/**
 * Venta directa desde inventario de la carga.
 * @param {Array<{productoId, nombre, precio, cantidad}>} articulos
 */
export async function registrarVentaRuta(supabase, {
  cargaId,
  clienteTipo, // sucursal | externo
  clienteId,
  clienteNombre,
  metodoPago, // efectivo | credito
  articulos,
  vendedorNombre,
} = {}) {
  if (!cargaId) return { ok: false, error: 'Elige una carga en ruta.' };
  const mp = String(metodoPago || '').toLowerCase();
  if (mp !== 'efectivo' && mp !== 'credito') return { ok: false, error: 'Método: efectivo o crédito.' };
  const tipoCli = String(clienteTipo || '') === 'externo' ? 'externo' : 'sucursal';
  if (!clienteId) return { ok: false, error: 'Elige sucursal o cliente.' };

  const arts = (articulos || [])
    .map((a) => ({
      producto_id: String(a.productoId || a.producto_id || ''),
      nombre: a.nombre || '',
      precio: round2(a.precio),
      cantidad: round3(Math.abs(Number(a.cantidad) || 0)),
    }))
    .filter((a) => a.producto_id && a.cantidad > 0)
    .map((a) => ({ ...a, importe: round2(a.precio * a.cantidad) }));
  if (!arts.length) return { ok: false, error: 'Agrega productos a la venta.' };
  const total = round2(arts.reduce((s, a) => s + a.importe, 0));

  const linRes = await lineasDeCarga(supabase, cargaId);
  const lineas = linRes.data || [];
  for (const a of arts) {
    const lin = lineas.find((l) => String(l.producto_id) === a.producto_id);
    if (!lin) return { ok: false, error: `${a.nombre || a.producto_id} no está en la carga.` };
    const disp = round3((Number(lin.qty_cargada) || 0) - (Number(lin.qty_vendida) || 0) - (Number(lin.qty_devuelta) || 0));
    if (disp + 0.0001 < a.cantidad) {
      return { ok: false, error: `En camión solo hay ${disp} de ${a.nombre || a.producto_id}.` };
    }
  }

  const venta = {
    id: uid('venta'),
    carga_id: cargaId,
    folio: folioVenta(),
    cliente_tipo: tipoCli,
    cliente_id: String(clienteId),
    cliente_nombre: clienteNombre || String(clienteId),
    metodo_pago: mp,
    total,
    articulos: arts,
    vendedor_nombre: vendedorNombre || null,
    created_at: new Date().toISOString(),
  };

  const bumpVendida = async (productoId, qty) => {
    const lin = lineas.find((l) => String(l.producto_id) === String(productoId));
    if (!lin) return { ok: false, error: 'Línea no encontrada.' };
    const nueva = round3((Number(lin.qty_vendida) || 0) + qty);
    if (!supabase || String(cargaId).startsWith('carga_')) {
      const all = leerLS(LS_LINEAS, []);
      const next = all.map((l) =>
        String(l.carga_id) === String(cargaId) && String(l.producto_id) === String(productoId)
          ? { ...l, qty_vendida: nueva }
          : l,
      );
      guardarLS(LS_LINEAS, next);
      lin.qty_vendida = nueva;
      return { ok: true };
    }
    const { error } = await supabase.from('ruta_carga_lineas').update({ qty_vendida: nueva }).eq('id', lin.id);
    if (error) return { ok: false, error: error.message };
    lin.qty_vendida = nueva;
    return { ok: true };
  };

  const afterVenta = async (ventaRow) => {
    if (mp === 'credito') {
      const cxc = await registrarCargoCreditoRuta(supabase, {
        clienteTipo: tipoCli,
        clienteId,
        clienteNombre: ventaRow.cliente_nombre,
        monto: total,
        ventaId: ventaRow.id,
        cargaId,
        usuarioNombre: vendedorNombre,
        notas: `Venta ${ventaRow.folio}`,
      });
      if (!cxc.ok) return { ok: false, error: cxc.error || 'No se registró el crédito por cobrar.' };
      return { ok: true, venta: ventaRow, cxc: cxc.data, aviso: cxc.aviso };
    }
    return { ok: true, venta: ventaRow };
  };

  if (!supabase || String(cargaId).startsWith('carga_')) {
    for (const a of arts) {
      const r = await bumpVendida(a.producto_id, a.cantidad);
      if (!r.ok) return r;
    }
    const ventas = leerLS(LS_VENTAS, []);
    ventas.unshift(venta);
    guardarLS(LS_VENTAS, ventas);
    const fin = await afterVenta(venta);
    if (!fin.ok) return fin;
    return { ...fin, soloLocal: true };
  }

  const { data, error } = await supabase
    .from('ruta_ventas')
    .insert([{
      carga_id: cargaId,
      folio: venta.folio,
      cliente_tipo: venta.cliente_tipo,
      cliente_id: venta.cliente_id,
      cliente_nombre: venta.cliente_nombre,
      metodo_pago: venta.metodo_pago,
      total: venta.total,
      articulos: venta.articulos,
      vendedor_nombre: venta.vendedor_nombre,
    }])
    .select('*')
    .single();
  if (error && faltaTabla(error)) {
    return registrarVentaRuta(null, { cargaId, clienteTipo, clienteId, clienteNombre, metodoPago, articulos, vendedorNombre });
  }
  if (error) return { ok: false, error: error.message };

  for (const a of arts) {
    const r = await bumpVendida(a.producto_id, a.cantidad);
    if (!r.ok) return r;
  }
  return afterVenta(data);
}

export { precioCedisRuta };

// ─── Liquidación ──────────────────────────────────────────────────

export async function liquidarCargaRuta(supabase, { cargaId, efectivoEntregado, notas, usuarioNombre } = {}) {
  if (!cargaId) return { ok: false, error: 'Carga inválida.' };
  const ventasRes = await listarVentasRuta(supabase, { cargaId, limit: 500 });
  const ventas = ventasRes.data || [];
  let ventaEfectivo = 0;
  let ventaCredito = 0;
  for (const v of ventas) {
    if (String(v.metodo_pago).toLowerCase() === 'credito') ventaCredito += Number(v.total) || 0;
    else ventaEfectivo += Number(v.total) || 0;
  }
  ventaEfectivo = round2(ventaEfectivo);
  ventaCredito = round2(ventaCredito);
  const entregado = round2(efectivoEntregado);
  const diferencia = round2(entregado - ventaEfectivo);

  const linRes = await lineasDeCarga(supabase, cargaId);
  const lineas = linRes.data || [];

  // Devolver sobrante a CEDIS Ruta
  for (const lin of lineas) {
    const sobrante = round3(
      (Number(lin.qty_cargada) || 0) - (Number(lin.qty_vendida) || 0) - (Number(lin.qty_devuelta) || 0),
    );
    if (sobrante <= 0) continue;
    const r = await moverStockCedisRuta(supabase, {
      productoId: lin.producto_id,
      tipo: 'devolucion_carga',
      cantidad: sobrante,
      nota: `Sobrante liquidación carga`,
      usuarioNombre,
      refTabla: 'ruta_cargas',
      refId: cargaId,
    });
    if (!r.ok) return r;

    const nuevaDev = round3((Number(lin.qty_devuelta) || 0) + sobrante);
    if (!supabase || String(cargaId).startsWith('carga_')) {
      const all = leerLS(LS_LINEAS, []);
      guardarLS(
        LS_LINEAS,
        all.map((l) => (String(l.id) === String(lin.id) || (String(l.carga_id) === String(cargaId) && String(l.producto_id) === String(lin.producto_id))
          ? { ...l, qty_devuelta: nuevaDev }
          : l)),
      );
    } else {
      await supabase.from('ruta_carga_lineas').update({ qty_devuelta: nuevaDev }).eq('id', lin.id);
    }
  }

  const liq = {
    id: uid('liq'),
    carga_id: cargaId,
    venta_efectivo: ventaEfectivo,
    venta_credito: ventaCredito,
    efectivo_entregado: entregado,
    diferencia,
    notas: notas || null,
    cerrado_por: usuarioNombre || null,
    created_at: new Date().toISOString(),
  };

  if (!supabase || String(cargaId).startsWith('carga_')) {
    const liqs = leerLS(LS_LIQ, []);
    liqs.unshift(liq);
    guardarLS(LS_LIQ, liqs);
    const cargas = leerLS(LS_CARGAS, []).map((c) =>
      String(c.id) === String(cargaId) ? { ...c, estado: 'liquidada', liquidada_at: liq.created_at } : c,
    );
    guardarLS(LS_CARGAS, cargas);
    return { ok: true, liquidacion: liq, soloLocal: true };
  }

  const { data, error } = await supabase.from('ruta_liquidaciones').insert([{
    carga_id: cargaId,
    venta_efectivo: ventaEfectivo,
    venta_credito: ventaCredito,
    efectivo_entregado: entregado,
    diferencia,
    notas: liq.notas,
    cerrado_por: liq.cerrado_por,
  }]).select('*').single();
  if (error && faltaTabla(error)) {
    return liquidarCargaRuta(null, { cargaId, efectivoEntregado, notas, usuarioNombre });
  }
  if (error) return { ok: false, error: error.message };

  await supabase.from('ruta_cargas').update({ estado: 'liquidada', liquidada_at: new Date().toISOString() }).eq('id', cargaId);
  return { ok: true, liquidacion: data };
}

export async function listarLiquidacionesRuta(supabase, { limit = 80 } = {}) {
  if (!supabase) return { data: leerLS(LS_LIQ, []).slice(0, limit) };
  const { data, error } = await supabase.from('ruta_liquidaciones').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error && faltaTabla(error)) return { data: leerLS(LS_LIQ, []).slice(0, limit), aviso: AVISO_FALTA_VENTA_RUTA };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export function disponibleEnLineaCarga(lin) {
  return round3(
    (Number(lin?.qty_cargada) || 0) - (Number(lin?.qty_vendida) || 0) - (Number(lin?.qty_devuelta) || 0),
  );
}
