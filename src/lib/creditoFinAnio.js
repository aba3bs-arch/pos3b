/**
 * Crédito de fin de año dejado en sucursales.
 * Tablas propias. No escribe ventas, CxC de ruta, recolección ni stock del camión.
 */

import { filtrarProductosPorTexto, pareceCodigoProducto, productoPorCodigoExacto } from './buscarProductoTexto.js';
import { cargarGastoCreditoCobradoACorteAbarrotes } from './controlEfectivo.js';
import { folioCompraConPago, notasConFolioInv } from './foliosInventario.js';
import { asegurarProveedorPorNombre } from './proveedorEntregas.js';

export const TIPO_DEJAR = 'dejar';
export const TIPO_RETIRAR = 'retirar';
export const ESTADO_ABIERTA = 'abierta';
export const ESTADO_CERRADA = 'cerrada';

export const AVISO_FALTA_CREDITO_FIN_ANIO =
  'Faltan las tablas de crédito de fin de año. En Supabase → SQL Editor ejecuta supabase/fix_credito_fin_anio.sql.';

const TABLA_CUENTAS = 'credito_fin_anio_cuentas';
const TABLA_MOV = 'credito_fin_anio_mov';
const TABLA_ABONOS = 'credito_fin_anio_abonos';
const TABLA_RECIBOS = 'credito_fin_anio_recibos';
const TABLA_LIQUIDACIONES = 'credito_fin_anio_liquidaciones';
const PROVEEDOR_CUETES = 'CUETES';

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

export function importeLinea(cantidad, precio) {
  return round2((Number(cantidad) || 0) * (Number(precio) || 0));
}

export function claveProducto(mov) {
  const cod = String(mov?.codigo || '').trim().toUpperCase();
  const nom = String(mov?.nombre || '').trim().toLowerCase();
  return `${cod}|${nom}`;
}

export function anioFinAnio(ahora = new Date()) {
  const y = ahora.toLocaleString('en-US', { timeZone: 'America/Phoenix', year: 'numeric' });
  const n = Number(y);
  return Number.isFinite(n) ? n : ahora.getFullYear();
}

export function nombreCuentaFinAnio(ahora = new Date()) {
  return `Fin de año ${anioFinAnio(ahora)}`;
}

/** Código que se copia a la cuenta: la clave del catálogo (id), no un texto del nombre. */
export function codigoVisibleProducto(p) {
  const id = String(p?.id || '').trim();
  if (id) return id;
  return String(p?.codigo || p?.codigo_barras || '').trim();
}

/**
 * Sugerencias del catálogo al dejar mercancía.
 * Un código (solo dígitos, o clave sin espacios) coincide exacto con id o código alterno.
 * Un nombre busca dentro del nombre y no arrastra artículos que solo traen esos dígitos en el texto.
 */
export function sugerenciasCatalogoFinAnio(inventario, query, limite = 8) {
  const q = String(query || '').trim();
  if (!q) return [];
  if (!pareceCodigoProducto(q) && q.length < 2) return [];
  return filtrarProductosPorTexto(inventario, q).slice(0, limite);
}

/** Si el texto es un código y hay un artículo con esa clave, lo devuelve para cargarlo en el formulario. */
export function productoParaCargarFinAnio(inventario, query) {
  const q = String(query || '').trim();
  if (!pareceCodigoProducto(q)) return null;
  return productoPorCodigoExacto(inventario, q);
}

function vivo(row) {
  return row && !row.archived_at;
}

