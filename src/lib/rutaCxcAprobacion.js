/**
 * Créditos por pagar con aprobación del vendedor de ruta.
 *
 * El cajero solicita el cobro; el vendedor que venderá/recolectará ese crédito lo aprueba
 * con su PIN. Solo entonces se ejecuta el pago atómico (gasto de Abarrotes + efectivo en
 * tránsito + abono). Hasta la aprobación no se registra nada.
 */

import { normalizarCodigoTienda, etiquetaTienda } from '../constants/sucursales.js';
import { esCargoPendienteCxc, pagarCreditosRutaConPin, repartirMontoEntreCargos } from './rutaCxc.js';
import { resolverRepartidorId } from './rutaTransito.js';
import { verificarPinVendedorSesionRuta } from './ventaEnRuta.js';

export const AVISO_FALTA_APROBACIONES =
  'Falta la tabla de aprobaciones de cobro. En Supabase → SQL Editor ejecuta supabase/fix_ruta_cxc_aprobaciones.sql. No se registró ningún cobro.';

export const ESTADOS_SOLICITUD_ABIERTA = ['pendiente', 'aprobada'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function faltaTablaAprobaciones(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || error?.code === 'PGRST205' || msg.includes('ruta_cxc_aprobaciones');
}

/** `rt:abc` y `abc` son la misma persona. */
export function normalizarAliasVendedor(valor) {
  return String(valor ?? '').trim().replace(/^rt:/i, '').trim().toLowerCase();
}

export function aliasesDeVendedor(...valores) {
  return [...new Set(valores.flat().map(normalizarAliasVendedor).filter(Boolean))];
}

export function aliasesDeSesion(sesion = {}) {
  return aliasesDeVendedor(sesion.id, sesion.usuario_id, sesion.repartidor_id, sesion.aliases || []);
}

export function solicitudEsDelVendedor(solicitud, aliasesSesion = []) {
  const mios = new Set(aliasesSesion.map(normalizarAliasVendedor));
  return (solicitud?.vendedor_aliases || []).some((a) => mios.has(normalizarAliasVendedor(a)));
}

/** Pendiente de aprobar, o aprobada pero cuyo pago aún no se confirmó (reintento seguro). */
export function solicitudRequiereAccion(s) {
  return s?.estado === 'pendiente' || (s?.estado === 'aprobada' && !s?.aplicada_at);
}

/**
 * Reparte las partes (cargo + monto) entre vendedores. Pura.
 * @param {Array<{cargo, monto, parcial}>} partes
 * @param {Map<string, {ref, nombre, aliases}>} vendedorPorCargo
 */
export function agruparPartesPorVendedor(partes, vendedorPorCargo) {
  const grupos = new Map();
  for (const p of partes) {
    const v = vendedorPorCargo.get(String(p.cargo.id));
    if (!v) return { ok: false, error: `No se identificó al vendedor del folio ${p.cargo.folio_venta || p.cargo.venta_id || p.cargo.id}.` };
    if (!grupos.has(v.ref)) grupos.set(v.ref, { ...v, partes: [] });
    grupos.get(v.ref).partes.push(p);
  }
  return {
    ok: true,
    grupos: [...grupos.values()].map((g) => ({
      ref: g.ref, nombre: g.nombre, aliases: g.aliases, partes: g.partes,
      movimientoIds: g.partes.map((p) => String(p.cargo.id)),
      monto: round2(g.partes.reduce((s, p) => s + p.monto, 0)),
      totalFolios: round2(g.partes.reduce((s, p) => s + (Number(p.cargo.monto) || 0), 0)),
      parcial: g.partes.some((p) => p.parcial),
      folios: g.partes.map((p) => p.cargo.folio_venta || p.cargo.venta_id || String(p.cargo.id)),
    })),
  };
}

export const esCreditoDeRecoleccion = (cargo) => String(cargo?.carga_id || '').startsWith('rec:');

async function leerPorIds(supabase, tabla, ids, columnas = '*') {
  const unicos = [...new Set(ids.filter(Boolean).map(String))];
  const filas = [];
  for (let i = 0; i < unicos.length; i += 100) {
    const { data, error } = await supabase.from(tabla).select(columnas).in('id', unicos.slice(i, i + 100));
    if (error) throw error;
    filas.push(...(data || []));
  }
  return filas;
}

/** Vendedor responsable de cada cargo, con la misma regla que usa el pago atómico. */
export async function resolverVendedoresDeCargos(supabase, cargos, { resolverRepartidor = resolverRepartidorId } = {}) {
  const cargas = await leerPorIds(supabase, 'ruta_cargas', cargos.map((c) => c.carga_id), 'id,vendedor_id,vendedor_nombre');
  const porCarga = new Map(cargas.map((c) => [String(c.id), c]));
  const cache = new Map();
  const porCargo = new Map();
  for (const cargo of cargos) {
    const carga = porCarga.get(String(cargo.carga_id));
    const vendedorId = carga?.vendedor_id || null;
    const nombre = carga?.vendedor_nombre || cargo.usuario_nombre || '';
    if (!vendedorId && !nombre) continue;
    const llave = `${vendedorId || ''}|${nombre}`;
    if (!cache.has(llave)) cache.set(llave, await resolverRepartidor(supabase, vendedorId, nombre));
    const rep = cache.get(llave);
    if (!rep?.ok) continue;
    const aliases = aliasesDeVendedor(vendedorId, rep.id);
    porCargo.set(String(cargo.id), { ref: normalizarAliasVendedor(rep.id), nombre: carga?.vendedor_nombre || nombre || rep.id, aliases });
  }
  return porCargo;
}

/**
 * El cajero pide cobrar. Crea una solicitud por vendedor y NO registra ningún pago.
 * Devuelve `{ ok: true, modo: 'directo' }` cuando son créditos de Recolecciones (sin vendedor de ruta).
 */
export async function solicitarCobroCreditos(supabase, {
  movimientoIds, monto, sucursal, cajeroUser,
} = {}, { resolverVendedores = resolverVendedoresDeCargos, ahora = new Date() } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const ids = [...new Set((movimientoIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { ok: false, error: 'Selecciona al menos un crédito.' };
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: false, error: 'Falta la sucursal.' };
  const cajeroNombre = String(cajeroUser?.nombre || '').trim();
  if (!cajeroNombre) return { ok: false, error: 'Falta el cajero.' };

  try {
    const cargos = await leerPorIds(supabase, 'ruta_cxc_movimientos', ids);
    if (cargos.length !== ids.length || !cargos.every(esCargoPendienteCxc)) {
      return { ok: false, error: 'Un crédito ya fue pagado o cambió. Actualiza la consulta.' };
    }
    if (cargos.some((c) => c.cliente_tipo === 'sucursal' && normalizarCodigoTienda(c.cliente_id) !== suc)) {
      return { ok: false, error: 'Los créditos no pertenecen a la sucursal seleccionada.' };
    }
    const deRecoleccion = cargos.filter(esCreditoDeRecoleccion);
    if (deRecoleccion.length === cargos.length) return { ok: true, modo: 'directo' };
    if (deRecoleccion.length) {
      return { ok: false, error: 'Cobra por separado los créditos de Recolecciones y los de Venta en Ruta.' };
    }

    const reparto = repartirMontoEntreCargos(cargos, monto);
    if (!reparto.ok) return reparto;

    const vendedorPorCargo = await resolverVendedores(supabase, reparto.partes.map((p) => p.cargo));
    const agrupado = agruparPartesPorVendedor(reparto.partes, vendedorPorCargo);
    if (!agrupado.ok) return agrupado;

    const abiertas = await listarSolicitudesAbiertasSucursal(supabase, suc);
    const enUso = new Set(abiertas.flatMap((s) => (s.movimiento_ids || []).map(String)));
    const choque = agrupado.grupos.flatMap((g) => g.movimientoIds).find((id) => enUso.has(id));
    if (choque) {
      return { ok: false, error: 'Ya hay una solicitud de cobro esperando aprobación para alguno de esos folios. Espera la respuesta del vendedor o cancélala.' };
    }

    const filas = agrupado.grupos.map((g) => ({
      sucursal_id: suc,
      tienda: etiquetaTienda(suc) || suc,
      movimiento_ids: g.movimientoIds,
      folios: g.folios,
      monto: g.monto,
      total_folios: g.totalFolios,
      parcial: g.parcial,
      cajero_id: cajeroUser?.id ? String(cajeroUser.id) : null,
      cajero_nombre: cajeroNombre,
      vendedor_ref: g.ref,
      vendedor_nombre: g.nombre,
      vendedor_aliases: g.aliases,
      estado: 'pendiente',
      created_at: ahora.toISOString(),
    }));
    const { data, error } = await supabase.from('ruta_cxc_aprobaciones').insert(filas).select('*');
    if (error) throw error;
    return { ok: true, modo: 'aprobacion', solicitudes: data || [] };
  } catch (e) {
    if (faltaTablaAprobaciones(e)) return { ok: false, faltaTabla: true, error: AVISO_FALTA_APROBACIONES };
    return { ok: false, error: `No se pudo enviar la solicitud: ${e?.message || e}` };
  }
}

async function listarSolicitudesAbiertasSucursal(supabase, sucursal) {
  const { data, error } = await supabase.from('ruta_cxc_aprobaciones').select('*')
    .eq('sucursal_id', sucursal).in('estado', ESTADOS_SOLICITUD_ABIERTA).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).filter(solicitudRequiereAccion);
}

/** Solicitudes que esperan al vendedor (por sus identificadores). */
export async function listarSolicitudesDeVendedor(supabase, aliases = []) {
  const lista = aliasesDeVendedor(aliases);
  if (!supabase || !lista.length) return { ok: true, data: [] };
  const { data, error } = await supabase.from('ruta_cxc_aprobaciones').select('*')
    .overlaps('vendedor_aliases', lista).in('estado', ESTADOS_SOLICITUD_ABIERTA)
    .order('created_at', { ascending: true }).limit(50);
  if (error) {
    if (faltaTablaAprobaciones(error)) return { ok: false, faltaTabla: true, data: [], error: AVISO_FALTA_APROBACIONES };
    return { ok: false, data: [], error: error.message };
  }
  return { ok: true, data: (data || []).filter(solicitudRequiereAccion) };
}

/** Solicitudes recientes de una tienda, para el cajero. */
export async function listarSolicitudesCajero(supabase, { sucursal, dias = 3, ahora = new Date() } = {}) {
  if (!supabase) return { ok: true, data: [] };
  const suc = normalizarCodigoTienda(sucursal);
  const desde = new Date(ahora.getTime() - dias * 86400000).toISOString();
  let q = supabase.from('ruta_cxc_aprobaciones').select('*').gte('created_at', desde)
    .order('created_at', { ascending: false }).limit(60);
  if (suc && suc !== 'MAIN') q = q.eq('sucursal_id', suc);
  const { data, error } = await q;
  if (error) {
    if (faltaTablaAprobaciones(error)) return { ok: false, faltaTabla: true, data: [], error: AVISO_FALTA_APROBACIONES };
    return { ok: false, data: [], error: error.message };
  }
  return { ok: true, data: data || [] };
}

export async function cancelarSolicitudCobro(supabase, { solicitudId, cajeroNombre = null } = {}) {
  const { data, error } = await supabase.from('ruta_cxc_aprobaciones').update({
    estado: 'cancelada', resuelta_por: cajeroNombre, resuelta_at: new Date().toISOString(), motivo: 'Cancelada por el cajero',
  }).eq('id', solicitudId).eq('estado', 'pendiente').select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'La solicitud ya fue respondida.' };
  return { ok: true };
}

async function validarVendedor(supabase, solicitud, { pin, sesion }, verificarPin) {
  const r = await verificarPin(supabase, { pin, vendedorId: sesion?.id, sucursal: sesion?.sucursal_id || solicitud.sucursal_id });
  if (!r.ok) return r;
  const aliases = aliasesDeSesion({ ...sesion, ...r.user, aliases: sesion?.aliases });
  if (!solicitudEsDelVendedor(solicitud, aliases)) {
    return { ok: false, error: 'Esta solicitud es de otro vendedor.' };
  }
  return { ok: true, user: r.user };
}

async function leerSolicitud(supabase, id) {
  const { data, error } = await supabase.from('ruta_cxc_aprobaciones').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'La solicitud ya no existe.' };
  return { ok: true, solicitud: data };
}

