/**
 * El cajero entrega el abono de fin de año. El repartidor lo recibe y lo aprueba
 * con su PIN. Hasta esa aprobación no hay abono ni gasto en Abarrotes.
 * Si lo rechaza, la operación se cancela.
 */

import { esSucursalRuta, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { aliasesDeSesion, aliasesDeVendedor, solicitudEsDelVendedor } from './rutaCxcAprobacion.js';
import { verificarPinVendedorSesionRuta } from './ventaEnRuta.js';
import {
  crearCuentaFinAnio,
  cuentaAbiertaDeTienda,
  listarAbonosFinAnio,
  listarCuentasFinAnio,
  listarMovimientosFinAnio,
  registrarAbonoFinAnio,
  validarAbono,
} from './creditoFinAnio.js';

export const TABLA_SOLICITUDES_ABONO = 'credito_fin_anio_abono_solicitudes';

export const AVISO_FALTA_SOLICITUD_ABONO =
  'Para que el repartidor apruebe el abono, ejecuta supabase/fix_credito_fin_anio.sql. No se registró el abono ni el gasto.';

export function faltaTablaSolicitudAbono(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || error?.code === 'PGRST205' || msg.includes('credito_fin_anio_abono_solicitudes');
}

export function solicitudAbonoPendiente(s) {
  return s && !s.archived_at && (s.estado === 'pendiente' || (s.estado === 'aprobada' && !s.aplicada_at));
}

export async function listarRepartidoresParaAbono(supabase) {
  if (!supabase) return { ok: false, data: [], error: 'Sin conexión.' };
  const { data, error } = await supabase
    .from('repartidores')
    .select('id, nombre, activo')
    .eq('activo', true)
    .order('nombre');
  if (error) return { ok: false, data: [], error: error.message || 'No se pudieron leer los repartidores.' };
  return { ok: true, data: (data || []).filter((r) => r?.id && r.activo !== false) };
}

/** Cuenta de la tienda donde el cajero deja el abono. Si no hay, se abre una de cuetes. */
export async function asegurarCuentaAbonoCuetes(supabase, sucursalId, user) {
  const sid = normalizarCodigoTienda(sucursalId);
  if (!sid) return { ok: false, error: 'Falta la tienda.' };
  const cuentas = await listarCuentasFinAnio(supabase);
  if (cuentas.error && !cuentas.data) return { ok: false, error: cuentas.error || 'No se pudieron leer las cuentas.' };
  const abierta = cuentaAbiertaDeTienda(cuentas.data, [], [], sid);
  if (abierta?.id) return { ok: true, cuenta: abierta };
  const creada = await crearCuentaFinAnio(supabase, {
    sucursalId: sid,
    nombre: 'Cuetes',
    notas: 'Abonos del crédito de cuetes',
    user,
  });
  if (!creada.ok) return creada;
  return { ok: true, cuenta: creada.data };
}

export async function solicitarAbonoFinAnio(supabase, {
  cuentaId, sucursalId, monto, notas, repartidorId, repartidorNombre, cajero,
} = {}) {
  const errorVal = validarAbono(monto);
  if (errorVal) return { ok: false, error: errorVal };
  if (!cuentaId) return { ok: false, error: 'Abre una cuenta primero.' };
  if (!sucursalId) return { ok: false, error: 'Falta la tienda.' };
  if (!repartidorId) return { ok: false, error: 'Elige al repartidor que recibe el dinero.' };
  const cajeroNombre = String(cajero?.nombre || '').trim();
  if (!cajeroNombre) return { ok: false, error: 'Falta el cajero.' };

  const abiertas = await listarSolicitudesAbonoCuenta(supabase, cuentaId);
  if (abiertas.faltaTabla) return { ok: false, error: AVISO_FALTA_SOLICITUD_ABONO };
  if (!abiertas.ok) return { ok: false, error: abiertas.error };
  if ((abiertas.data || []).some(solicitudAbonoPendiente)) {
    return { ok: false, error: 'Ya hay un abono esperando la aprobación del repartidor.' };
  }

  const { data, error } = await supabase.from(TABLA_SOLICITUDES_ABONO).insert({
    cuenta_id: cuentaId,
    sucursal_id: String(sucursalId).toUpperCase(),
    monto: Math.round((Number(monto) || 0) * 100) / 100,
    notas: String(notas || '').trim() || null,
    cajero_id: cajero?.id ? String(cajero.id) : null,
    cajero_nombre: cajeroNombre,
    repartidor_id: String(repartidorId),
    repartidor_nombre: String(repartidorNombre || '').trim() || null,
    repartidor_aliases: aliasesDeVendedor(repartidorId),
    estado: 'pendiente',
  }).select('*').single();
  if (error && faltaTablaSolicitudAbono(error)) return { ok: false, error: AVISO_FALTA_SOLICITUD_ABONO };
  if (error) return { ok: false, error: error.message || 'No se pudo enviar el abono.' };
  return { ok: true, solicitud: data };
}

export async function listarSolicitudesAbonoCuenta(supabase, cuentaId) {
  if (!supabase || !cuentaId) return { ok: true, data: [] };
  const { data, error } = await supabase.from(TABLA_SOLICITUDES_ABONO).select('*')
    .eq('cuenta_id', cuentaId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error && faltaTablaSolicitudAbono(error)) return { ok: false, faltaTabla: true, data: [], error: AVISO_FALTA_SOLICITUD_ABONO };
  if (error) return { ok: false, data: [], error: error.message };
  return { ok: true, data: data || [] };
}

export async function listarSolicitudesAbonoDeRepartidor(supabase, aliases = []) {
  const lista = aliasesDeVendedor(aliases);
  if (!supabase || !lista.length) return { ok: true, data: [] };
  const { data, error } = await supabase.from(TABLA_SOLICITUDES_ABONO).select('*')
    .overlaps('repartidor_aliases', lista)
    .in('estado', ['pendiente', 'aprobada'])
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error && faltaTablaSolicitudAbono(error)) return { ok: false, faltaTabla: true, data: [], error: AVISO_FALTA_SOLICITUD_ABONO };
  if (error) return { ok: false, data: [], error: error.message };
  return { ok: true, data: (data || []).filter(solicitudAbonoPendiente) };
}

