/**
 * Sistema de coberturas CT (v1 / base).
 * - Catálogo: rh_empleados tipo cubre_turno (independiente de planta).
 * - Disponibilidad: verde disponible / rojo cubriendo o hold.
 * - Tienda solicita CT para un descanso → CT acepta → PIN temporal.
 * - Si acepta y no cumple → hold 7 días → liberación automática.
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { crearNotificacion } from './contabilidadNotificaciones.js';
import { generarPinCubreTurnoAleatorio, normalizarPinComparacion } from './cubreTurno.js';

export const AVISO_FALTA_CUBRE_SOLICITUDES =
  'Falta la tabla de coberturas CT. Ejecuta supabase/fix_cubre_solicitudes.sql en Supabase.';

export const DIAS_HOLD_CT_MS = 7 * 24 * 60 * 60 * 1000;

export const ESTADOS_SOLICITUD_CT = {
  solicitada: 'Solicitada',
  aceptada: 'Aceptada (PIN activo)',
  rechazada: 'Rechazada',
  cumplida: 'Cumplida',
  no_show: 'No cumplió',
  retenida: 'En hold',
  liberada: 'Hold liberado',
  cancelada: 'Cancelada',
};

const ESTADOS_OCUPAN_CT = new Set(['solicitada', 'aceptada']);

function roundPin4() {
  return generarPinCubreTurnoAleatorio();
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || (msg.includes('pos_cubre_solicitudes') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

function nombreRh(e) {
  if (e?.nombre_completo) return String(e.nombre_completo).trim();
  return [e?.nombre, e?.apellidos].filter(Boolean).join(' ').trim();
}

function extrasCt(e) {
  const x = e?.extras && typeof e.extras === 'object' ? e.extras : {};
  return x;
}

/** Libera holds vencidos en extras RH (best-effort). */
export async function liberarHoldsCtVencidos(supabase) {
  if (!supabase) return { ok: true, liberados: 0 };
  const ahora = Date.now();
  const { data, error } = await supabase
    .from('rh_empleados')
    .select('id, extras, nombre_completo, nombre, apellidos')
    .eq('tipo_empleado', 'cubre_turno')
    .eq('estado', 'activo')
    .limit(300);
  if (error) return { ok: false, error: error.message, liberados: 0 };
  let liberados = 0;
  for (const e of data || []) {
    const ex = extrasCt(e);
    const until = ex.ct_hold_until ? Date.parse(ex.ct_hold_until) : NaN;
    if (!Number.isFinite(until) || until > ahora) continue;
    const nextExtras = { ...ex, ct_disponibilidad: 'disponible' };
    delete nextExtras.ct_hold_until;
    const { error: upErr } = await supabase
      .from('rh_empleados')
      .update({ extras: nextExtras, updated_at: new Date().toISOString() })
      .eq('id', e.id);
    if (!upErr) liberados += 1;
  }
  // Solicitudes retenidas vencidas → liberada
  try {
    await supabase
      .from('pos_cubre_solicitudes')
      .update({ estado: 'liberada', updated_at: new Date().toISOString() })
      .eq('estado', 'retenida')
      .lt('hold_until', new Date().toISOString());
  } catch {
    /* ignore */
  }
  return { ok: true, liberados };
}

/**
 * Estado visual del CT.
 * @returns {'disponible'|'cubriendo'|'hold'|'baja'|'no_disponible'}
 */
export function estadoDisponibilidadCt(empleadoRh, solicitudesActivas = []) {
  if (!empleadoRh || empleadoRh.estado === 'baja') return 'baja';
  const ex = extrasCt(empleadoRh);
  const until = ex.ct_hold_until ? Date.parse(ex.ct_hold_until) : NaN;
  if (Number.isFinite(until) && until > Date.now()) return 'hold';
  if (String(ex.ct_disponibilidad || '').toLowerCase() === 'no_disponible') return 'no_disponible';
  const id = String(empleadoRh.id);
  const ocupado = (solicitudesActivas || []).some(
    (s) => String(s.ct_rh_id) === id && ESTADOS_OCUPAN_CT.has(String(s.estado || '')),
  );
  if (ocupado) return 'cubriendo';
  return 'disponible';
}

export function etiquetaDisponibilidadCt(estado) {
  const map = {
    disponible: 'Disponible',
    cubriendo: 'Cubriendo / solicitado',
    hold: 'Hold (incumplimiento)',
    no_disponible: 'No disponible',
    baja: 'Baja',
  };
  return map[estado] || estado || '—';
}

export function colorDisponibilidadCt(estado) {
  if (estado === 'disponible') return '#2e7d32';
  if (estado === 'cubriendo') return '#c62828';
  if (estado === 'hold') return '#b71c1c';
  if (estado === 'no_disponible') return '#c62828';
  return '#9e9e9e';
}