export function inventarioDeMovimientos(movimientos) {
  const map = new Map();
  for (const m of movimientos || []) {
    if (!vivo(m)) continue;
    const k = claveProducto(m);
    const prev = map.get(k) || {
      clave: k,
      codigo: String(m.codigo || '').trim(),
      nombre: String(m.nombre || '').trim(),
      cantidad: 0,
      valor: 0,
    };
    const signo = m.tipo === TIPO_RETIRAR ? -1 : 1;
    prev.cantidad = round3(prev.cantidad + signo * (Number(m.cantidad) || 0));
    prev.valor = round2(prev.valor + signo * (Number(m.importe) || 0));
    if (!prev.codigo && m.codigo) prev.codigo = String(m.codigo).trim();
    map.set(k, prev);
  }
  return [...map.values()]
    .filter((l) => Math.abs(l.cantidad) > 0.0001 || Math.abs(l.valor) > 0.001)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Inventario que sigue en las cuentas de cada sucursal (clave en mayúsculas). */
export function inventarioPorSucursal(cuentas, movimientos) {
  const idsPorSuc = new Map();
  for (const c of cuentas || []) {
    if (!vivo(c)) continue;
    const sid = String(c.sucursal_id || '').toUpperCase();
    if (!idsPorSuc.has(sid)) idsPorSuc.set(sid, new Set());
    idsPorSuc.get(sid).add(String(c.id));
  }
  const out = new Map();
  for (const [sid, ids] of idsPorSuc) {
    const movs = (movimientos || []).filter((m) => ids.has(String(m.cuenta_id || '')));
    out.set(sid, inventarioDeMovimientos(movs));
  }
  return out;
}

export function resumenCuenta(movimientos, abonos) {
  let dejado = 0;
  let retirado = 0;
  for (const m of movimientos || []) {
    if (!vivo(m)) continue;
    const imp = Number(m.importe) || 0;
    if (m.tipo === TIPO_RETIRAR) retirado += imp;
    else dejado += imp;
  }
  let abonado = 0;
  for (const a of abonos || []) {
    if (!vivo(a)) continue;
    abonado += Number(a.monto) || 0;
  }
  const saldoMercancia = round2(dejado - retirado);
  abonado = round2(abonado);
  return {
    dejado: round2(dejado),
    retirado: round2(retirado),
    saldoMercancia,
    abonado,
    saldo: round2(saldoMercancia - abonado),
  };
}

export function resumenPorSucursal(cuentas, movimientos, abonos) {
  const porCuentaMov = new Map();
  const porCuentaAbono = new Map();
  for (const m of movimientos || []) {
    if (!vivo(m)) continue;
    const id = String(m.cuenta_id || '');
    if (!porCuentaMov.has(id)) porCuentaMov.set(id, []);
    porCuentaMov.get(id).push(m);
  }
  for (const a of abonos || []) {
    if (!vivo(a)) continue;
    const id = String(a.cuenta_id || '');
    if (!porCuentaAbono.has(id)) porCuentaAbono.set(id, []);
    porCuentaAbono.get(id).push(a);
  }
  const out = new Map();
  for (const c of cuentas || []) {
    if (!vivo(c)) continue;
    const sid = String(c.sucursal_id || '').toUpperCase();
    const prev = out.get(sid) || {
      sucursalId: sid,
      cuentas: 0,
      abiertas: 0,
      saldoMercancia: 0,
      abonado: 0,
      saldo: 0,
    };
    const r = resumenCuenta(porCuentaMov.get(String(c.id)) || [], porCuentaAbono.get(String(c.id)) || []);
    prev.cuentas += 1;
    if (c.estado !== ESTADO_CERRADA) prev.abiertas += 1;
    prev.saldoMercancia = round2(prev.saldoMercancia + r.saldoMercancia);
    prev.abonado = round2(prev.abonado + r.abonado);
    prev.saldo = round2(prev.saldo + r.saldo);
    out.set(sid, prev);
  }
  return out;
}

export function validarDejar({ nombre, cantidad, precio }) {
  if (!String(nombre || '').trim()) return 'Escribe el producto.';
  if (!(Number(cantidad) > 0)) return 'La cantidad debe ser mayor a cero.';
  if (Number(precio) < 0 || !Number.isFinite(Number(precio))) return 'El precio no puede ser negativo.';
  return '';
}

export function validarRetiro({ cantidad, disponible }) {
  if (!(Number(cantidad) > 0)) return 'La cantidad debe ser mayor a cero.';
  if (round3(Number(cantidad) - Number(disponible)) > 0) return 'No hay tanta mercancía en esta cuenta.';
  return '';
}

export function validarAbono(monto) {
  if (!(Number(monto) > 0)) return 'El abono debe ser mayor a cero.';
  return '';
}

/** Total de cada tarjeta: inventario de cuetes menos abonos. */
export function saldosTarjetas(tiendas, cuentas, movimientos, abonos) {
  const por = resumenPorSucursal(cuentas, movimientos, abonos);
  return (tiendas || []).map((id) => {
    const sid = String(id || '').toUpperCase();
    const r = por.get(sid) || { saldoMercancia: 0, abonado: 0, saldo: 0 };
    return {
      sucursalId: sid,
      mercancia: r.saldoMercancia,
      abonado: r.abonado,
      total: r.saldo,
    };
  });
}

export function totalTarjetas(saldos) {
  return round2((saldos || []).reduce((s, x) => s + (Number(x.total) || 0), 0));
}

/** Total que se ve antes de liquidar: el crédito neto más los abonos de esta liquidación. */
export function totalAntesDeLiquidar(totalNeto, abonosEnCurso) {
  return round2((Number(totalNeto) || 0) + (Number(abonosEnCurso) || 0));
}

/** Lo que quedaría pendiente si se cobra esta recolección. */
export function creditoPendienteTrasRecoleccion(total, recoleccion) {
  const t = round2(total);
  const r = round2(recoleccion);
  if (!(r > 0)) return t;
  return round2(t - r);
}

/**
 * Reparte la recolección entre cuentas abiertas, en el orden de las tiendas.
 * El pendiente que queda es el total de las tarjetas menos lo aplicado.
 */
export function planLiquidacion({ tiendas, cuentas, movimientos, abonos, monto }) {
  const pedido = round2(monto);
  if (!(pedido > 0)) return { ok: false, error: 'La recolección debe ser mayor a cero.' };
  const tarjetas = saldosTarjetas(tiendas, cuentas, movimientos, abonos);
  const total = totalTarjetas(tarjetas);
  if (round2(pedido - total) > 0.001) {
    return { ok: false, error: 'La recolección no puede ser mayor que el crédito pendiente.' };
  }
  const movsPorCuenta = new Map();
  const abonosPorCuenta = new Map();
  for (const m of movimientos || []) {
    if (!vivo(m)) continue;
    const id = String(m.cuenta_id || '');
    if (!movsPorCuenta.has(id)) movsPorCuenta.set(id, []);
    movsPorCuenta.get(id).push(m);
  }
  for (const a of abonos || []) {
    if (!vivo(a)) continue;
    const id = String(a.cuenta_id || '');
    if (!abonosPorCuenta.has(id)) abonosPorCuenta.set(id, []);
    abonosPorCuenta.get(id).push(a);
  }
  let resta = pedido;
  const partes = [];
  for (const id of tiendas || []) {
    if (!(resta > 0.001)) break;
    const sid = String(id || '').toUpperCase();
    const abiertas = (cuentas || []).filter((c) => vivo(c)
      && String(c.sucursal_id || '').toUpperCase() === sid
      && c.estado !== ESTADO_CERRADA);
    for (const c of abiertas) {
      if (!(resta > 0.001)) break;
      const saldo = resumenCuenta(
        movsPorCuenta.get(String(c.id)) || [],
        abonosPorCuenta.get(String(c.id)) || [],
      ).saldo;
      if (!(saldo > 0.001)) continue;
      const toma = round2(Math.min(saldo, resta));
      partes.push({ sucursalId: sid, cuentaId: c.id, monto: toma });
      resta = round2(resta - toma);
    }
  }
  const aplicado = round2(pedido - resta);
  if (round2(pedido - aplicado) > 0.001) {
    return { ok: false, error: 'No hay cuenta abierta para aplicar toda la recolección.' };
  }
  return {
    ok: true,
    partes,
    aplicado,
    total,
    pendiente: round2(total - aplicado),
  };
}

export function validarCuenta({ sucursalId, nombre }) {
  if (!String(sucursalId || '').trim()) return 'Elige la sucursal.';
  if (!String(nombre || '').trim()) return 'Escribe el nombre de la cuenta.';
  return '';
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '');
  return /schema cache|does not exist|could not find the table|relation .*credito_fin_anio/i.test(msg);
}