async function leerSolicitud(supabase, id) {
  const { data, error } = await supabase.from(TABLA_SOLICITUDES_ABONO).select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'La solicitud ya no existe.' };
  return { ok: true, solicitud: data };
}

async function validarRepartidor(supabase, solicitud, { pin, sesion }, verificarPin) {
  const r = await verificarPin(supabase, {
    pin,
    vendedorId: sesion?.id,
    sucursal: sesion?.sucursal_id || solicitud.sucursal_id,
  });
  if (!r.ok) return r;
  const aliases = aliasesDeSesion({
    ...sesion,
    ...r.user,
    aliases: [...(sesion?.aliases || []), r.user?.repartidor_id],
  });
  if (!solicitudEsDelVendedor({ vendedor_aliases: solicitud.repartidor_aliases }, aliases)) {
    return { ok: false, error: 'Este abono es de otro repartidor.' };
  }
  return { ok: true, user: r.user };
}

export async function aprobarSolicitudAbonoFinAnio(supabase, { solicitudId, pin, sesion } = {}, {
  verificarPin = verificarPinVendedorSesionRuta,
  aplicar = registrarAbonoFinAnio,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const leida = await leerSolicitud(supabase, solicitudId);
  if (!leida.ok) return leida;
  const { solicitud } = leida;
  if (!solicitudAbonoPendiente(solicitud)) return { ok: false, error: `La solicitud ya está ${solicitud.estado}.` };
  const val = await validarRepartidor(supabase, solicitud, { pin, sesion }, verificarPin);
  if (!val.ok) return val;

  let reclamada = solicitud.estado === 'aprobada';
  if (!reclamada) {
    const { data, error } = await supabase.from(TABLA_SOLICITUDES_ABONO).update({
      estado: 'aprobada',
      resuelta_por: val.user?.nombre || sesion?.nombre || null,
      resuelta_at: new Date().toISOString(),
    }).eq('id', solicitud.id).eq('estado', 'pendiente').select('id');
    if (error) return { ok: false, error: error.message };
    reclamada = Boolean(data?.length);
  }
  if (!reclamada) return { ok: false, error: 'La solicitud ya fue respondida.' };

  const [cuentas, movimientos, abonos] = await Promise.all([
    listarCuentasFinAnio(supabase),
    listarMovimientosFinAnio(supabase),
    listarAbonosFinAnio(supabase),
  ]);
  const tiendas = listarSucursalesOperativas().filter((s) => !esSucursalRuta(s));
  let aplicado;
  try {
    aplicado = await aplicar(supabase, solicitud.cuenta_id, {
      monto: solicitud.monto,
      notas: solicitud.notas,
      sucursalId: solicitud.sucursal_id,
      tiendas,
      cuentas: cuentas.data,
      movimientos: movimientos.data,
      abonos: abonos.data,
    }, { id: solicitud.cajero_id, nombre: solicitud.cajero_nombre });
  } catch (e) {
    aplicado = { ok: false, error: e?.message || String(e) };
  }
  if (!aplicado?.ok) {
    await supabase.from(TABLA_SOLICITUDES_ABONO).update({ estado: 'pendiente', resuelta_por: null, resuelta_at: null })
      .eq('id', solicitud.id).eq('estado', 'aprobada').is('aplicada_at', null);
    return { ok: false, error: aplicado?.error || 'No se pudo registrar el abono.' };
  }
  await supabase.from(TABLA_SOLICITUDES_ABONO).update({
    aplicada_at: new Date().toISOString(),
    abono_id: aplicado.abonoId || null,
  }).eq('id', solicitud.id);
  return { ok: true, aviso: aplicado.aviso || null };
}

export async function rechazarSolicitudAbonoFinAnio(supabase, { solicitudId, pin, sesion, motivo = '' } = {}, {
  verificarPin = verificarPinVendedorSesionRuta,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const leida = await leerSolicitud(supabase, solicitudId);
  if (!leida.ok) return leida;
  if (leida.solicitud.estado !== 'pendiente') return { ok: false, error: `La solicitud ya está ${leida.solicitud.estado}.` };
  const val = await validarRepartidor(supabase, leida.solicitud, { pin, sesion }, verificarPin);
  if (!val.ok) return val;
  const { data, error } = await supabase.from(TABLA_SOLICITUDES_ABONO).update({
    estado: 'rechazada',
    motivo: String(motivo || '').trim() || 'Rechazado por el repartidor',
    resuelta_por: val.user?.nombre || sesion?.nombre || null,
    resuelta_at: new Date().toISOString(),
  }).eq('id', solicitudId).eq('estado', 'pendiente').select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'La solicitud ya fue respondida.' };
  return { ok: true };
}

export async function cancelarSolicitudAbonoFinAnio(supabase, { solicitudId, cajeroNombre = null } = {}) {
  const { data, error } = await supabase.from(TABLA_SOLICITUDES_ABONO).update({
    estado: 'cancelada',
    motivo: 'Cancelada por el cajero',
    resuelta_por: cajeroNombre,
    resuelta_at: new Date().toISOString(),
  }).eq('id', solicitudId).eq('estado', 'pendiente').select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'La solicitud ya fue respondida.' };
  return { ok: true };
}
