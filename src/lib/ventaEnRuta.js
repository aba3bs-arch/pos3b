/**
 * Venta en Ruta POS v2
 * MAIN (CEDIS) → carga camión → POS móvil → efectivo en tránsito / crédito CxC
 * → pedido en Compras para la sucursal.
 */

import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda, ALMACEN_CENTRAL } from '../constants/sucursales.js';
import { aplicarMovimientoInventario } from './inventarioMovimientos.js';
import { esRolRepartidor, normalizarRol } from './roles.js';
import { registrarCargoCreditoRuta } from './rutaCxc.js';
import { registrarEfectivoTransitoVentaRuta } from './rutaTransito.js';
import { puedeAccionVentaRuta } from './ventaEnRutaAcciones.js';

export { registrarEfectivoTransitoVentaRuta } from './rutaTransito.js';

const LS_CLIENTES = 'pos3b_ruta_clientes';
const LS_CARGAS = 'pos3b_ruta_cargas';
const LS_LINEAS = 'pos3b_ruta_carga_lineas';
const LS_VENTAS = 'pos3b_ruta_ventas';

export const AVISO_FALTA_VENTA_RUTA =
  'Faltan tablas de Venta en Ruta. En Supabase ejecuta supabase/fix_autofin_y_venta_ruta_completo.sql (o fix_venta_en_ruta.sql + fix_precio_ruta_y_cxc.sql + fix_venta_ruta_pos_v2.sql).';

export const NOMBRE_ALMACEN_RUTA = 'MAIN · CEDIS';

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

export function puedeAdministrarVentaRuta(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente';
}

/**
 * Usuarios activos con rol Repartidor (o plantilla Repartidor).
 * Para asignar el camión al cargar desde CEDIS.
 */
export async function listarUsuariosRepartidores(supabase) {
  if (!supabase) return { data: [] };
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, sucursal_id, activo')
    .order('nombre')
    .limit(500);
  if (error) return { data: [], error: error.message };
  const list = (data || []).filter((u) => u?.activo !== false && esRolRepartidor(u.rol));
  return { data: list };
}

/** Precio especial de ruta (sin impuestos). */
export function precioRutaEspecial(producto) {
  const p = Number(producto?.precio_ruta);
  if (Number.isFinite(p) && p > 0) return round2(p);
  return null;
}

/** @deprecated alias */
export function precioCedisRuta(producto) {
  return precioRutaEspecial(producto);
}

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

export function disponibleEnLineaCarga(lin) {
  return round3(
    Math.max(
      0,
      (Number(lin?.qty_cargada) || 0) - (Number(lin?.qty_vendida) || 0) - (Number(lin?.qty_devuelta) || 0),
    ),
  );
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
      guardarLS(LS_CLIENTES, list.map((c) => (String(c.id) === String(row.id) ? { ...c, ...payload } : c)));
      return { ok: true, id: row.id, soloLocal: true };
    }
    const id = uid('cli');
    list.unshift({ ...payload, id, created_at: new Date().toISOString() });
    guardarLS(LS_CLIENTES, list);
    return { ok: true, id, soloLocal: true };
  }
  if (row.id) {
    const { error } = await supabase.from('ruta_clientes').update(payload).eq('id', row.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: row.id };
  }
  const { data, error } = await supabase.from('ruta_clientes').insert([payload]).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

// ─── Precios ruta (admin) ─────────────────────────────────────────

export async function guardarPrecioRutaProducto(supabase, productoId, precio, { rol, userId } = {}) {
  if (!puedeAccionVentaRuta(rol, userId, 'ruta_precios')) {
    return { ok: false, error: 'Sin privilegio para ajustar precios de ruta.' };
  }
  const pid = String(productoId || '');
  const p = round2(precio);
  if (!pid) return { ok: false, error: 'Producto inválido.' };
  if (!(p >= 0)) return { ok: false, error: 'Precio inválido.' };
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const { error } = await supabase.from('productos').update({ precio_ruta: p }).eq('id', pid);
  if (error) return { ok: false, error: error.message };
  return { ok: true, precio: p };
}

// ─── Cargas (descuenta MAIN · CEDIS) ───────────────────────────────

