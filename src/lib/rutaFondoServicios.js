/**
 * Fondo de servicios (CFE y otros) — Venta en Ruta.
 * Recolector solicita → cajero aprueba con PIN → gasto en corte → ledger Fondo
 * (ingresos / egresos por servicio en RC/VentaRuta → pestaña Fondo).
 */

import { normalizarCodigoTienda, etiquetaTienda, equivalentesCodigoTienda } from '../constants/sucursales.js';
import { MODULOS_CORTE, etiquetaModuloCorte } from './corteContabilidad/store.js';
import { listarServiciosCobro } from './controlEfectivo.js';
import { verificarPinCajero } from './rutaCxc.js';
import {
  acreditarLiquidacionCuentaRt,
  asegurarCuentaServicios,
  CUENTA_RT_SERVICIOS_ID,
  CUENTAS_RT_LIQUIDACION_SERVICIOS,
  etiquetaCuentaRt,
} from './rtCuentas.js';
import {
  crearNotificacion,
  marcarNotificacionAtendida,
  TIPOS_NOTIF,
} from './contabilidadNotificaciones.js';

export { CUENTAS_RT_LIQUIDACION_SERVICIOS as CUENTAS_RT };
/** Fondo de servicios liquida hacia la cuenta RT Servicios (luego → Tesorería Cheche). */
export const CUENTA_RT_FONDO_DEFAULT = CUENTA_RT_SERVICIOS_ID;

export const AVISO_FALTA_FONDO =
  'Faltan tablas de Fondo servicios. En Supabase ejecuta supabase/fix_ruta_fondo_servicios.sql';

export const MODULOS_CORTE_FONDO = MODULOS_CORTE;