function nombreDe(user, nombre) {
  return String(nombre || user?.nombre || user?.email || 'Sistema').trim() || 'Sistema';
}

async function listarTabla(supabase, tabla) {
  if (!supabase) return { data: [], error: 'Sin conexión.' };
  const { data, error } = await supabase
    .from(tabla)
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_CREDITO_FIN_ANIO, faltaTabla: true };
  if (error) return { data: [], error: error.message || 'No se pudo leer el registro.' };
  return { data: data || [] };
}

export function listarCuentasFinAnio(supabase) {
  return listarTabla(supabase, TABLA_CUENTAS);
}

export function listarMovimientosFinAnio(supabase) {
  return listarTabla(supabase, TABLA_MOV);
}

export function listarAbonosFinAnio(supabase) {
  return listarTabla(supabase, TABLA_ABONOS);
}

export function listarRecibosFinAnio(supabase) {
  return listarTabla(supabase, TABLA_RECIBOS);
}

export function listarLiquidacionesFinAnio(supabase) {
  return listarTabla(supabase, TABLA_LIQUIDACIONES);
}

/** Fila del registro: cuánto se liquidó, qué quedó pendiente y en qué tiendas. */
export function armarRegistroLiquidacion({ aplicado, pendiente, total, partes, user }) {
  const detalle = (partes || []).map((p) => ({
    sucursal_id: String(p.sucursalId || p.sucursal_id || '').toUpperCase(),
    monto: round2(p.monto),
  })).filter((p) => p.sucursal_id && p.monto > 0);
  return {
    monto: round2(aplicado),
    pendiente: round2(pendiente),
    total_antes: round2(total),
    detalle,
    created_by: nombreDe(user),
  };
}