export function ctPuedeSerSolicitado(estado) {
  return estado === 'disponible';
}

/** Lista CT RH activos con semáforo (solo catálogo cubre_turno, no planta). */
export async function listarCatalogoCt(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  await liberarHoldsCtVencidos(supabase);
  const { data, error } = await supabase
    .from('rh_empleados')
    .select('id, nombre, apellidos, nombre_completo, telefono, sucursal_id, estado, extras, created_at')
    .eq('tipo_empleado', 'cubre_turno')
    .order('nombre_completo', { ascending: true })
    .limit(opts.limit || 200);
  if (error) return { ok: false, error: error.message, data: [] };

  let solicitudes = [];
  const solRes = await listarSolicitudesCt(supabase, {
    estados: ['solicitada', 'aceptada'],
    limit: 300,
  });
  if (solRes.ok) solicitudes = solRes.data || [];

  const rows = (data || [])
    .filter((e) => opts.incluirBajas || e.estado !== 'baja')
    .map((e) => {
      const estadoDisp = estadoDisponibilidadCt(e, solicitudes);
      return {
        id: `rh:${e.id}`,
        rh_id: e.id,
        nombre: nombreRh(e),
        telefono: String(e.telefono || '').replace(/\D/g, '') || null,
        sucursal_id: e.sucursal_id || null,
        estado_rh: e.estado,
        disponibilidad: estadoDisp,
        disponibilidad_label: etiquetaDisponibilidadCt(estadoDisp),
        color: colorDisponibilidadCt(estadoDisp),
        puede_solicitar: ctPuedeSerSolicitado(estadoDisp),
        hold_until: extrasCt(e).ct_hold_until || null,
        origen: 'rh',
        extras: extrasCt(e),
        raw: e,
      };
    });

  if (opts.soloDisponibles) {
    return { ok: true, data: rows.filter((r) => r.puede_solicitar) };
  }
  return { ok: true, data: rows };
}

export async function setDisponibilidadManualCt(supabase, rhId, disponible, opts = {}) {
  if (!supabase || !rhId) return { ok: false, error: 'CT inválido.' };
  const { data: prev, error } = await supabase
    .from('rh_empleados')
    .select('id, extras')
    .eq('id', rhId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!prev) return { ok: false, error: 'CT no encontrado.' };
  const ex = extrasCt(prev);
  const next = {
    ...ex,
    ct_disponibilidad: disponible ? 'disponible' : 'no_disponible',
  };
  if (disponible) delete next.ct_hold_until;
  const { error: upErr } = await supabase
    .from('rh_empleados')
    .update({ extras: next, updated_at: new Date().toISOString() })
    .eq('id', rhId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

export async function listarSolicitudesCt(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  let q = supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(opts.limit) || 100, 1), 400));
  if (opts.sucursal) q = q.eq('sucursal_id', normalizarCodigoTienda(opts.sucursal));
  if (opts.ctRhId) q = q.eq('ct_rh_id', opts.ctRhId);
  if (opts.fecha) q = q.eq('fecha', opts.fecha);
  if (opts.estados?.length) q = q.in('estado', opts.estados);
  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, data: [], faltaTabla: true };
    return { ok: false, error: error.message, data: [] };
  }
  return { ok: true, data: data || [] };
}

function ventanaPinParaFecha(fechaYmd, turnoId) {
  const base = String(fechaYmd || '').slice(0, 10);
  // Ventana amplia del día de negocio (± gracia). Detallar horarios después.
  const desde = new Date(`${base}T00:00:00-07:00`);
  const hasta = new Date(`${base}T23:59:59-07:00`);
  hasta.setHours(hasta.getHours() + 4); // gracia post-turno
  return {
    pin_valido_desde: desde.toISOString(),
    pin_valido_hasta: hasta.toISOString(),
    turno_id: turnoId || null,
  };
}

/**
 * Cajero/tienda solicita un CT disponible para cubrir un descanso.
 */
