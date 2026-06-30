import { normalizarRol } from './roles.js';
import { buscarUsuarioPorPinYSucursal } from './usuariosAuth.js';
import {
  beneficiarioValePermitido,
  valeRequiereAutorizacionAdmin,
  valeDescuentaNomina,
  cuotaSemanalPrestamo,
  prestamoRequiereSocio,
  esSocioAprobadorPrestamo,
  MONTO_PRESTAMO_REQUIERE_SOCIO,
} from './contabilidadConstants.js';
import { crearNotificacion, marcarNotificacionAtendida, TIPOS_NOTIF } from './contabilidadNotificaciones.js';
import { cargarValeACorte, cargarPrestamoEmpleadoACorte, quitarValeDeCorteAbierto } from './cargosContabilidad.js';

export function faltaTablaVales(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('vales') || (msg.includes('schema cache') && msg.includes('vales'));
}

export function faltaTablaPrestamos(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('prestamos') || (msg.includes('schema cache') && msg.includes('prestamos'));
}

export const AVISO_FALTA_CONTABILIDAD =
  'Faltan tablas de contabilidad. Ejecuta supabase/fix_contabilidad.sql y fix_vales_prestamos_aprobaciones.sql';

export async function verificarPinAdministrador(supabase, pin, sucursal) {
  const { user, error } = await buscarUsuarioPorPinYSucursal(supabase, pin, sucursal);
  if (error || !user) return { ok: false, error: 'PIN incorrecto.' };
  if (normalizarRol(user.rol) !== 'Administrador') return { ok: false, error: 'Solo un administrador puede autorizar.' };
  return { ok: true, nombre: user.nombre, user };
}

export async function verificarPinSocioPrestamo(supabase, pin, sucursal) {
  const { user, error } = await buscarUsuarioPorPinYSucursal(supabase, pin, sucursal);
  if (error || !user) return { ok: false, error: 'PIN incorrecto.' };
  if (!esSocioAprobadorPrestamo(user.nombre)) {
    return {
      ok: false,
      error: `Préstamos mayores a $${MONTO_PRESTAMO_REQUIERE_SOCIO} requieren PIN de Antonio, Francisco o José Luis.`,
    };
  }
  return { ok: true, nombre: user.nombre, user };
}

let folioValeLocal = 0;

export async function siguienteFolioVale(supabase, sucursal) {
  if (!supabase) {
    folioValeLocal += 1;
    return `VAL-${String(folioValeLocal).padStart(4, '0')}`;
  }
  const { count } = await supabase.from('vales').select('id', { count: 'exact', head: true }).eq('sucursal_id', sucursal || 'MAIN');
  const n = (Number(count) || 0) + 1;
  return `VAL-${String(n).padStart(4, '0')}`;
}

export async function listarVales(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, area, tipo, categoria, estadoAprobacion, desde, hasta, limit = 200 } = opts;
  let q = supabase.from('vales').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  if (area) q = q.eq('area', area);
  if (tipo) q = q.eq('tipo', tipo);
  if (categoria) q = q.eq('categoria', categoria);
  if (estadoAprobacion) q = q.eq('estado_aprobacion', estadoAprobacion);
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  const { data, error } = await q;
  if (error && faltaTablaVales(error)) return { data: [], error: null, aviso: AVISO_FALTA_CONTABILIDAD };
  return { data: data || [], error: error?.message || null };
}

export async function listarValesGasolina(supabase, opts = {}) {
  return listarVales(supabase, { ...opts, categoria: 'gasolina', estadoAprobacion: opts.soloAprobados === false ? undefined : 'aprobado' });
}

export async function marcarValeCobrado(supabase, valeId, cobrado, { nombre } = {}) {
  if (!supabase || !valeId) return { ok: false, error: 'Vale inválido.' };
  const { data: vale, error: e0 } = await supabase.from('vales').select('*').eq('id', valeId).single();
  if (e0 || !vale) return { ok: false, error: 'Vale no encontrado.' };
  if (vale.categoria !== 'gasolina') return { ok: false, error: 'Solo aplica a vales de gasolina.' };
  if (vale.estado_aprobacion !== 'aprobado') return { ok: false, error: 'El vale debe estar aprobado.' };

  const esCobrado = Boolean(cobrado);
  const { data, error } = await supabase
    .from('vales')
    .update({
      cobrado: esCobrado,
      cobrado_at: esCobrado ? new Date().toISOString() : null,
      cobrado_por: esCobrado ? nombre || null : null,
    })
    .eq('id', valeId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, vale: data };
}