export function detalleLiquidacion(raw) {
  const src = Array.isArray(raw) ? raw : [];
  return src.map((p) => ({
    sucursal_id: String(p?.sucursal_id || p?.sucursalId || '').toUpperCase(),
    monto: round2(p?.monto),
  })).filter((p) => p.sucursal_id);
}

/** Suma los abonos de una liquidación por tienda y conserva cada abono. */
export function desgloseLiquidacion(liquidacion, abonos, cuentas) {
  const cuentaSuc = new Map(
    (cuentas || []).map((c) => [String(c.id), String(c.sucursal_id || '').toUpperCase()]),
  );
  const propios = (abonos || []).filter((a) => a && !a.archived_at && String(a.liquidacion_id || '') === String(liquidacion?.id || ''));
  const fuente = propios.length
    ? propios.map((a) => ({
      ...a,
      sucursal_id: String(a.sucursal_id || cuentaSuc.get(String(a.cuenta_id)) || '').toUpperCase(),
    }))
    : detalleLiquidacion(liquidacion?.detalle).map((p) => ({
      sucursal_id: p.sucursal_id,
      monto: p.monto,
    }));
  const map = new Map();
  for (const a of fuente) {
    const sid = String(a.sucursal_id || '').toUpperCase();
    if (!sid) continue;
    const prev = map.get(sid) || { sucursal_id: sid, monto: 0, abonos: [] };
    const monto = round2(a.monto);
    prev.monto = round2(prev.monto + monto);
    prev.abonos.push({
      monto,
      created_at: a.created_at || null,
      notas: a.notas || '',
    });
    map.set(sid, prev);
  }
  return [...map.values()].sort((a, b) => a.sucursal_id.localeCompare(b.sucursal_id, 'es'));
}