export async function listarCargasRuta(supabase, { estado, vendedorId, limit = 80 } = {}) {
  if (!supabase) {
    let list = leerLS(LS_CARGAS, []);
    if (estado) list = list.filter((c) => c.estado === estado);
    if (vendedorId) list = list.filter((c) => String(c.vendedor_id) === String(vendedorId));
    return { data: list.slice(0, limit) };
  }
  let q = supabase.from('ruta_cargas').select('*').order('created_at', { ascending: false }).limit(limit);
  if (estado) q = q.eq('estado', estado);
  if (vendedorId) q = q.eq('vendedor_id', String(vendedorId));
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let list = leerLS(LS_CARGAS, []);
    if (estado) list = list.filter((c) => c.estado === estado);
    if (vendedorId) list = list.filter((c) => String(c.vendedor_id) === String(vendedorId));
    return { data: list.slice(0, limit), aviso: AVISO_FALTA_VENTA_RUTA };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function lineasDeCarga(supabase, cargaId) {
  if (!cargaId) return { data: [] };
  if (!supabase) {
    return { data: leerLS(LS_LINEAS, []).filter((l) => String(l.carga_id) === String(cargaId)) };
  }
  const { data, error } = await supabase.from('ruta_carga_lineas').select('*').eq('carga_id', cargaId);
  if (error && faltaTabla(error)) {
    return {
      data: leerLS(LS_LINEAS, []).filter((l) => String(l.carga_id) === String(cargaId)),
      aviso: AVISO_FALTA_VENTA_RUTA,
    };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

/**
 * Crea carga y descuenta inventario de MAIN · CEDIS (almacén central).
 * El repartidor debe ser un usuario con rol Repartidor.
 * @param {Array<{productoId, nombre, precio, cantidad}>} lineas
 */
export async function crearCargaRuta(supabase, { vendedorNombre, vendedorId, notas, lineas, usuarioNombre, rol, userId, inventario = [] } = {}) {
  if (!puedeAccionVentaRuta(rol, userId, 'ruta_carga')) {
    return { ok: false, error: 'Sin privilegio para cargar el camión desde CEDIS.' };
  }
  const repId = String(vendedorId || '').trim();
  const repNombre = String(vendedorNombre || '').trim();
  if (!repId || !repNombre) {
    return { ok: false, error: 'Selecciona un repartidor con rol Repartidor.' };
  }
  if (supabase) {
    const { data: uRep, error: eRep } = await supabase
      .from('usuarios')
      .select('id, nombre, rol, activo')
      .eq('id', repId)
      .maybeSingle();
    if (eRep) return { ok: false, error: eRep.message };
    if (!uRep || uRep.activo === false) {
      return { ok: false, error: 'El repartidor seleccionado no existe o está inactivo.' };
    }
    if (!esRolRepartidor(uRep.rol)) {
      return { ok: false, error: 'El usuario seleccionado no tiene rol Repartidor.' };
    }
  }
  const items = (lineas || [])
    .map((l) => ({
      productoId: String(l.productoId || l.producto_id || ''),
      nombre: l.nombre || l.producto_nombre || '',
      precio: round2(l.precio),
      cantidad: Math.floor(Math.abs(Number(l.cantidad) || 0)),
    }))
    .filter((l) => l.productoId && l.cantidad > 0);
  if (!items.length) return { ok: false, error: 'Agrega al menos un producto a la carga.' };
  if (!supabase) return { ok: false, error: 'Se requiere conexión a Supabase para descontar CEDIS.' };

  const folio = folioCarga();
  const { data: row, error } = await supabase
    .from('ruta_cargas')
    .insert([{
      folio,
      vendedor_id: repId,
      vendedor_nombre: repNombre,
      fecha: new Date().toISOString().slice(0, 10),
      estado: 'en_ruta',
      notas: notas || null,
    }])
    .select('*')
    .single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_VENTA_RUTA };
  if (error) return { ok: false, error: error.message };

  const cargaId = row.id;
  const porId = new Map((inventario || []).map((p) => [String(p.id), p]));

  for (const it of items) {
    const prod = porId.get(it.productoId) || { id: it.productoId, nombre: it.nombre };
    // Retiro explícito de CEDIS (almacén central en MAIN), no del piso.
    const mov = await aplicarMovimientoInventario(supabase, {
      tipo: 'retiro',
      productoOrigen: prod,
      cantidad: it.cantidad,
      motivo: `Carga camión ruta ${folio} · CEDIS → ${repNombre}`,
      usuario: usuarioNombre || '—',
      sucursal: ALMACEN_CENTRAL,
      sucursalOperacion: ALMACEN_CENTRAL,
      modo: 'cedis',
    });
    if (!mov.ok) {
      return { ok: false, error: `CEDIS · ${it.nombre || it.productoId}: ${mov.error}` };
    }
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

// ─── Efectivo en tránsito: ver rutaTransito.js (reexport arriba) ───

// ─── Pedido en Compras (lista para recibir) ───────────────────────

export async function crearPedidoCompraDesdeVentaRuta(supabase, {
  sucursalId,
  folioVenta: folio,
  articulos,
  total,
  vendedorNombre,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const suc = normalizarCodigoTienda(sucursalId);
  if (!suc || suc === 'MAIN' || suc === 'CEDIS') return { ok: false, error: 'Sucursal inválida para pedido.' };
  const items_pedido = (articulos || []).map((a) => ({
    id: a.producto_id || a.productoId,
    nombre: a.nombre,
    qty_pedido: Math.floor(Number(a.cantidad) || 0),
    costo_est: round2(a.precio),
    stock_teorico: 0,
  })).filter((i) => i.id && i.qty_pedido > 0);
  if (!items_pedido.length) return { ok: false, error: 'Sin artículos para el pedido.' };

  const { data, error } = await supabase
    .from('compras')
    .insert([{
      proveedor_id: null,
      sucursal_id: suc,
      total: round2(total),
      notas: `Venta en ruta ${folio} · ${vendedorNombre || ''}`.trim(),
      estado: 'pedido',
      items_pedido,
      items: [],
    }])
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

// ─── Ventas POS ───────────────────────────────────────────────────

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
 * Cierra una venta POS de ruta (un folio por sucursal/cliente).
 */
export async function registrarVentaRuta(supabase, {
  cargaId,
  clienteTipo,
  clienteId,
  clienteNombre,
  metodoPago,
  articulos,
  vendedorNombre,
  vendedorId,
  montoEfectivo: optsMontoEfectivo = 0,
  montoCredito: optsMontoCredito = 0,
} = {}) {
  if (!cargaId) return { ok: false, error: 'Elige una carga en ruta.' };
  if (!supabase) return { ok: false, error: 'Se requiere conexión.' };
  const mp = String(metodoPago || '').toLowerCase();
  if (mp !== 'efectivo' && mp !== 'credito' && mp !== 'mixto') {
    return { ok: false, error: 'Método: efectivo, crédito o mixto.' };
  }
  const tipoCli = String(clienteTipo || '') === 'externo' ? 'externo' : 'sucursal';
  if (!clienteId) return { ok: false, error: 'Elige sucursal o cliente.' };

  const arts = (articulos || [])
    .map((a) => ({
      producto_id: String(a.productoId || a.producto_id || ''),
      nombre: a.nombre || '',
      precio: round2(a.precio),
      cantidad: Math.floor(Math.abs(Number(a.cantidad) || 0)),
    }))
    .filter((a) => a.producto_id && a.cantidad > 0)
    .map((a) => ({ ...a, importe: round2(a.precio * a.cantidad) }));
  if (!arts.length) return { ok: false, error: 'Agrega productos a la venta.' };
  const total = round2(arts.reduce((s, a) => s + a.importe, 0));

  let montoEfe = round2(optsMontoEfectivo);
  let montoCre = round2(optsMontoCredito);
  if (mp === 'efectivo') {
    montoEfe = total;
    montoCre = 0;
  } else if (mp === 'credito') {
    montoEfe = 0;
    montoCre = total;
  } else {
    // mixto
    if (!(montoEfe >= 0) || !(montoCre >= 0)) {
      return { ok: false, error: 'En mixto indica montos de efectivo y crédito.' };
    }
    if (Math.abs(round2(montoEfe + montoCre) - total) > 0.02) {
      return { ok: false, error: `Mixto debe sumar ${total.toFixed(2)} (efectivo + crédito).` };
    }
    if (montoEfe <= 0 && montoCre <= 0) {
      return { ok: false, error: 'Mixto: al menos un monto debe ser mayor a 0.' };
    }
  }

  const linRes = await lineasDeCarga(supabase, cargaId);
  const lineas = linRes.data || [];
  for (const a of arts) {
    const lin = lineas.find((l) => String(l.producto_id) === a.producto_id);
    if (!lin) return { ok: false, error: `${a.nombre || a.producto_id} no está en la carga.` };
    const disp = disponibleEnLineaCarga(lin);
    if (disp + 0.0001 < a.cantidad) {
      return { ok: false, error: `En camión solo hay ${disp} de ${a.nombre || a.producto_id}.` };
    }
  }

  const folio = folioVenta();
  const ventaPayload = {
    carga_id: cargaId,
    folio,
    cliente_tipo: tipoCli,
    cliente_id: String(clienteId),
    cliente_nombre: clienteNombre || String(clienteId),
    metodo_pago: mp,
    total,
    articulos: mp === 'mixto'
      ? [...arts, { _pago_mixto: true, efectivo: montoEfe, credito: montoCre }]
      : arts,
    vendedor_nombre: vendedorNombre || null,
    estado_credito: montoCre > 0 ? 'pendiente' : null,
  };

  const { data: ventaRow, error } = await supabase
    .from('ruta_ventas')
    .insert([ventaPayload])
    .select('*')
    .single();
  if (error && faltaTabla(error)) {
    // Schema viejo sin estado_credito
    const slim = { ...ventaPayload };
    delete slim.estado_credito;
    const retry = await supabase.from('ruta_ventas').insert([slim]).select('*').single();
    if (retry.error) return { ok: false, error: retry.error.message };
    Object.assign(ventaPayload, retry.data);
  } else if (error) {
    return { ok: false, error: error.message };
  }

  const venta = ventaRow || ventaPayload;

  for (const a of arts) {
    const lin = lineas.find((l) => String(l.producto_id) === a.producto_id);
    const nueva = round3((Number(lin.qty_vendida) || 0) + a.cantidad);
    const { error: eUp } = await supabase.from('ruta_carga_lineas').update({ qty_vendida: nueva }).eq('id', lin.id);
    if (eUp) return { ok: false, error: eUp.message };
  }

  let compraId = null;
  let transitoId = null;
  const avisos = [];

  async function enlazarVenta(extra = {}) {
    const patch = { ...extra };
    if (compraId) patch.compra_id = compraId;
    if (transitoId) patch.transito_id = String(transitoId);
    if (!Object.keys(patch).length) return;
    const { error: eLink } = await supabase.from('ruta_ventas').update(patch).eq('id', venta.id);
    if (eLink) avisos.push(`enlace venta: ${eLink.message}`);
  }

  // Sucursal propia → pedido pendiente de recepción
  if (tipoCli === 'sucursal') {
    const ped = await crearPedidoCompraDesdeVentaRuta(supabase, {
      sucursalId: clienteId,
      folioVenta: folio,
      articulos: arts,
      total,
      vendedorNombre,
    });
    if (!ped.ok) return { ok: false, error: ped.error || 'No se creó el pedido en Compras.' };
    compraId = ped.id;
    // Enlazar de inmediato: si falla tránsito/CxC después, no perder compra_id
    await enlazarVenta();
  }

  if (montoEfe > 0) {
    const tr = await registrarEfectivoTransitoVentaRuta(supabase, {
      sucursalOrigen: tipoCli === 'sucursal' ? clienteId : ALMACEN_CENTRAL,
      monto: montoEfe,
      folioVenta: folio,
      vendedorId,
      vendedorNombre,
      nota: `Venta ruta ${folio} · ${mp === 'mixto' ? `mixto efectivo ${montoEfe}` : 'efectivo'} · ${clienteNombre || clienteId}`,
    });
    if (!tr.ok) {
      await enlazarVenta();
      return {
        ok: false,
        error: tr.error || 'No se registró efectivo en tránsito.',
        compraId,
        venta: { ...venta, compra_id: compraId },
        avisos: avisos.length ? avisos : undefined,
      };
    }
    transitoId = tr.id;
  }

  if (montoCre > 0) {
    const cxc = await registrarCargoCreditoRuta(supabase, {
      clienteTipo: tipoCli,
      clienteId,
      clienteNombre: clienteNombre || String(clienteId),
      monto: montoCre,
      ventaId: venta.id,
      cargaId,
      folioVenta: folio,
      usuarioNombre: vendedorNombre,
      notas: mp === 'mixto'
        ? `Venta ${folio} · mixto crédito ${montoCre}`
        : `Venta ${folio}`,
    });
    if (!cxc.ok) {
      await enlazarVenta();
      return {
        ok: false,
        error: cxc.error || 'No se registró el crédito.',
        compraId,
        venta: { ...venta, compra_id: compraId },
        avisos: avisos.length ? avisos : undefined,
      };
    }
  }

  await enlazarVenta();

  return {
    ok: true,
    venta: { ...venta, compra_id: compraId, transito_id: transitoId },
    cuenta: mp === 'mixto' ? 'mixto' : mp === 'credito' ? 'credito' : 'efectivo',
    compraId,
    transitoId,
    montoEfectivo: montoEfe,
    montoCredito: montoCre,
    avisos: avisos.length ? avisos : undefined,
  };
}

// Stubs / compat: liquidación vieja ya no es el flujo principal
export async function listarLiquidacionesRuta() {
  return { data: [] };
}
export async function liquidarCargaRuta() {
  return { ok: false, error: 'La liquidación de efectivo se hace en Recolecciones / Liquidación (efectivo en tránsito).' };
}
export async function listarStockCedisRuta() {
  return { data: [], aviso: 'El almacén de ruta es MAIN · CEDIS. Usa Productos / inventario central.' };
}
export async function stockProductoCedisRuta() {
  return 0;
}
export async function moverStockCedisRuta() {
  return { ok: false, error: 'Usa carga de camión (descuenta MAIN) o Ajuste de inventario.' };
}