export async function registrarVale(supabase, row, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!beneficiarioValePermitido(row.nombre_empleado, row.area)) {
    return { ok: false, error: 'Solo vales para Luis Enrique (Abarrotes), Misael y Gonzalo (Virtual).' };
  }

  const categoria = row.categoria || 'consumo';
  const esAdmin = normalizarRol(opts.rolActor) === 'Administrador';
  const requiereAdmin = valeRequiereAutorizacionAdmin(new Date(), categoria);
  const descuentaNomina = valeDescuentaNomina(categoria);

  let estadoAprobacion = 'aprobado';
  let requiereAuth = false;
  let autorizadoPor = null;
  let aprobadoAt = new Date().toISOString();

  if (requiereAdmin && !esAdmin) {
    estadoAprobacion = 'pendiente_admin';
    requiereAuth = true;
    autorizadoPor = null;
    aprobadoAt = null;
  }

  const folio = row.folio || (await siguienteFolioVale(supabase, row.sucursal_id));
  const payload = {
    ...row,
    folio,
    categoria,
    descuenta_nomina: descuentaNomina,
    estado_aprobacion: estadoAprobacion,
    requiere_autorizacion: requiereAuth,
    autorizado_por: autorizadoPor,
    aprobado_at: aprobadoAt,
    cargado_corte: false,
    tipo: row.tipo || 'indirecto',
    ...(categoria === 'gasolina' ? { cobrado: false } : {}),
  };

  const { data, error } = await supabase.from('vales').insert([payload]).select('*').single();
  if (error) {
    if (faltaTablaVales(error)) return { ok: false, error: AVISO_FALTA_CONTABILIDAD };
    return { ok: false, error: error.message };
  }

  if (estadoAprobacion === 'pendiente_admin') {
    await crearNotificacion(supabase, {
      sucursal_id: row.sucursal_id,
      tipo: TIPOS_NOTIF.VALE_PENDIENTE,
      ref_tabla: 'vales',
      ref_id: data.id,
      titulo: `Vale pendiente · ${row.nombre_empleado}`,
      mensaje: `${folio} · $${Number(row.monto).toFixed(2)} · ${categoria}${descuentaNomina ? ' · requiere admin' : ' · después de las 9:00'}`,
    });
    return {
      ok: true,
      vale: data,
      pendiente: true,
      mensaje: 'Solicitud enviada. El administrador debe aprobar antes de imprimir.',
    };
  }

  await cargarValeACorte(supabase, data);
  return {
    ok: true,
    vale: data,
    pendiente: false,
    mensaje: 'Vale autorizado. Imprima y solicite la firma del beneficiario.',
    requiereFirma: true,
  };
}

export async function aprobarVale(supabase, valeId, { nombreAprobador, cargarCorte = true } = {}) {
  if (!supabase || !valeId) return { ok: false, error: 'Vale inválido.' };
  const { data: vale, error: e0 } = await supabase.from('vales').select('*').eq('id', valeId).single();
  if (e0 || !vale) return { ok: false, error: 'Vale no encontrado.' };
  if (vale.estado_aprobacion === 'aprobado') return { ok: true, vale };
  if (vale.estado_aprobacion === 'rechazado') return { ok: false, error: 'El vale fue rechazado.' };

  const { data, error } = await supabase
    .from('vales')
    .update({
      estado_aprobacion: 'aprobado',
      autorizado_por: nombreAprobador || 'Administrador',
      aprobado_at: new Date().toISOString(),
      ...(vale.categoria === 'gasolina' ? { cobrado: false } : {}),
    })
    .eq('id', valeId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };

  await marcarNotificacionAtendida(supabase, 'vales', valeId, nombreAprobador);
  if (cargarCorte) await cargarValeACorte(supabase, data);
  return { ok: true, vale: data };
}

export async function rechazarVale(supabase, valeId, { nombre, motivo } = {}) {
  if (!supabase || !valeId) return { ok: false, error: 'Vale inválido.' };
  const { data, error } = await supabase
    .from('vales')
    .update({
      estado_aprobacion: 'rechazado',
      rechazado_por: nombre || null,
      motivo_rechazo: motivo || null,
    })
    .eq('id', valeId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'vales', valeId, nombre);
  return { ok: true, vale: data };
}