export function liquidacionEnCurso(rows) {
  return (rows || []).find((r) => {
    if (!r || r.archived_at) return false;
    const estado = r.estado == null || r.estado === '' ? '' : String(r.estado);
    if (estado === ESTADO_CERRADA) return false;
    if (estado === ESTADO_ABIERTA) return true;
    return !(Number(r.monto) > 0);
  }) || null;
}

export async function crearCuentaFinAnio(supabase, { sucursalId, nombre, notas, user }) {
  const errorVal = validarCuenta({ sucursalId, nombre });
  if (errorVal) return { ok: false, error: errorVal };
  const { data, error } = await supabase
    .from(TABLA_CUENTAS)
    .insert({
      sucursal_id: String(sucursalId).trim().toUpperCase(),
      nombre: String(nombre).trim(),
      notas: String(notas || '').trim() || null,
      estado: ESTADO_ABIERTA,
      created_by: nombreDe(user),
    })
    .select('*')
    .single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CREDITO_FIN_ANIO };
  if (error) return { ok: false, error: error.message || 'No se pudo abrir la cuenta.' };
  return { ok: true, data };
}

export async function editarCuentaFinAnio(supabase, id, { nombre, notas, estado }) {
  if (!id) return { ok: false, error: 'Falta la cuenta.' };
  const patch = {};
  if (nombre != null) {
    if (!String(nombre).trim()) return { ok: false, error: 'Escribe el nombre de la cuenta.' };
    patch.nombre = String(nombre).trim();
  }
  if (notas != null) patch.notas = String(notas).trim() || null;
  if (estado != null) patch.estado = estado === ESTADO_CERRADA ? ESTADO_CERRADA : ESTADO_ABIERTA;
  const { error } = await supabase.from(TABLA_CUENTAS).update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo guardar la cuenta.' };
  return { ok: true };
}

export async function archivarCuentaFinAnio(supabase, id) {
  if (!id) return { ok: false, error: 'Falta la cuenta.' };
  const { error } = await supabase.from(TABLA_CUENTAS).update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo quitar la cuenta.' };
  return { ok: true };
}

export async function dejarMercanciaFinAnio(supabase, cuentaId, linea, user) {
  const errorVal = validarDejar(linea || {});
  if (errorVal) return { ok: false, error: errorVal };
  if (!cuentaId) return { ok: false, error: 'Abre una cuenta primero.' };
  const cantidad = round3(linea.cantidad);
  const precio = round2(linea.precio);
  const { error } = await supabase.from(TABLA_MOV).insert({
    cuenta_id: cuentaId,
    tipo: TIPO_DEJAR,
    codigo: String(linea.codigo || '').trim() || null,
    nombre: String(linea.nombre).trim(),
    cantidad,
    precio,
    importe: importeLinea(cantidad, precio),
    notas: String(linea.notas || '').trim() || null,
    created_by: nombreDe(user),
  });
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CREDITO_FIN_ANIO };
  if (error) return { ok: false, error: error.message || 'No se pudo dejar la mercancía.' };
  return { ok: true };
}

export async function retirarMercanciaFinAnio(supabase, cuentaId, linea, disponible, user) {
  const errorVal = validarRetiro({ cantidad: linea?.cantidad, disponible });
  if (errorVal) return { ok: false, error: errorVal };
  if (!cuentaId) return { ok: false, error: 'Abre una cuenta primero.' };
  if (Number(linea?.precio) < 0) return { ok: false, error: 'El precio no puede ser negativo.' };
  const cantidad = round3(linea.cantidad);
  const precio = round2(linea.precio);
  const { error } = await supabase.from(TABLA_MOV).insert({
    cuenta_id: cuentaId,
    tipo: TIPO_RETIRAR,
    codigo: String(linea.codigo || '').trim() || null,
    nombre: String(linea.nombre || '').trim() || 'Producto',
    cantidad,
    precio,
    importe: importeLinea(cantidad, precio),
    notas: String(linea.notas || '').trim() || null,
    created_by: nombreDe(user),
  });
  if (error) return { ok: false, error: error.message || 'No se pudo retirar la mercancía.' };
  return { ok: true };
}