export async function solicitarCt(supabase, payload = {}, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const sucursal_id = normalizarCodigoTienda(payload.sucursal_id || payload.sucursal);
  if (!sucursal_id) return { ok: false, error: 'Sucursal requerida.' };
  const fecha = String(payload.fecha || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: 'Fecha inválida.' };
  const ctRhId = payload.ct_rh_id || String(payload.ctId || '').replace(/^rh:/, '');
  if (!ctRhId) return { ok: false, error: 'Elige un CT del catálogo.' };

  const catalogo = await listarCatalogoCt(supabase);
  const ct = (catalogo.data || []).find((c) => String(c.rh_id) === String(ctRhId));
  if (!ct) return { ok: false, error: 'CT no encontrado en el catálogo.' };
  if (!ct.puede_solicitar) {
    return {
      ok: false,
      error: `Ese CT no está disponible (${ct.disponibilidad_label}). Elige otro en verde.`,
    };
  }

  const ventana = ventanaPinParaFecha(fecha, payload.turno_id);
  const row = {
    sucursal_id,
    fecha,
    turno_id: payload.turno_id || null,
    turno_etiqueta: payload.turno_etiqueta || null,
    empleado_planta_id: payload.empleado_planta_id || null,
    empleado_planta_nombre: payload.empleado_planta_nombre || null,
    plan_fila_id: payload.plan_fila_id || null,
    plan_dia: payload.plan_dia != null ? Number(payload.plan_dia) : null,
    ct_rh_id: ctRhId,
    ct_nombre: ct.nombre,
    ct_telefono: ct.telefono,
    solicitado_por_id: opts.user?.id ? String(opts.user.id) : null,
    solicitado_por_nombre: opts.user?.nombre || opts.nombreActor || null,
    estado: 'solicitada',
    pin_temporal: null,
    pin_valido_desde: ventana.pin_valido_desde,
    pin_valido_hasta: ventana.pin_valido_hasta,
    notas: payload.notas || null,
  };

  const { data, error } = await supabase.from('pos_cubre_solicitudes').insert([row]).select('*').single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }

  await crearNotificacion(supabase, {
    sucursal_id,
    tipo: 'ct_solicitud',
    ref_tabla: 'pos_cubre_solicitudes',
    ref_id: data.id,
    titulo: `CT solicitado · ${etiquetaTienda(sucursal_id)}`,
    mensaje: (
      `${ct.nombre}: te solicitan cubrir ${fecha}`
      + (payload.turno_etiqueta ? ` (${payload.turno_etiqueta})` : '')
      + ` en ${etiquetaTienda(sucursal_id)}. `
      + `Solicitó: ${row.solicitado_por_nombre || 'caja'}.`
    ),
  });

  return {
    ok: true,
    solicitud: data,
    mensaje: (
      `Solicitud enviada a ${ct.nombre} para ${etiquetaTienda(sucursal_id)} · ${fecha}. `
      + 'Cuando acepte, se generará un PIN temporal solo para esa tienda/fecha.'
    ),
  };
}

/** CT acepta → PIN temporal exclusivo tienda/fecha/turno. */
export async function aceptarSolicitudCt(supabase, solicitudId, opts = {}) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const { data: prev, error } = await supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  if (!prev) return { ok: false, error: 'Solicitud no encontrada.' };
  if (String(prev.estado) !== 'solicitada') {
    return { ok: false, error: `La solicitud ya está en estado «${prev.estado}».` };
  }

  let pin = roundPin4();
  try {
    const { pinUsuarioOcupadoEnSucursal } = await import('./usuariosAuth.js');
    for (let i = 0; i < 10; i += 1) {
      const choque = await pinUsuarioOcupadoEnSucursal(supabase, pin, prev.sucursal_id);
      if (!choque.ocupado) break;
      pin = roundPin4();
    }
  } catch {
    /* ignore */
  }

  const ahora = new Date().toISOString();
  const { data, error: upErr } = await supabase
    .from('pos_cubre_solicitudes')
    .update({
      estado: 'aceptada',
      pin_temporal: pin,
      aceptada_at: ahora,
      updated_at: ahora,
    })
    .eq('id', solicitudId)
    .select('*')
    .single();
  if (upErr) return { ok: false, error: upErr.message };

  await crearNotificacion(supabase, {
    sucursal_id: prev.sucursal_id,
    tipo: 'ct_aceptada',
    ref_tabla: 'pos_cubre_solicitudes',
    ref_id: data.id,
    titulo: `CT aceptó · ${etiquetaTienda(prev.sucursal_id)}`,
    mensaje: (
      `${prev.ct_nombre} aceptó cubrir ${prev.fecha} en ${etiquetaTienda(prev.sucursal_id)}. `
      + `PIN temporal: ${pin} (solo esa tienda y fecha).`
    ),
  });

  return {
    ok: true,
    solicitud: data,
    pin,
    mensaje: (
      `Aceptado. PIN temporal ${pin} para ${etiquetaTienda(prev.sucursal_id)} · ${prev.fecha}. `
      + 'Válido solo ese día/turno.'
    ),
  };
}

export async function rechazarSolicitudCt(supabase, solicitudId, opts = {}) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from('pos_cubre_solicitudes')
    .update({
      estado: 'rechazada',
      rechazo_motivo: opts.motivo || null,
      updated_at: ahora,
    })
    .eq('id', solicitudId)
    .eq('estado', 'solicitada')
    .select('*')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return { ok: true, solicitud: data, mensaje: 'Solicitud rechazada. La tienda puede pedir otro CT.' };
}