/** Anula un vale (pendiente o aprobado). Solo administrador. Quita el gasto del corte abierto si aplica. */
export async function cancelarVale(supabase, valeId, { nombre, motivo } = {}) {
  if (!supabase || !valeId) return { ok: false, error: 'Vale inválido.' };
  const { data: vale, error: e0 } = await supabase.from('vales').select('*').eq('id', valeId).single();
  if (e0 || !vale) return { ok: false, error: 'Vale no encontrado.' };
  const est = vale.estado_aprobacion || 'aprobado';
  if (est === 'cancelado') return { ok: true, vale };
  if (est === 'rechazado') return { ok: false, error: 'El vale ya fue rechazado.' };

  if (vale.cargado_corte) {
    const quitar = await quitarValeDeCorteAbierto(supabase, vale);
    if (!quitar.ok) return quitar;
    if (quitar.removidos === 0 && est === 'aprobado') {
      return {
        ok: false,
        error: 'El vale ya está en un corte cerrado. No se puede cancelar automáticamente; ajusta el corte manualmente.',
      };
    }
  }

  const { data, error } = await supabase
    .from('vales')
    .update({
      estado_aprobacion: 'cancelado',
      cargado_corte: false,
      rechazado_por: nombre || null,
      motivo_rechazo: motivo || null,
    })
    .eq('id', valeId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'vales', valeId, nombre);
  return { ok: true, vale: data };
}

export async function listarPrestamos(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, soloActivos, incluirPendientes, limit = 200 } = opts;
  let q = supabase.from('prestamos').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  if (soloActivos && !incluirPendientes) q = q.eq('estado', 'activo');
  if (incluirPendientes) q = q.in('estado', ['pendiente_admin', 'pendiente_socio', 'activo']);
  const { data, error } = await q;
  if (error && faltaTablaPrestamos(error)) return { data: [], error: null, aviso: AVISO_FALTA_CONTABILIDAD };
  return { data: data || [], error: error?.message || null };
}

export async function registrarPrestamo(supabase, row, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const monto = Number(row.monto_original) || 0;
  const payload = {
    ...row,
    saldo: monto,
    abono: 0,
    estado: 'pendiente_admin',
    requiere_aprobacion_socio: prestamoRequiereSocio(monto),
    cuota_semanal: 0,
    cargado_corte: false,
  };
  const { data, error } = await supabase.from('prestamos').insert([payload]).select('*').single();
  if (error) {
    if (faltaTablaPrestamos(error)) return { ok: false, error: AVISO_FALTA_CONTABILIDAD };
    return { ok: false, error: error.message };
  }

  await crearNotificacion(supabase, {
    sucursal_id: row.sucursal_id,
    tipo: TIPOS_NOTIF.PRESTAMO_ADMIN,
    ref_tabla: 'prestamos',
    ref_id: data.id,
    titulo: `Préstamo pendiente · ${row.nombre_empleado}`,
    mensaje: `$${monto.toFixed(2)}${prestamoRequiereSocio(monto) ? ' · requiere socio' : ''}`,
  });

  return {
    ok: true,
    prestamo: data,
    pendiente: true,
    mensaje: 'Préstamo registrado. El administrador debe aprobar antes de imprimir el ticket.',
  };
}

export async function aprobarPrestamoAdmin(supabase, prestamoId, { nombreAprobador, cuotaPropuesta, cargarCorte = true, areaCorte } = {}) {
  if (!supabase || !prestamoId) return { ok: false, error: 'Préstamo inválido.' };
  const { data: p, error: e0 } = await supabase.from('prestamos').select('*').eq('id', prestamoId).single();
  if (e0 || !p) return { ok: false, error: 'Préstamo no encontrado.' };
  if (p.estado !== 'pendiente_admin') return { ok: false, error: 'El préstamo no está pendiente de administrador.' };

  const monto = Number(p.monto_original) || 0;
  const necesitaSocio = prestamoRequiereSocio(monto);

  if (necesitaSocio) {
    const { data, error } = await supabase
      .from('prestamos')
      .update({
        estado: 'pendiente_socio',
        aprobado_admin_por: nombreAprobador,
        aprobado_admin_at: new Date().toISOString(),
      })
      .eq('id', prestamoId)
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message };
    await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, nombreAprobador);
    await crearNotificacion(supabase, {
      sucursal_id: p.sucursal_id,
      tipo: TIPOS_NOTIF.PRESTAMO_SOCIO,
      ref_tabla: 'prestamos',
      ref_id: p.id,
      titulo: `Préstamo +$1,000 · ${p.nombre_empleado}`,
      mensaje: `$${monto.toFixed(2)} · espera Antonio, Francisco o José Luis`,
    });
    return {
      ok: true,
      prestamo: data,
      pendienteSocio: true,
      mensaje: 'Aprobado por admin. Falta autorización de socio (puede tardar más de 24 h).',
    };
  }

  const cuota = cuotaSemanalPrestamo(monto, cuotaPropuesta);
  const { data, error } = await supabase
    .from('prestamos')
    .update({
      estado: 'activo',
      cuota_semanal: cuota,
      aprobado_admin_por: nombreAprobador,
      aprobado_admin_at: new Date().toISOString(),
    })
    .eq('id', prestamoId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, nombreAprobador);
  if (cargarCorte) await cargarPrestamoEmpleadoACorte(supabase, data, areaCorte);
  return { ok: true, prestamo: data, cuota, mensaje: 'Préstamo activo. Ya puede imprimir el ticket.' };
}