export async function editarMovimientoFinAnio(supabase, id, linea) {
  if (!id) return { ok: false, error: 'Falta el movimiento.' };
  const errorVal = validarDejar(linea || {});
  if (errorVal) return { ok: false, error: errorVal };
  const cantidad = round3(linea.cantidad);
  const precio = round2(linea.precio);
  const { error } = await supabase.from(TABLA_MOV).update({
    codigo: String(linea.codigo || '').trim() || null,
    nombre: String(linea.nombre).trim(),
    cantidad,
    precio,
    importe: importeLinea(cantidad, precio),
    notas: String(linea.notas || '').trim() || null,
  }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo editar el movimiento.' };
  return { ok: true };
}

export async function archivarMovimientoFinAnio(supabase, id) {
  if (!id) return { ok: false, error: 'Falta el movimiento.' };
  const { error } = await supabase.from(TABLA_MOV).update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo quitar el movimiento.' };
  return { ok: true };
}

export async function registrarAbonoFinAnio(supabase, cuentaId, {
  monto, notas, sucursalId, tiendas, cuentas, movimientos, abonos,
}, user) {
  const errorVal = validarAbono(monto);
  if (errorVal) return { ok: false, error: errorVal };
  if (!cuentaId) return { ok: false, error: 'Abre una cuenta primero.' };
  const cobrado = round2(monto);
  const suc = String(sucursalId || '').toUpperCase();
  let { data, error } = await supabase.from(TABLA_ABONOS).insert({
    cuenta_id: cuentaId,
    monto: cobrado,
    notas: String(notas || '').trim() || null,
    created_by: nombreDe(user),
    sucursal_id: suc || null,
  }).select('*').single();
  if (error && /sucursal_id/i.test(String(error.message || ''))) {
    ({ data, error } = await supabase.from(TABLA_ABONOS).insert({
      cuenta_id: cuentaId,
      monto: cobrado,
      notas: String(notas || '').trim() || null,
      created_by: nombreDe(user),
    }).select('*').single());
  }
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CREDITO_FIN_ANIO };
  if (error) return { ok: false, error: error.message || 'No se pudo registrar el abono.' };

  const avisos = [];
  const creditoAntes = Array.isArray(tiendas)
    ? totalTarjetas(saldosTarjetas(tiendas, cuentas, movimientos, abonos))
    : null;
  const acum = await acumularAbonoEnLiquidacion(supabase, {
    abono: { ...data, sucursal_id: suc || data?.sucursal_id, monto: cobrado },
    pendiente: creditoAntes == null ? null : round2(creditoAntes - cobrado),
    user,
  });
  if (acum.aviso) avisos.push(acum.aviso);

  if (suc) {
    const gas = await cargarGastoCreditoCobradoACorteAbarrotes(supabase, {
      sucursal_origen: suc,
      num_traspaso: `FIN-ANIO ${suc}`,
      monto: cobrado,
    }, { cajero: nombreDe(user) });
    if (!gas.ok) avisos.push(`El abono quedó en la cuenta. No se anotó el gasto en Abarrotes: ${gas.error}`);
  }
  return { ok: true, aviso: avisos.filter(Boolean).join(' '), liquidacionId: acum.id || null };
}