/**
 * El vendedor aprueba con su PIN y se ejecuta el pago atómico.
 * El pago usa `pago_id` como identificador de solicitud, así que reintentar nunca cobra dos veces.
 */
export async function aprobarSolicitudCobro(supabase, { solicitudId, pin, sesion } = {}, {
  verificarPin = verificarPinVendedorSesionRuta, pagar = pagarCreditosRutaConPin,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const leida = await leerSolicitud(supabase, solicitudId);
  if (!leida.ok) return leida;
  const { solicitud } = leida;
  if (!solicitudRequiereAccion(solicitud)) {
    return { ok: false, error: `La solicitud ya está ${solicitud.estado}.` };
  }
  const val = await validarVendedor(supabase, solicitud, { pin, sesion }, verificarPin);
  if (!val.ok) return val;

  let reclamada = solicitud.estado === 'aprobada';
  if (!reclamada) {
    const { data, error } = await supabase.from('ruta_cxc_aprobaciones').update({
      estado: 'aprobada', resuelta_por: val.user?.nombre || sesion?.nombre || null, resuelta_at: new Date().toISOString(),
    }).eq('id', solicitud.id).eq('estado', 'pendiente').select('id');
    if (error) return { ok: false, error: error.message };
    reclamada = Boolean(data?.length);
  }
  if (!reclamada) return { ok: false, error: 'La solicitud ya fue respondida.' };

  let pago;
  try {
    pago = await pagar(supabase, {
      movimientoIds: solicitud.movimiento_ids,
      sucursal: solicitud.sucursal_id,
      cajeroUser: { id: solicitud.cajero_id, nombre: solicitud.cajero_nombre },
      montoPagar: Number(solicitud.monto),
      solicitudId: solicitud.pago_id,
    });
  } catch (e) {
    pago = { ok: false, error: e?.message || String(e) };
  }
  if (!pago?.ok) {
    await supabase.from('ruta_cxc_aprobaciones').update({ estado: 'pendiente', resuelta_por: null, resuelta_at: null })
      .eq('id', solicitud.id).eq('estado', 'aprobada').is('aplicada_at', null);
    return { ok: false, error: pago?.error || 'No se pudo registrar el pago.' };
  }
  const { error: eFin } = await supabase.from('ruta_cxc_aprobaciones').update({
    aplicada_at: new Date().toISOString(), resultado: pago,
  }).eq('id', solicitud.id);
  return { ok: true, pago, aviso: eFin ? 'El pago se registró, pero no se pudo actualizar el estado de la solicitud.' : null };
}

export async function rechazarSolicitudCobro(supabase, { solicitudId, pin, sesion, motivo = '' } = {}, {
  verificarPin = verificarPinVendedorSesionRuta,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const leida = await leerSolicitud(supabase, solicitudId);
  if (!leida.ok) return leida;
  if (leida.solicitud.estado !== 'pendiente') return { ok: false, error: `La solicitud ya está ${leida.solicitud.estado}.` };
  const val = await validarVendedor(supabase, leida.solicitud, { pin, sesion }, verificarPin);
  if (!val.ok) return val;
  const { data, error } = await supabase.from('ruta_cxc_aprobaciones').update({
    estado: 'rechazada', motivo: String(motivo || '').trim() || null,
    resuelta_por: val.user?.nombre || sesion?.nombre || null, resuelta_at: new Date().toISOString(),
  }).eq('id', solicitudId).eq('estado', 'pendiente').select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'La solicitud ya fue respondida.' };
  return { ok: true };
}