export async function aprobarPrestamoSocio(supabase, prestamoId, { pin, sucursal, cuotaPropuesta, cargarCorte = true, areaCorte } = {}) {
  if (!supabase || !prestamoId) return { ok: false, error: 'Préstamo inválido.' };
  const auth = await verificarPinSocioPrestamo(supabase, pin, sucursal);
  if (!auth.ok) return auth;

  const { data: p, error: e0 } = await supabase.from('prestamos').select('*').eq('id', prestamoId).single();
  if (e0 || !p) return { ok: false, error: 'Préstamo no encontrado.' };
  if (p.estado !== 'pendiente_socio') return { ok: false, error: 'El préstamo no está pendiente de socio.' };

  const saldo = Number(p.saldo) || Number(p.monto_original) || 0;
  const cuota = cuotaSemanalPrestamo(saldo, cuotaPropuesta);
  const { data, error } = await supabase
    .from('prestamos')
    .update({
      estado: 'activo',
      cuota_semanal: cuota,
      aprobado_socio_por: auth.nombre,
      aprobado_socio_at: new Date().toISOString(),
    })
    .eq('id', prestamoId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, auth.nombre);
  if (cargarCorte) await cargarPrestamoEmpleadoACorte(supabase, data, areaCorte);
  return { ok: true, prestamo: data, cuota, mensaje: 'Préstamo autorizado por socio. Ya puede imprimir.' };
}

export async function rechazarPrestamo(supabase, prestamoId, { nombre, motivo } = {}) {
  if (!supabase || !prestamoId) return { ok: false, error: 'Préstamo inválido.' };
  const { data, error } = await supabase
    .from('prestamos')
    .update({ estado: 'rechazado', rechazado_por: nombre, motivo_rechazo: motivo || null, saldo: 0 })
    .eq('id', prestamoId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, nombre);
  return { ok: true, prestamo: data };
}

export async function abonarPrestamo(supabase, prestamo, montoAbono) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (prestamo.estado !== 'activo') return { ok: false, error: 'El préstamo no está activo.' };
  const abono = Math.max(0, Number(montoAbono) || 0);
  const saldoAntes = Number(prestamo.saldo) || 0;
  const saldo = Math.max(0, saldoAntes - abono);
  const { error } = await supabase
    .from('prestamos')
    .update({
      saldo,
      abono: (Number(prestamo.abono) || 0) + abono,
      estado: saldo <= 0 ? 'liquidado' : 'activo',
    })
    .eq('id', prestamo.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, saldo };
}

export async function listarPrestamosInterarea(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, limit = 100 } = opts;
  let q = supabase.from('prestamos_interarea').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q;
  if (error?.code === '42P01') return { data: [], aviso: 'Ejecuta fix_contabilidad_ampliacion.sql' };
  return { data: data || [], error: error?.message || null };
}

export async function registrarPrestamoInterarea(supabase, row) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (row.origen === row.destino) return { ok: false, error: 'Origen y destino deben ser distintos.' };
  const { data, error } = await supabase
    .from('prestamos_interarea')
    .insert([{ ...row, estado: 'activo' }])
    .select('*')
    .single();
  if (error?.code === '42P01') return { ok: false, error: 'Ejecuta fix_contabilidad_ampliacion.sql' };
  if (error) return { ok: false, error: error.message };

  const origenLbl = row.origen || '—';
  const destinoLbl = row.destino || '—';
  await crearNotificacion(supabase, {
    sucursal_id: row.sucursal_id || 'MAIN',
    tipo: TIPOS_NOTIF.PRESTAMO_INTERAREA,
    ref_tabla: 'prestamos_interarea',
    ref_id: data.id,
    titulo: `Préstamo entre áreas · ${origenLbl} → ${destinoLbl}`,
    mensaje: `$${Number(row.monto || 0).toFixed(2)}${row.notas ? ` · ${row.notas}` : ''}`,
  });
  return { ok: true, prestamo: data };
}

export { cargarValeACorte, cargarPrestamoEmpleadoACorte } from './cargosContabilidad.js';