/** Suma el abono a la liquidación abierta. Si no hay, abre una línea nueva. */
export async function acumularAbonoEnLiquidacion(supabase, { abono, pendiente, user }) {
  const lista = await listarLiquidacionesFinAnio(supabase);
  if (lista.faltaTabla) {
    return { aviso: 'El abono quedó en la tienda. Para verlo en Liquidación, ejecuta supabase/fix_credito_fin_anio.sql.' };
  }
  if (lista.error) return { aviso: `El abono quedó en la tienda. No se acumuló en Liquidación: ${lista.error}` };
  let abierta = liquidacionEnCurso(lista.data);
  if (!abierta) {
    const ins = await supabase.from(TABLA_LIQUIDACIONES).insert({
      monto: 0,
      pendiente: 0,
      total_antes: 0,
      detalle: [],
      estado: ESTADO_ABIERTA,
      created_by: nombreDe(user),
    }).select('*').single();
    if (ins.error) {
      return { aviso: faltaTabla(ins.error)
        ? 'El abono quedó en la tienda. Para verlo en Liquidación, ejecuta supabase/fix_credito_fin_anio.sql.'
        : `El abono quedó en la tienda. No se acumuló en Liquidación: ${ins.error.message}` };
    }
    abierta = ins.data;
  }
  if (abono?.id) {
    const vinculo = await supabase.from(TABLA_ABONOS).update({ liquidacion_id: abierta.id }).eq('id', abono.id);
    if (vinculo.error && !/liquidacion_id/i.test(String(vinculo.error.message || ''))) {
      return { id: abierta.id, aviso: `No se pudo ligar el abono a la liquidación: ${vinculo.error.message}` };
    }
  }
  const deEsta = await supabase.from(TABLA_ABONOS).select('*').eq('liquidacion_id', abierta.id).is('archived_at', null);
  let desglose;
  if (deEsta.error) {
    const previos = detalleLiquidacion(abierta.detalle);
    const sid = String(abono?.sucursal_id || '').toUpperCase();
    const junto = [...previos];
    if (sid) junto.push({ sucursal_id: sid, monto: round2(abono?.monto) });
    const map = new Map();
    for (const p of junto) {
      const id = String(p.sucursal_id || '').toUpperCase();
      if (!id) continue;
      map.set(id, round2((map.get(id) || 0) + (Number(p.monto) || 0)));
    }
    desglose = [...map.entries()].map(([sucursal_id, monto]) => ({ sucursal_id, monto, abonos: [] }));
  } else {
    const ligados = (deEsta.data || []).map((a) => (
      String(a.id) === String(abono?.id)
        ? { ...a, sucursal_id: a.sucursal_id || abono?.sucursal_id, monto: abono?.monto ?? a.monto }
        : a
    ));
    if (!ligados.some((a) => String(a.id) === String(abono?.id))) {
      ligados.push({ ...abono, liquidacion_id: abierta.id });
    }
    desglose = desgloseLiquidacion({ id: abierta.id, detalle: [] }, ligados, []);
  }
  const monto = round2(desglose.reduce((s, t) => s + t.monto, 0));
  const pendienteN = pendiente == null ? round2(abierta.pendiente) : round2(pendiente);
  const totalAntes = Number(abierta.monto) > 0 ? round2(abierta.total_antes) : round2(pendienteN + monto);
  const upd = await supabase.from(TABLA_LIQUIDACIONES).update({
    monto,
    pendiente: pendienteN,
    total_antes: totalAntes,
    detalle: desglose.map((t) => ({ sucursal_id: t.sucursal_id, monto: t.monto })),
  }).eq('id', abierta.id);
  if (upd.error) return { id: abierta.id, aviso: `No se actualizó el total de la liquidación: ${upd.error.message}` };
  return { id: abierta.id };
}

/** Cierra la línea en curso. Los abonos siguientes abren otra. */
export async function cerrarLiquidacionFinAnio(supabase, id) {
  if (!id) return { ok: false, error: 'No hay abonos acumulados para liquidar.' };
  const { data, error } = await supabase.from(TABLA_LIQUIDACIONES).update({ estado: ESTADO_CERRADA }).eq('id', id).select('*').single();
  if (error && faltaTabla(error)) {
    return { ok: false, error: 'Para cerrar el registro, ejecuta supabase/fix_credito_fin_anio.sql.' };
  }
  if (error) return { ok: false, error: error.message || 'No se pudo cerrar la liquidación.' };
  if (!(Number(data?.monto) > 0)) return { ok: false, error: 'Esta liquidación no tiene abonos.' };
  return { ok: true, data };
}