function faltaTabla(error) {
  const m = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || m.includes('does not exist')
    || m.includes('schema cache')
    || m.includes('ruta_fondo_')
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function etiquetaModuloCorteFondo(mod) {
  return etiquetaModuloCorte(mod) || String(mod || 'abarrotes');
}

/** Solicitud de cobro desde el celular del recolector. */
export async function solicitarCobroServicioRuta(supabase, {
  servicio,
  monto,
  sucursalId,
  moduloCorte = 'abarrotes',
  repartidorId = null,
  repartidorNombre = null,
  solicitadoPor = null,
  nota = '',
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!servicio?.clave) return { ok: false, error: 'Selecciona un servicio.' };
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
  const suc = normalizarCodigoTienda(sucursalId) || String(sucursalId || '').trim();
  if (!suc) return { ok: false, error: 'Selecciona la tienda.' };
  const mod = String(moduloCorte || 'abarrotes').toLowerCase();
  if (!MODULOS_CORTE.includes(mod)) {
    return { ok: false, error: 'Corte inválido (abarrotes, virtual o garage).' };
  }

  const row = {
    estado: 'pendiente',
    servicio_clave: String(servicio.clave).toUpperCase(),
    servicio_nombre: String(servicio.nombre || servicio.clave),
    servicio_id: servicio.id != null ? Number(servicio.id) : null,
    monto: m,
    sucursal_id: suc,
    modulo_corte: mod,
    repartidor_id: repartidorId ? String(repartidorId) : null,
    repartidor_nombre: repartidorNombre || null,
    solicitado_por: solicitadoPor || repartidorNombre || null,
    nota: String(nota || '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ruta_fondo_solicitudes')
    .insert([row])
    .select('*')
    .single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_FONDO, aviso: AVISO_FALTA_FONDO };
  if (error) return { ok: false, error: error.message };

  // silenciosoLocal: no dispara banner en el celular del recolector;
  // la caja de la tienda lo ve por Realtime / poll del overlay.
  const notif = await crearNotificacion(
    supabase,
    {
      sucursal_id: suc,
      tipo: TIPOS_NOTIF.FONDO_SERVICIO_PIN,
      ref_tabla: 'ruta_fondo_solicitudes',
      ref_id: data.id,
      titulo: `Cobro ${row.servicio_nombre} · $${m.toFixed(2)}`,
      mensaje:
        `${repartidorNombre || 'Recolector'} solicita cobrar ${row.servicio_nombre} `
        + `en ${etiquetaTienda(suc)} · corte ${etiquetaModuloCorteFondo(mod)}.\n`
        + 'Aprueba con tu PIN de cajero para cargar el gasto y registrar el Fondo.',
    },
    { silenciosoLocal: true, skipPush: true },
  );

  if (!notif?.ok) {
    return {
      ok: true,
      data,
      notificacionId: null,
      aviso: notif?.error || notif?.aviso || 'Solicitud creada, pero no se pudo avisar a la caja. Pide al cajero Actualizar.',
    };
  }

  return {
    ok: true,
    data,
    notificacionId: notif?.id || null,
    aviso: notif?.aviso || null,
  };
}

export async function listarSolicitudesFondoPendientes(supabase, { sucursalId = null, limit = 40 } = {}) {
  if (!supabase) return { data: [] };
  let q = supabase
    .from('ruta_fondo_solicitudes')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sucursalId) {
    const eqs = equivalentesCodigoTienda(sucursalId);
    if (eqs.length > 1) q = q.in('sucursal_id', eqs);
    else q = q.eq('sucursal_id', normalizarCodigoTienda(sucursalId) || sucursalId);
  }
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_FONDO };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function obtenerSolicitudFondo(supabase, id) {
  if (!supabase || !id) return { data: null };
  const { data, error } = await supabase
    .from('ruta_fondo_solicitudes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error && faltaTabla(error)) return { data: null, aviso: AVISO_FALTA_FONDO };
  if (error) return { data: null, error: error.message };
  return { data };
}

/**
 * Cajero aprueba con PIN:
 * 1) gasto en el corte elegido (default abarrotes)
 * 2) ingreso al ledger Fondo
 * 3) marca solicitud aprobada + atiende notificación
 */
export async function aprobarCobroServicioConPin(supabase, {
  solicitudId,
  pin,
  sucursal,
  cajeroUser = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!solicitudId) return { ok: false, error: 'Solicitud inválida.' };

  let auth;
  if (cajeroUser?.id || cajeroUser?.nombre) {
    auth = { ok: true, user: cajeroUser };
  } else {
    auth = await verificarPinCajero(supabase, pin, sucursal);
    if (!auth.ok) return auth;
  }

  const { data: sol, error: eSol } = await supabase
    .from('ruta_fondo_solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (eSol && faltaTabla(eSol)) return { ok: false, error: AVISO_FALTA_FONDO, aviso: AVISO_FALTA_FONDO };
  if (eSol) return { ok: false, error: eSol.message };
  if (!sol) return { ok: false, error: 'Solicitud no encontrada.' };
  if (sol.estado !== 'pendiente') return { ok: false, error: `La solicitud ya está ${sol.estado}.` };

  const monto = round2(sol.monto);
  const mod = String(sol.modulo_corte || 'abarrotes').toLowerCase();
  const sucGasto = normalizarCodigoTienda(sol.sucursal_id) || sol.sucursal_id;

  const gastoPayload = {
    sucursal_id: sucGasto,
    modulo: mod,
    categoria: 'SERVICIO RUTA',
    subcategoria: String(sol.servicio_clave || 'SERVICIO').toUpperCase(),
    comentario:
      `Fondo · ${sol.servicio_nombre} · ${sol.repartidor_nombre || 'Recolector'} · sol ${String(sol.id).slice(0, 8)}`.trim(),
    monto,
    usuario_nombre: auth.user?.nombre || null,
    cerrado: false,
    descontado_nomina: false,
    estado_aprobacion: 'aprobado',
    solicitado_por: sol.repartidor_nombre || sol.solicitado_por || null,
  };

  let { data: gasto, error: eGasto } = await supabase
    .from('cortes_contabilidad_gastos')
    .insert([gastoPayload])
    .select('id')
    .single();
  if (eGasto && /estado_aprobacion|schema cache|column/i.test(String(eGasto.message || ''))) {
    delete gastoPayload.estado_aprobacion;
    ({ data: gasto, error: eGasto } = await supabase
      .from('cortes_contabilidad_gastos')
      .insert([gastoPayload])
      .select('id')
      .single());
  }
  if (eGasto) return { ok: false, error: `Gasto corte: ${eGasto.message}` };

  const movPayload = {
    tipo: 'ingreso',
    servicio_clave: sol.servicio_clave,
    servicio_nombre: sol.servicio_nombre,
    monto,
    sucursal_id: sucGasto,
    modulo_corte: mod,
    repartidor_id: sol.repartidor_id,
    repartidor_nombre: sol.repartidor_nombre,
    cajero_nombre: auth.user?.nombre || null,
    usuario_nombre: auth.user?.nombre || null,
    concepto: `Cobro aprobado · ${etiquetaTienda(sucGasto)} · corte ${etiquetaModuloCorteFondo(mod)}`,
    solicitud_id: sol.id,
    gasto_id: gasto?.id ? String(gasto.id) : null,
  };

  const { data: mov, error: eMov } = await supabase
    .from('ruta_fondo_movimientos')
    .insert([movPayload])
    .select('*')
    .single();
  if (eMov && faltaTabla(eMov)) return { ok: false, error: AVISO_FALTA_FONDO, aviso: AVISO_FALTA_FONDO };
  if (eMov) return { ok: false, error: `Fondo: ${eMov.message}` };

  const ahora = new Date().toISOString();
  const { error: eUp } = await supabase
    .from('ruta_fondo_solicitudes')
    .update({
      estado: 'aprobado',
      cajero_id: auth.user?.id ? String(auth.user.id) : null,
      cajero_nombre: auth.user?.nombre || null,
      aprobado_at: ahora,
      gasto_id: gasto?.id ? String(gasto.id) : null,
      movimiento_fondo_id: mov?.id || null,
      updated_at: ahora,
    })
    .eq('id', sol.id)
    .eq('estado', 'pendiente');
  if (eUp) return { ok: false, error: eUp.message };

  try {
    await marcarNotificacionAtendida(
      supabase,
      'ruta_fondo_solicitudes',
      sol.id,
      auth.user?.nombre || 'caja',
    );
  } catch {
    /* no bloquear */
  }

  return {
    ok: true,
    data: { solicitudId: sol.id, gastoId: gasto?.id, movimiento: mov },
  };
}

export async function rechazarCobroServicio(supabase, {
  solicitudId,
  pin,
  sucursal,
  motivo = '',
  cajeroUser = null,
} = {}) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  let auth;
  if (cajeroUser?.id || cajeroUser?.nombre) {
    auth = { ok: true, user: cajeroUser };
  } else {
    auth = await verificarPinCajero(supabase, pin, sucursal);
    if (!auth.ok) return auth;
  }
  const { error } = await supabase
    .from('ruta_fondo_solicitudes')
    .update({
      estado: 'rechazado',
      motivo_rechazo: String(motivo || 'Rechazado en caja').trim(),
      cajero_id: auth.user?.id ? String(auth.user.id) : null,
      cajero_nombre: auth.user?.nombre || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', solicitudId)
    .eq('estado', 'pendiente');
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_FONDO };
  if (error) return { ok: false, error: error.message };
  try {
    await marcarNotificacionAtendida(
      supabase,
      'ruta_fondo_solicitudes',
      solicitudId,
      auth.user?.nombre || 'caja',
    );
  } catch {
    /* ignore */
  }
  return { ok: true };
}

export async function cancelarSolicitudFondo(supabase, { solicitudId, por = null } = {}) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const { error } = await supabase
    .from('ruta_fondo_solicitudes')
    .update({
      estado: 'cancelado',
      motivo_rechazo: por ? `Cancelado por ${por}` : 'Cancelado',
      updated_at: new Date().toISOString(),
    })
    .eq('id', solicitudId)
    .eq('estado', 'pendiente');
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_FONDO };
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Retiro de efectivo del Fondo para pagar el servicio (egreso). */
export async function retirarFondoServicio(supabase, {
  servicioClave,
  servicioNombre = null,
  monto,
  concepto = '',
  usuarioNombre = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const clave = String(servicioClave || '').trim().toUpperCase();
  if (!clave) return { ok: false, error: 'Selecciona el servicio.' };
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };

  const saldo = await saldoFondoServicio(supabase, clave);
  if (saldo.aviso) return { ok: false, error: saldo.aviso, aviso: saldo.aviso };
  if (saldo.error) return { ok: false, error: saldo.error };
  if (m > round2(saldo.saldo) + 0.001) {
    return { ok: false, error: `Saldo insuficiente en ${clave} (${round2(saldo.saldo).toFixed(2)}).` };
  }

  let nombre = servicioNombre;
  if (!nombre) {
    const srvs = await listarServiciosCobro(supabase);
    nombre = srvs.find((s) => String(s.clave).toUpperCase() === clave)?.nombre || clave;
  }

  const { data, error } = await supabase
    .from('ruta_fondo_movimientos')
    .insert([{
      tipo: 'egreso',
      servicio_clave: clave,
      servicio_nombre: nombre,
      monto: m,
      usuario_nombre: usuarioNombre || null,
      concepto: String(concepto || `Retiro para pago ${nombre}`).trim(),
      meta: { origen: 'retiro_pago' },
    }])
    .select('*')
    .single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_FONDO, aviso: AVISO_FALTA_FONDO };
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * Liquida saldo del Fondo (servicios) a la cuenta RT Servicios.
 * Separado de la liquidación de mercancía (Francisco).
 * Desde Servicios se transfieren fondos a Tesorería (Cheche).
 */
export async function liquidarFondoACuentaRt(supabase, {
  servicioClave = null,
  monto = null,
  cuentaRtId = CUENTA_RT_FONDO_DEFAULT,
  usuarioNombre = null,
  concepto = '',
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const cuentaId = String(cuentaRtId || CUENTA_RT_FONDO_DEFAULT).trim() || CUENTA_RT_FONDO_DEFAULT;
  if (!CUENTAS_RT_LIQUIDACION_SERVICIOS.some((c) => c.id === cuentaId)) {
    return { ok: false, error: 'Las liquidaciones de servicios solo van a la cuenta Servicios.' };
  }
  const ensure = await asegurarCuentaServicios(supabase);
  if (!ensure.ok) return ensure;

  const movs = await listarMovimientosFondo(supabase, { limit: 2000 });
  if (movs.aviso) return { ok: false, error: movs.aviso, aviso: movs.aviso };
  if (movs.error) return { ok: false, error: movs.error };
  const catalogo = await listarServiciosCobro(supabase);
  const resumen = resumirFondoPorServicio(movs.data || [], catalogo);
  const conSaldo = resumen.filter((r) => (Number(r.saldo) || 0) > 0.001);

  let targets;
  if (servicioClave) {
    const clave = String(servicioClave).toUpperCase();
    const row = resumen.find((r) => r.clave === clave);
    if (!row || !(row.saldo > 0.001)) {
      return { ok: false, error: `Sin saldo en Fondo para ${clave}.` };
    }
    targets = [row];
  } else {
    targets = conSaldo;
  }
  if (!targets.length) return { ok: false, error: 'El Fondo no tiene saldo para liquidar.' };

  const resultados = [];
  let total = 0;

  for (const row of targets) {
    let m = monto != null && monto !== '' && servicioClave
      ? round2(monto)
      : round2(row.saldo);
    if (!(m > 0)) continue;
    if (m > round2(row.saldo) + 0.001) {
      return { ok: false, error: `Monto mayor al saldo de ${row.clave} (${row.saldo.toFixed(2)}).` };
    }

    const notas =
      String(concepto || '').trim()
      || `Liquidación Fondo servicios · ${row.nombre} → ${etiquetaCuentaRt(cuentaId)} (separado de venta)`;

    const acred = await acreditarLiquidacionCuentaRt(supabase, {
      cuentaId,
      montoTotal: m,
      usuarioNombre,
      repartidorNombre: null,
      notas,
      movimientoIds: [],
      tipoPartida: 'servicios',
    });
    if (!acred.ok) return acred;

    const { data: egreso, error: eEg } = await supabase
      .from('ruta_fondo_movimientos')
      .insert([{
        tipo: 'egreso',
        servicio_clave: row.clave,
        servicio_nombre: row.nombre,
        monto: m,
        usuario_nombre: usuarioNombre || null,
        concepto: notas,
        meta: {
          origen: 'liquidacion_cuenta_rt',
          cuenta_rt_id: cuentaId,
          cuenta_rt_nombre: etiquetaCuentaRt(cuentaId),
        },
      }])
      .select('*')
      .single();
    if (eEg && faltaTabla(eEg)) return { ok: false, error: AVISO_FALTA_FONDO, aviso: AVISO_FALTA_FONDO };
    if (eEg) return { ok: false, error: eEg.message };

    resultados.push({ servicio: row.clave, monto: m, movimiento: egreso, cuentaId });
    total = round2(total + m);
  }

  if (!resultados.length) return { ok: false, error: 'No se liquidó ningún servicio.' };
  return {
    ok: true,
    data: {
      cuentaId,
      cuentaNombre: etiquetaCuentaRt(cuentaId),
      total,
      items: resultados,
    },
  };
}

export async function listarMovimientosFondo(supabase, { servicioClave = null, limit = 200 } = {}) {
  if (!supabase) return { data: [] };
  let q = supabase
    .from('ruta_fondo_movimientos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (servicioClave) q = q.eq('servicio_clave', String(servicioClave).toUpperCase());
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_FONDO };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function saldoFondoServicio(supabase, servicioClave) {
  const r = await listarMovimientosFondo(supabase, { servicioClave, limit: 2000 });
  if (r.aviso || r.error) return { saldo: 0, ingresos: 0, egresos: 0, aviso: r.aviso, error: r.error };
  let ingresos = 0;
  let egresos = 0;
  for (const m of r.data || []) {
    if (m.tipo === 'ingreso') ingresos = round2(ingresos + (Number(m.monto) || 0));
    else if (m.tipo === 'egreso') egresos = round2(egresos + (Number(m.monto) || 0));
  }
  return { saldo: round2(ingresos - egresos), ingresos, egresos };
}

/** Resumen por servicio (catálogo RT + saldos del ledger). */
export function resumirFondoPorServicio(movimientos = [], serviciosCatalogo = []) {
  const map = new Map();
  for (const s of serviciosCatalogo || []) {
    const clave = String(s.clave || '').toUpperCase();
    if (!clave) continue;
    map.set(clave, {
      clave,
      nombre: s.nombre || clave,
      activo: s.activo !== false,
      ingresos: 0,
      egresos: 0,
      saldo: 0,
      movimientos: 0,
    });
  }
  for (const m of movimientos || []) {
    const clave = String(m.servicio_clave || '').toUpperCase();
    if (!clave) continue;
    if (!map.has(clave)) {
      map.set(clave, {
        clave,
        nombre: m.servicio_nombre || clave,
        activo: true,
        ingresos: 0,
        egresos: 0,
        saldo: 0,
        movimientos: 0,
      });
    }
    const row = map.get(clave);
    row.movimientos += 1;
    if (m.tipo === 'ingreso') row.ingresos = round2(row.ingresos + (Number(m.monto) || 0));
    else if (m.tipo === 'egreso') row.egresos = round2(row.egresos + (Number(m.monto) || 0));
    row.saldo = round2(row.ingresos - row.egresos);
    if (m.servicio_nombre) row.nombre = m.servicio_nombre;
  }
  return [...map.values()].sort((a, b) => a.clave.localeCompare(b.clave, 'es'));
}

export function totalesFondo(resumenServicios = []) {
  let ingresos = 0;
  let egresos = 0;
  for (const r of resumenServicios) {
    ingresos = round2(ingresos + (Number(r.ingresos) || 0));
    egresos = round2(egresos + (Number(r.egresos) || 0));
  }
  return { ingresos, egresos, saldo: round2(ingresos - egresos) };
}