export async function cancelarSolicitudCt(supabase, solicitudId) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const { data, error } = await supabase
    .from('pos_cubre_solicitudes')
    .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)
    .in('estado', ['solicitada', 'aceptada'])
    .select('*')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return { ok: true, solicitud: data };
}

/**
 * Incumplimiento: aceptó y no cubrió → hold 7 días.
 */
export async function marcarNoShowCt(supabase, solicitudId, opts = {}) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const { data: prev, error } = await supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  if (!prev) return { ok: false, error: 'Solicitud no encontrada.' };
  if (String(prev.estado) !== 'aceptada') {
    return { ok: false, error: 'Solo se marca no-show en coberturas aceptadas.' };
  }

  const holdUntil = new Date(Date.now() + DIAS_HOLD_CT_MS).toISOString();
  const ahora = new Date().toISOString();
  const { data, error: upErr } = await supabase
    .from('pos_cubre_solicitudes')
    .update({
      estado: 'retenida',
      hold_until: holdUntil,
      updated_at: ahora,
      notas: [prev.notas, opts.notas || 'No cumplió la cobertura aceptada'].filter(Boolean).join(' · '),
    })
    .eq('id', solicitudId)
    .select('*')
    .single();
  if (upErr) return { ok: false, error: upErr.message };

  if (prev.ct_rh_id) {
    const { data: emp } = await supabase
      .from('rh_empleados')
      .select('id, extras')
      .eq('id', prev.ct_rh_id)
      .maybeSingle();
    if (emp) {
      const ex = extrasCt(emp);
      await supabase
        .from('rh_empleados')
        .update({
          extras: {
            ...ex,
            ct_disponibilidad: 'no_disponible',
            ct_hold_until: holdUntil,
          },
          updated_at: ahora,
        })
        .eq('id', emp.id);
    }
  }

  await crearNotificacion(supabase, {
    sucursal_id: prev.sucursal_id,
    tipo: 'ct_hold',
    ref_tabla: 'pos_cubre_solicitudes',
    ref_id: data.id,
    titulo: `CT en hold · ${prev.ct_nombre}`,
    mensaje: (
      `${prev.ct_nombre} no cubrió ${prev.fecha} en ${etiquetaTienda(prev.sucursal_id)}. `
      + 'Queda en hold 7 días (no podrá aceptar coberturas). Liberación automática al vencer.'
    ),
  });

  return {
    ok: true,
    solicitud: data,
    hold_until: holdUntil,
    mensaje: `${prev.ct_nombre} pasó a hold hasta ${new Date(holdUntil).toLocaleString('es-MX')}.`,
  };
}

export async function marcarCumplidaCt(supabase, solicitudId) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const { data, error } = await supabase
    .from('pos_cubre_solicitudes')
    .update({ estado: 'cumplida', updated_at: new Date().toISOString(), pin_temporal: null })
    .eq('id', solicitudId)
    .eq('estado', 'aceptada')
    .select('*')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return { ok: true, solicitud: data };
}

/**
 * Valida PIN temporal activo para una sucursal (login CT).
 * @returns {{ ok: true, solicitud } | { ok: false }}
 */
export async function validarPinTemporalCt(supabase, pin, sucursal) {
  if (!supabase) return { ok: false };
  const p = normalizarPinComparacion(pin);
  const suc = normalizarCodigoTienda(sucursal);
  if (!p || !suc) return { ok: false };
  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .eq('sucursal_id', suc)
    .eq('estado', 'aceptada')
    .eq('pin_temporal', p)
    .limit(5);
  if (error || !data?.length) return { ok: false };
  const viva = data.find((s) => {
    const desde = s.pin_valido_desde || s.fecha;
    const hasta = s.pin_valido_hasta;
    if (hasta && String(hasta) < ahora) return false;
    if (desde && String(desde) > ahora && s.fecha) {
      // permitir desde 00:00 del día
      return String(s.fecha) <= ahora.slice(0, 10);
    }
    return true;
  });
  if (!viva) return { ok: false };
  return { ok: true, solicitud: viva };
}

export function construirUsuarioDesdeSolicitudCt(solicitud) {
  const suc = normalizarCodigoTienda(solicitud?.sucursal_id) || 'MAIN';
  return {
    id: null,
    nombre: String(solicitud?.ct_nombre || 'Cubre turno').trim(),
    telefono: String(solicitud?.ct_telefono || '').replace(/\D/g, ''),
    rol: 'Cajero',
    sucursal_id: suc,
    esCubreTurno: true,
    cubreSolicitudId: solicitud?.id || null,
    cubreFecha: solicitud?.fecha || null,
    turno_id: solicitud?.turno_id || null,
    turno_horario: null,
    dispositivo_id: null,
  };
}