/** Manda el inventario de la cuenta a Compras y guarda el mismo recibo aquí. */
export async function enviarInventarioACompras(supabase, { cuenta, lineas, user }) {
  const items = (lineas || []).filter((l) => Number(l.cantidad) > 0);
  if (!items.length) return { ok: false, error: 'No hay mercancía para enviar.' };
  if (!cuenta?.id) return { ok: false, error: 'Abre una cuenta primero.' };
  const suc = String(cuenta.sucursal_id || '').toUpperCase();
  if (!suc || suc === 'MAIN' || suc === 'CEDIS') {
    return { ok: false, error: 'Esta sucursal no recibe pedidos de compra.' };
  }
  const prov = await asegurarProveedorPorNombre(supabase, PROVEEDOR_CUETES);
  const itemsPedido = items.map((l) => ({
    id: String(l.codigo || l.nombre || '').trim(),
    nombre: l.nombre,
    qty_pedido: Number(l.cantidad) || 0,
    costo_est: l.cantidad ? round2(l.valor / l.cantidad) : 0,
    stock_teorico: 0,
  })).filter((i) => i.id && i.qty_pedido > 0);
  if (!itemsPedido.length) return { ok: false, error: 'No hay mercancía para enviar.' };
  const total = round2(items.reduce((s, l) => s + (Number(l.valor) || 0), 0));
  const notasBase = `Crédito fin de año ${cuenta.nombre || ''} · ${suc} · metodo credito`.trim();
  const { data, error } = await supabase.from('compras').insert([{
    proveedor_id: prov.ok ? prov.id : null,
    sucursal_id: suc,
    total,
    notas: notasBase,
    estado: 'pedido',
    items_pedido: itemsPedido,
    items: [],
  }]).select('id').single();
  if (error) return { ok: false, error: error.message || 'No se pudo crear el pedido en Compras.' };
  const folio = folioCompraConPago(data.id, suc, 'credito');
  const notas = notasConFolioInv(notasBase, folio);
  await supabase.from('compras').update({ notas }).eq('id', data.id);
  const recibo = {
    cuenta_id: cuenta.id,
    sucursal_id: suc,
    compra_id: data.id,
    folio,
    total,
    items: itemsPedido,
    created_by: nombreDe(user),
  };
  const ins = await supabase.from(TABLA_RECIBOS).insert(recibo).select('*').single();
  const falta = ins.error && faltaTabla(ins.error);
  return {
    ok: true,
    compraId: data.id,
    folio,
    total,
    items: itemsPedido,
    proveedor: prov.ok ? prov.nombre : PROVEEDOR_CUETES,
    recibo: ins.data || { ...recibo, id: data.id },
    aviso: falta
      ? 'El pedido ya está en Compras. Para ver el recibo también aquí, ejecuta supabase/fix_credito_fin_anio.sql.'
      : (ins.error ? `El pedido está en Compras. No se guardó la copia del recibo: ${ins.error.message}` : ''),
  };
}

export async function editarAbonoFinAnio(supabase, id, { monto, notas }) {
  if (!id) return { ok: false, error: 'Falta el abono.' };
  const errorVal = validarAbono(monto);
  if (errorVal) return { ok: false, error: errorVal };
  const { error } = await supabase.from(TABLA_ABONOS).update({
    monto: round2(monto),
    notas: String(notas || '').trim() || null,
  }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo editar el abono.' };
  return { ok: true };
}

export async function archivarAbonoFinAnio(supabase, id) {
  if (!id) return { ok: false, error: 'Falta el abono.' };
  const { error } = await supabase.from(TABLA_ABONOS).update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo quitar el abono.' };
  return { ok: true };
}
