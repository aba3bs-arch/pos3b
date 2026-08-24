import { normalizarRol } from './roles.js';
import { buscarUsuarioPorPinYSucursal } from './usuariosAuth.js';
import {
  beneficiarioValePermitido,
  valeRequiereAutorizacionAdmin,
  valeDescuentaNomina,
  cuotaSemanalPrestamo,
  prestamoRequiereSocio,
  esSocioAprobadorPrestamo,
  normalizarAreaCorte,
  MONTO_PRESTAMO_REQUIERE_SOCIO,
  CUOTA_SEMANAL_MINIMA,
  etiquetaHoraLimiteVale,
  prestamoInterareaEstaAbierto,
  prestamoInterareaPuedeRecolectarRc,
  prestamoInterareaPendienteRc,
  prestamoInterareaPuedeOperarHastaRc,
  ESTADOS_PRESTAMO_INTERAREA_ABIERTOS,
} from './contabilidadConstants.js';
import { esCategoriaValeConocida } from './valesCategorias.js';
import { crearNotificacion, marcarNotificacionAtendida, TIPOS_NOTIF } from './contabilidadNotificaciones.js';
import {
  cargarValeACorte,
  cargarPrestamoEmpleadoACorte,
  cargarPrestamoInterareaACorte,
  cargarPrestamoSucursalACorte,
  quitarValeDeCorteAbierto,
  corteDocumentoEliminable,
  TOKEN_PRESTAMO_IA,
  TOKEN_PRESTAMO_SUC,
} from './cargosContabilidad.js';
import { asegurarCamposSinReservadoOPin } from './reservadoAdminPrincipal.js';

export function faltaTablaVales(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('vales') || (msg.includes('schema cache') && msg.includes('vales'));
}

export function faltaTablaPrestamos(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('prestamos') || (msg.includes('schema cache') && msg.includes('prestamos'));
}

export const AVISO_FALTA_CONTABILIDAD =
  'Faltan tablas de contabilidad. Ejecuta supabase/fix_contabilidad.sql, fix_vales_prestamos_aprobaciones.sql, fix_prestamos_area_colectado.sql, fix_prestamos_interarea_recuperacion.sql, fix_prestamos_omitir_corte.sql y fix_prestamos_interarea_rc_virtual.sql';

export const AVISO_FALTA_RC_PRESTAMO_AREA =
  'Para recolectar préstamos área hacia RC Virtual, ejecuta supabase/fix_prestamos_interarea_rc_virtual.sql';

/** Fecha del vale para filtros (columna fecha o día de created_at). */
export function fechaEfectivaVale(vale) {
  return String(vale?.fecha || vale?.created_at || '').slice(0, 10);
}

export function valeEstaAprobado(vale) {
  const e = vale?.estado_aprobacion;
  return !e || e === 'aprobado';
}

export function filtrarValesPorPeriodo(vales, desde, hasta) {
  return (vales || []).filter((v) => {
    const f = fechaEfectivaVale(v);
    if (!f) return false;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  });
}

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
  if (tipo === 'indirecto') {
    q = q.or('tipo.eq.indirecto,tipo.is.null');
  } else if (tipo) {
    q = q.eq('tipo', tipo);
  }
  if (categoria) q = q.eq('categoria', categoria);
  if (estadoAprobacion === 'aprobado') {
    q = q.or('estado_aprobacion.eq.aprobado,estado_aprobacion.is.null');
  } else if (estadoAprobacion) {
    q = q.eq('estado_aprobacion', estadoAprobacion);
  }
  const { data, error } = await q;
  if (error && faltaTablaVales(error)) return { data: [], error: null, aviso: AVISO_FALTA_CONTABILIDAD };
  let lista = data || [];
  if (desde || hasta) lista = filtrarValesPorPeriodo(lista, desde, hasta);
  return { data: lista, error: error?.message || null };
}

export async function listarValesGasolina(supabase, opts = {}) {
  const { desde, hasta, soloAprobados = true, ...rest } = opts;
  const res = await listarVales(supabase, {
    ...rest,
    categoria: 'gasolina',
    desde: undefined,
    hasta: undefined,
    estadoAprobacion: undefined,
  });
  if (res.error || !res.data) return res;
  let lista = res.data;
  if (desde || hasta) lista = filtrarValesPorPeriodo(lista, desde, hasta);
  if (soloAprobados !== false) lista = lista.filter(valeEstaAprobado);
  return { ...res, data: lista };
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

  const categoria = String(row.categoria || 'consumo').toLowerCase();
  if (!esCategoriaValeConocida(categoria)) {
    return { ok: false, error: 'Tipo de vale no válido. El administrador debe crearlo primero.' };
  }

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
  } else if (esAdmin) {
    autorizadoPor = opts.nombreActor || 'Administrador';
  }

  const folio = row.folio || (await siguienteFolioVale(supabase, row.sucursal_id));
  const payload = {
    ...row,
    folio,
    categoria,
    area: normalizarAreaCorte(row.area, 'virtual'),
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
      mensaje: `${folio} · $${Number(row.monto).toFixed(2)} · ${categoria}${descuentaNomina ? ' · requiere admin' : ` · después de las ${etiquetaHoraLimiteVale()}`}`,
      area_buzon: data.area || row.area || 'virtual',
    });
    return {
      ok: true,
      vale: data,
      pendiente: true,
      mensaje: 'Solicitud enviada. El administrador debe aprobar antes de imprimir.',
    };
  }

  await cargarValeACorte(supabase, data);
  try {
    const { registrarEgresoDesdeVale } = await import('./contVirtualEgresos.js');
    await registrarEgresoDesdeVale(supabase, data);
  } catch {
    /* Cont Virtual opcional */
  }
  return {
    ok: true,
    vale: data,
    pendiente: false,
    mensaje: `Vale autorizado y cargado al corte de ${payload.area}. Imprima y solicite la firma del beneficiario.`,
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
  try {
    const { registrarEgresoDesdeVale } = await import('./contVirtualEgresos.js');
    await registrarEgresoDesdeVale(supabase, data);
  } catch {
    /* Cont Virtual opcional */
  }
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

/** Edita un vale (monto, categoría, motivo/notas). Bloquea nombres reservados sin Andrés. */
export async function editarVale(supabase, vale, patch = {}, { nombre, user, sucursal } = {}) {
  if (!supabase || !vale?.id) return { ok: false, error: 'Vale inválido.' };
  const est = vale.estado_aprobacion || 'aprobado';
  if (est === 'cancelado' || est === 'rechazado') {
    return { ok: false, error: 'No se puede editar un vale cancelado o rechazado.' };
  }
  const authTxt = await asegurarCamposSinReservadoOPin(
    supabase,
    [patch.motivo, patch.notas, patch.categoria, patch.nombre_empleado],
    { user, sucursal },
  );
  if (!authTxt.ok) return authTxt;

  const upd = {};
  if (patch.monto != null && patch.monto !== '') {
    const m = Number(patch.monto);
    if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
    upd.monto = m;
  }
  if (patch.categoria != null && String(patch.categoria).trim()) {
    const cat = String(patch.categoria).trim().toLowerCase();
    if (!esCategoriaValeConocida(cat)) return { ok: false, error: 'Tipo de vale no válido.' };
    upd.categoria = cat;
  }
  if (patch.motivo !== undefined) upd.motivo = String(patch.motivo || '').trim() || null;
  if (patch.notas !== undefined) upd.notas = String(patch.notas || '').trim() || null;
  if (patch.nombre_empleado != null && String(patch.nombre_empleado).trim()) {
    upd.nombre_empleado = String(patch.nombre_empleado).trim();
  }
  if (!Object.keys(upd).length) return { ok: false, error: 'Sin cambios.' };

  const { data, error } = await supabase.from('vales').update(upd).eq('id', vale.id).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, vale: data, mensaje: 'Vale actualizado.', autorizadoPor: authTxt.autorizadoPor || nombre };
}

/**
 * Abona a un vale de consumo (reduce monto). Si está en corte abierto, ajusta el gasto.
 * Gasolina: marca cobrado al liquidar/abonar total.
 */
export async function abonarVale(supabase, vale, montoAbono, { nombre } = {}) {
  if (!supabase || !vale?.id) return { ok: false, error: 'Vale inválido.' };
  const est = vale.estado_aprobacion || 'aprobado';
  if (est !== 'aprobado' && est !== 'pendiente_admin') {
    return { ok: false, error: 'Solo se abona a vales pendientes o aprobados.' };
  }
  const abono = Math.max(0, Number(montoAbono) || 0);
  if (!(abono > 0)) return { ok: false, error: 'Monto de abono inválido.' };
  const montoAntes = Number(vale.monto) || 0;
  if (abono > montoAntes + 0.001) return { ok: false, error: 'El abono no puede superar el monto del vale.' };
  const monto = Math.max(0, Math.round((montoAntes - abono) * 100) / 100);

  if (vale.categoria === 'gasolina' && monto <= 0.001) {
    return marcarValeCobrado(supabase, vale.id, true, { nombre });
  }

  if (vale.cargado_corte) {
    const check = await corteDocumentoEliminable(supabase, {
      cargadoCorte: true,
      sucursal_id: vale.sucursal_id,
      modulo: normalizarAreaCorte(vale.area, 'virtual'),
      comentarioIlike: vale.folio ? `%VALE ${vale.folio}%` : undefined,
      categoria: 'VALES',
    });
    if (!check.eliminable) {
      return { ok: false, error: check.error || 'El vale está en un corte cerrado; no se puede abonar aquí.' };
    }
    if (check.idsAbiertos?.length) {
      if (monto <= 0.001) {
        await supabase.from('cortes_contabilidad_gastos').delete().in('id', check.idsAbiertos);
      } else {
        await supabase.from('cortes_contabilidad_gastos').update({ monto }).in('id', check.idsAbiertos);
      }
    }
  }

  if (monto <= 0.001) {
    return cancelarVale(supabase, vale.id, { nombre, motivo: `Liquidado por abono (${nombre || 'usuario'})` });
  }

  const { data, error } = await supabase.from('vales').update({ monto }).eq('id', vale.id).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, vale: data, saldo: monto, liquidado: false };
}

export async function liquidarVale(supabase, vale, { nombre } = {}) {
  if (!vale) return { ok: false, error: 'Vale inválido.' };
  if (vale.categoria === 'gasolina') {
    return marcarValeCobrado(supabase, vale.id, true, { nombre });
  }
  const monto = Number(vale.monto) || 0;
  if (!(monto > 0)) return cancelarVale(supabase, vale.id, { nombre, motivo: 'Liquidado' });
  return abonarVale(supabase, vale, monto, { nombre });
}

/** Elimina vale solo si el corte está abierto (o aún no cargó). */
export async function eliminarVale(supabase, vale, { nombre, motivo } = {}) {
  if (!supabase || !vale?.id) return { ok: false, error: 'Vale inválido.' };
  const check = await corteDocumentoEliminable(supabase, {
    cargadoCorte: Boolean(vale.cargado_corte),
    sucursal_id: vale.sucursal_id,
    modulo: normalizarAreaCorte(vale.area, 'virtual'),
    comentarioIlike: vale.folio ? `%VALE ${vale.folio}%` : undefined,
    categoria: 'VALES',
  });
  if (!check.ok) return check;
  if (!check.eliminable) return { ok: false, error: check.error };

  if (check.idsAbiertos?.length) {
    const { error: eDel } = await supabase.from('cortes_contabilidad_gastos').delete().in('id', check.idsAbiertos);
    if (eDel) return { ok: false, error: eDel.message };
  }

  const { error } = await supabase.from('vales').delete().eq('id', vale.id);
  if (error) {
    // Fallback: cancelar si RLS/FK impide borrado
    return cancelarVale(supabase, vale.id, { nombre, motivo: motivo || 'Eliminado' });
  }
  await marcarNotificacionAtendida(supabase, 'vales', vale.id, nombre);
  return { ok: true, eliminado: true, mensaje: 'Vale eliminado.' };
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
  const { sucursal, soloActivos, incluirPendientes, incluirHistorial, limit = 200 } = opts;
  let q = supabase.from('prestamos').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', String(sucursal).toUpperCase());
  if (soloActivos && !incluirPendientes) q = q.eq('estado', 'activo');
  else if (incluirHistorial) {
    // Activos, pendientes y liquidados (control de pagos). Excluye rechazados.
    q = q.in('estado', ['pendiente_admin', 'pendiente_socio', 'activo', 'liquidado']);
  } else if (incluirPendientes) {
    q = q.in('estado', ['pendiente_admin', 'pendiente_socio', 'activo', 'liquidado']);
  }
  const { data, error } = await q;
  if (error && faltaTablaPrestamos(error)) return { data: [], error: null, aviso: AVISO_FALTA_CONTABILIDAD };
  return { data: data || [], error: error?.message || null };
}

function faltaColumnaPrestamo(error, col) {
  const msg = String(error?.message || error || '').toLowerCase();
  const c = String(col || '').toLowerCase();
  return Boolean(c) && (msg.includes(c) || (msg.includes('schema cache') && msg.includes(c)));
}

/**
 * Inserta préstamo con reintentos si faltan columnas nuevas (omitir_corte / area_corte).
 * Si se pidió omitir_corte y la columna no existe, falla (hay que correr fix_prestamos_omitir_corte.sql).
 */
async function insertPrestamoCompat(supabase, payload) {
  let { data, error } = await supabase.from('prestamos').insert([payload]).select('*').single();
  if (!error) return { data, error: null };

  if (faltaTablaPrestamos(error)) return { data: null, error, faltaTabla: true };

  const queriaOmitir = Boolean(payload.omitir_corte);
  if (faltaColumnaPrestamo(error, 'omitir_corte') && 'omitir_corte' in payload) {
    if (queriaOmitir) {
      return {
        data: null,
        error: {
          message:
            'Falta la columna omitir_corte en préstamos. Ejecuta supabase/fix_prestamos_omitir_corte.sql en Supabase.',
        },
      };
    }
    const cur = { ...payload };
    delete cur.omitir_corte;
    ({ data, error } = await supabase.from('prestamos').insert([cur]).select('*').single());
    if (!error) return { data, error: null };
  }
  if (error && faltaColumnaPrestamo(error, 'area_corte') && 'area_corte' in (payload || {})) {
    const cur = { ...payload };
    delete cur.omitir_corte;
    const area = cur.area_corte;
    delete cur.area_corte;
    ({ data, error } = await supabase.from('prestamos').insert([cur]).select('*').single());
    if (!error) return { data: { ...data, area_corte: area }, error: null };
  }
  return { data: null, error };
}

export async function registrarPrestamo(supabase, row, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!String(row.nombre_empleado || '').trim()) {
    return { ok: false, error: 'Indica el beneficiario del préstamo.' };
  }

  const monto = Number(row.monto_original) || 0;
  const omitirCorte = Boolean(opts.omitirCorte || row.omitir_corte);
  const areaCorte = omitirCorte
    ? null
    : normalizarAreaCorte(row.area_corte || opts.areaCorte, 'virtual');
  const necesitaSocio = prestamoRequiereSocio(monto);
  const cuotaFija = cuotaSemanalPrestamo(monto);
  const rolActor = normalizarRol(opts.rolActor);
  const esAdminActor = rolActor === 'Administrador';
  const ahora = new Date().toISOString();

  // Usuario MAIN: lo registra el admin; no va a corte; sí a nómina ($500/sem).
  // Si no requiere socio, queda activo de inmediato.
  let estado = 'pendiente_admin';
  let aprobadoAdminPor = null;
  let aprobadoAdminAt = null;
  if (omitirCorte && esAdminActor) {
    if (necesitaSocio) {
      estado = 'pendiente_socio';
      aprobadoAdminPor = opts.nombreActor || null;
      aprobadoAdminAt = ahora;
    } else {
      estado = 'activo';
      aprobadoAdminPor = opts.nombreActor || null;
      aprobadoAdminAt = ahora;
    }
  }

  const payload = {
    ...row,
    area_corte: areaCorte,
    saldo: monto,
    abono: 0,
    estado,
    requiere_aprobacion_socio: necesitaSocio,
    cuota_semanal: cuotaFija,
    cargado_corte: false,
    omitir_corte: omitirCorte,
  };
  if (aprobadoAdminPor) {
    payload.aprobado_admin_por = aprobadoAdminPor;
    payload.aprobado_admin_at = aprobadoAdminAt;
  }

  const { data, error, faltaTabla } = await insertPrestamoCompat(supabase, payload);
  if (faltaTabla) return { ok: false, error: AVISO_FALTA_CONTABILIDAD };
  if (error) return { ok: false, error: error.message };

  const prestamo = { ...data, omitir_corte: omitirCorte, area_corte: data.area_corte ?? areaCorte };

  if (estado === 'pendiente_admin') {
    await crearNotificacion(supabase, {
      sucursal_id: row.sucursal_id,
      tipo: TIPOS_NOTIF.PRESTAMO_ADMIN,
      ref_tabla: 'prestamos',
      ref_id: prestamo.id,
      titulo: `Préstamo pendiente · ${row.nombre_empleado}`,
      mensaje: omitirCorte
        ? `$${monto.toFixed(2)} · solo nómina (sin corte)${necesitaSocio ? ' · requiere socio' : ''}`
        : `$${monto.toFixed(2)} · corte ${areaCorte}${necesitaSocio ? ' · requiere socio' : ''}`,
      area_buzon: areaCorte || undefined,
    });
    return {
      ok: true,
      prestamo,
      pendiente: true,
      mensaje: omitirCorte
        ? 'Préstamo registrado (solo nómina, sin corte). El administrador debe aprobar antes de imprimir.'
        : `Préstamo registrado (corte ${areaCorte}). El administrador debe aprobar antes de imprimir el ticket.`,
      areaCorte,
      omitirCorte,
    };
  }

  if (estado === 'pendiente_socio') {
    await crearNotificacion(supabase, {
      sucursal_id: row.sucursal_id,
      tipo: TIPOS_NOTIF.PRESTAMO_SOCIO,
      ref_tabla: 'prestamos',
      ref_id: prestamo.id,
      titulo: `Préstamo +$1,000 · ${row.nombre_empleado}`,
      mensaje: omitirCorte
        ? `$${monto.toFixed(2)} · solo nómina · espera Antonio, Francisco o José Luis`
        : `$${monto.toFixed(2)} · espera Antonio, Francisco o José Luis`,
    });
    return {
      ok: true,
      prestamo,
      pendienteSocio: true,
      mensaje: omitirCorte
        ? 'Préstamo MAIN registrado (sin corte). Falta autorización de socio (+$1,000).'
        : 'Aprobado por admin. Falta autorización de socio (puede tardar más de 24 h).',
      areaCorte,
      omitirCorte,
    };
  }

  return {
    ok: true,
    prestamo,
    pendiente: false,
    mensaje: omitirCorte
      ? `Préstamo activo (usuario MAIN). No va a corte; en nómina se descuenta $${CUOTA_SEMANAL_MINIMA}/semana hasta liquidar.`
      : `Préstamo registrado (corte ${areaCorte}). El administrador debe aprobar antes de imprimir el ticket.`,
    areaCorte,
    omitirCorte,
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
  const omitirCorte = Boolean(p.omitir_corte);
  const area = omitirCorte
    ? (p.area_corte || null)
    : normalizarAreaCorte(areaCorte || p.area_corte, 'virtual');
  const upd = {
    estado: 'activo',
    cuota_semanal: cuota,
    aprobado_admin_por: nombreAprobador,
    aprobado_admin_at: new Date().toISOString(),
  };
  if (area) upd.area_corte = area;
  let { data, error } = await supabase
    .from('prestamos')
    .update(upd)
    .eq('id', prestamoId)
    .select('*')
    .single();
  if (error && String(error.message || '').toLowerCase().includes('area_corte')) {
    const { area_corte: _a, ...sinArea } = upd;
    ({ data, error } = await supabase
      .from('prestamos')
      .update(sinArea)
      .eq('id', prestamoId)
      .select('*')
      .single());
  }
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, nombreAprobador);
  const debeCargarCorte = cargarCorte && !omitirCorte;
  if (debeCargarCorte) await cargarPrestamoEmpleadoACorte(supabase, { ...data, area_corte: area }, area);
  const prestamoOut = { ...data, area_corte: area ?? data.area_corte, omitir_corte: omitirCorte };
  return {
    ok: true,
    prestamo: prestamoOut,
    cuota,
    mensaje: omitirCorte
      ? `Préstamo activo (solo nómina, sin corte). Cuota $${CUOTA_SEMANAL_MINIMA}/semana. Ya puede imprimir el ticket.`
      : `Préstamo activo y cargado al corte de ${area}. Ya puede imprimir el ticket.`,
  };
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
  const omitirCorte = Boolean(p.omitir_corte);
  const area = omitirCorte
    ? (p.area_corte || null)
    : normalizarAreaCorte(areaCorte || p.area_corte, 'virtual');
  const updSocio = {
    estado: 'activo',
    cuota_semanal: cuota,
    aprobado_socio_por: auth.nombre,
    aprobado_socio_at: new Date().toISOString(),
  };
  if (area) updSocio.area_corte = area;
  const { data, error } = await supabase
    .from('prestamos')
    .update(updSocio)
    .eq('id', prestamoId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, auth.nombre);
  const debeCargarCorte = cargarCorte && !omitirCorte;
  if (debeCargarCorte) await cargarPrestamoEmpleadoACorte(supabase, data, area);
  return {
    ok: true,
    prestamo: { ...data, omitir_corte: omitirCorte },
    cuota,
    mensaje: omitirCorte
      ? `Préstamo autorizado por socio (solo nómina, sin corte). Cuota $${CUOTA_SEMANAL_MINIMA}/semana.`
      : `Préstamo autorizado por socio y cargado al corte de ${area}. Ya puede imprimir.`,
  };
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
  if (!(abono > 0)) return { ok: false, error: 'Monto de abono inválido.' };
  const saldoAntes = Number(prestamo.saldo) || 0;
  if (abono > saldoAntes + 0.001) return { ok: false, error: 'El abono no puede superar el saldo.' };
  const saldo = Math.max(0, Math.round((saldoAntes - abono) * 100) / 100);
  const { error } = await supabase
    .from('prestamos')
    .update({
      saldo,
      abono: (Number(prestamo.abono) || 0) + abono,
      estado: saldo <= 0 ? 'liquidado' : 'activo',
      solicitud_tipo: null,
      solicitud_monto: 0,
      solicitud_por: null,
      solicitud_at: null,
      solicitud_notas: null,
    })
    .eq('id', prestamo.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, saldo, liquidado: saldo <= 0 };
}

/** Descuento al saldo (condonación parcial). No suma al campo abono. */
export async function descontarPrestamo(supabase, prestamo, montoDescuento) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (prestamo.estado !== 'activo') return { ok: false, error: 'El préstamo no está activo.' };
  const desc = Math.max(0, Number(montoDescuento) || 0);
  if (!(desc > 0)) return { ok: false, error: 'Monto de descuento inválido.' };
  const saldoAntes = Number(prestamo.saldo) || 0;
  if (desc > saldoAntes + 0.001) return { ok: false, error: 'El descuento no puede superar el saldo.' };
  const saldo = Math.max(0, Math.round((saldoAntes - desc) * 100) / 100);
  const { error } = await supabase
    .from('prestamos')
    .update({
      saldo,
      estado: saldo <= 0 ? 'liquidado' : 'activo',
      solicitud_tipo: null,
      solicitud_monto: 0,
      solicitud_por: null,
      solicitud_at: null,
      solicitud_notas: null,
    })
    .eq('id', prestamo.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, saldo, liquidado: saldo <= 0 };
}

export async function liquidarPrestamo(supabase, prestamo) {
  const saldo = Number(prestamo?.saldo) || 0;
  if (!(saldo > 0)) return { ok: false, error: 'No hay saldo por liquidar.' };
  return abonarPrestamo(supabase, prestamo, saldo);
}

/**
 * Edita un préstamo a empleado (área de corte, cuota, notas, monto si aún no hay abonos).
 * El cargo al corte usa area_corte (virtual / abarrotes / garage).
 */
export async function editarPrestamo(supabase, prestamo, patch = {}, { nombre } = {}) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  const est = String(prestamo.estado || '');
  if (['liquidado', 'rechazado', 'cancelado'].includes(est)) {
    return { ok: false, error: 'No se puede editar un préstamo liquidado, rechazado o cancelado.' };
  }

  const upd = {};
  if (!prestamo.omitir_corte && patch.area_corte != null && patch.area_corte !== '') {
    const area = normalizarAreaCorte(patch.area_corte, prestamo.area_corte || 'virtual');
    upd.area_corte = area;
  }
  if (patch.cuota_semanal != null && patch.cuota_semanal !== '') {
    // Cuota fija $500/sem en nómina (o el saldo si es menor).
    const saldoRef = Number(prestamo.saldo) || Number(prestamo.monto_original) || 0;
    upd.cuota_semanal = cuotaSemanalPrestamo(saldoRef, CUOTA_SEMANAL_MINIMA);
  }
  if (patch.notas !== undefined) {
    upd.notas = String(patch.notas || '').trim() || null;
  }
  if (patch.nombre_empleado != null && String(patch.nombre_empleado).trim()) {
    upd.nombre_empleado = String(patch.nombre_empleado).trim();
  }

  const abonado = Number(prestamo.abono) || 0;
  const puedeCambiarMonto = abonado <= 0.001 && ['pendiente_admin', 'pendiente_socio', 'activo'].includes(est);
  if (patch.monto_original != null && patch.monto_original !== '' && puedeCambiarMonto) {
    const monto = Number(patch.monto_original);
    if (!(monto > 0)) return { ok: false, error: 'Monto inválido.' };
    upd.monto_original = monto;
    upd.saldo = monto;
    upd.abono = 0;
    upd.requiere_aprobacion_socio = prestamoRequiereSocio(monto);
  } else if (patch.monto_original != null && patch.monto_original !== '' && !puedeCambiarMonto) {
    return { ok: false, error: 'No se puede cambiar el monto si ya hay abonos.' };
  }

  if (prestamo.cargado_corte && upd.area_corte && upd.area_corte !== prestamo.area_corte) {
    return {
      ok: false,
      error: `Ya está cargado al corte de ${prestamo.area_corte}. No se puede cambiar el área.`,
    };
  }

  if (!Object.keys(upd).length) return { ok: false, error: 'Nada que actualizar.' };

  upd.actualizado_por = nombre || null;
  upd.actualizado_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('prestamos')
    .update(upd)
    .eq('id', prestamo.id)
    .select('*')
    .single();
  if (error) {
    // Columnas opcionales de auditoría: reintentar sin ellas
    if (String(error.message || '').toLowerCase().includes('actualizado_')) {
      delete upd.actualizado_por;
      delete upd.actualizado_at;
      const retry = await supabase.from('prestamos').update(upd).eq('id', prestamo.id).select('*').single();
      if (retry.error) return { ok: false, error: retry.error.message };
      return { ok: true, prestamo: retry.data, mensaje: 'Préstamo actualizado.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, prestamo: data, mensaje: 'Préstamo actualizado.' };
}

/** Elimina / cancela un préstamo a empleado. Solo si el corte está abierto (o no cargó). */
export async function eliminarPrestamo(supabase, prestamo, { nombre, motivo } = {}) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  const est = String(prestamo.estado || '');
  if (est === 'liquidado') return { ok: false, error: 'No se puede eliminar un préstamo ya liquidado.' };

  const check = await corteDocumentoEliminable(supabase, {
    cargadoCorte: Boolean(prestamo.cargado_corte),
    sucursal_id: prestamo.sucursal_id,
    modulo: normalizarAreaCorte(prestamo.area_corte, 'virtual'),
    comentarioIlike: `%PRÉSTAMO ${prestamo.nombre_empleado || ''}%`,
    categoria: 'PRESTAMOS',
  });
  if (!check.ok) return check;
  if (!check.eliminable) return { ok: false, error: check.error };

  if (check.idsAbiertos?.length) {
    const { error: eDel } = await supabase.from('cortes_contabilidad_gastos').delete().in('id', check.idsAbiertos);
    if (eDel) return { ok: false, error: eDel.message };
  }

  // Pendiente sin cargar a corte: borrar fila
  if (['pendiente_admin', 'pendiente_socio', 'rechazado'].includes(est) || !prestamo.cargado_corte) {
    const { error } = await supabase.from('prestamos').delete().eq('id', prestamo.id);
    if (error) {
      // Fallback cancelar
    } else {
      await marcarNotificacionAtendida(supabase, 'prestamos', prestamo.id, nombre);
      return { ok: true, eliminado: true, mensaje: 'Préstamo eliminado.' };
    }
  }

  // Activo o ya cargado: cancelar (conserva historial)
  const { data, error } = await supabase
    .from('prestamos')
    .update({
      estado: 'cancelado',
      saldo: 0,
      cargado_corte: false,
      solicitud_tipo: null,
      solicitud_monto: 0,
      solicitud_por: null,
      solicitud_at: null,
      solicitud_notas: null,
      motivo_rechazo: motivo || `Eliminado por ${nombre || 'usuario'}`,
      rechazado_por: nombre || null,
    })
    .eq('id', prestamo.id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamo.id, nombre);
  return {
    ok: true,
    prestamo: data,
    mensaje: 'Préstamo eliminado/cancelado (corte abierto).',
  };
}

function faltaColumnaSolicitud(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('solicitud_tipo') || msg.includes('solicitud_monto') || (msg.includes('column') && msg.includes('solicitud'));
}

export const AVISO_FALTA_SOLICITUDES_PRESTAMO =
  'Faltan columnas de solicitud en préstamos. En Supabase → SQL Editor ejecuta: supabase/fix_prestamos_solicitudes_movimiento.sql';

/**
 * Solicita abono / descuento / liquidación. Queda pendiente hasta que el admin apruebe.
 * tipo: 'abono' | 'descuento' | 'liquidacion'
 */
export async function solicitarMovimientoPrestamo(supabase, prestamo, { tipo, monto, nombre, notas } = {}) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (prestamo.estado !== 'activo') return { ok: false, error: 'Solo en préstamos activos.' };
  if (prestamo.solicitud_tipo) {
    return { ok: false, error: `Ya hay una solicitud pendiente (${prestamo.solicitud_tipo}). Apruébala o recházala primero.` };
  }
  const t = String(tipo || '').toLowerCase();
  if (!['abono', 'descuento', 'liquidacion'].includes(t)) {
    return { ok: false, error: 'Tipo inválido (abono, descuento o liquidacion).' };
  }
  const saldo = Number(prestamo.saldo) || 0;
  let m = Math.max(0, Number(monto) || 0);
  if (t === 'liquidacion') m = saldo;
  if (!(m > 0)) return { ok: false, error: 'Indica un monto válido.' };
  if (m > saldo + 0.001) return { ok: false, error: 'El monto no puede superar el saldo.' };

  const patch = {
    solicitud_tipo: t,
    solicitud_monto: m,
    solicitud_por: nombre || null,
    solicitud_at: new Date().toISOString(),
    solicitud_notas: String(notas || '').trim() || null,
  };
  const { data, error } = await supabase.from('prestamos').update(patch).eq('id', prestamo.id).select('*').single();
  if (error) {
    if (faltaColumnaSolicitud(error)) return { ok: false, error: AVISO_FALTA_SOLICITUDES_PRESTAMO };
    return { ok: false, error: error.message };
  }

  await crearNotificacion(supabase, {
    sucursal_id: prestamo.sucursal_id || 'MAIN',
    tipo: TIPOS_NOTIF.PRESTAMO_ADMIN,
    ref_tabla: 'prestamos',
    ref_id: prestamo.id,
    titulo: `Solicitud ${t} · ${prestamo.nombre_empleado || 'empleado'}`,
    mensaje: `$${m.toFixed(2)} · saldo actual $${saldo.toFixed(2)}${notas ? ` · ${notas}` : ''}`,
  });

  return {
    ok: true,
    prestamo: data,
    mensaje: `Solicitud de ${t} por $${m.toFixed(2)} enviada. El administrador debe aprobarla.`,
  };
}

export async function aprobarMovimientoPrestamo(supabase, prestamo, { nombre } = {}) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  const tipo = String(prestamo.solicitud_tipo || '').toLowerCase();
  const monto = Number(prestamo.solicitud_monto) || 0;
  if (!tipo) return { ok: false, error: 'No hay solicitud pendiente en este préstamo.' };

  let r;
  if (tipo === 'descuento') r = await descontarPrestamo(supabase, prestamo, monto);
  else if (tipo === 'liquidacion') r = await liquidarPrestamo(supabase, prestamo);
  else r = await abonarPrestamo(supabase, prestamo, monto);

  if (!r.ok) return r;
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamo.id, nombre);
  const { data } = await supabase.from('prestamos').select('*').eq('id', prestamo.id).maybeSingle();
  return {
    ok: true,
    prestamo: data,
    mensaje: `${tipo} de $${monto.toFixed(2)} aprobado${r.liquidado ? ' · préstamo liquidado' : ''}.`,
  };
}

export async function rechazarMovimientoPrestamo(supabase, prestamo, { nombre, motivo } = {}) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (!prestamo.solicitud_tipo) return { ok: false, error: 'No hay solicitud pendiente.' };
  const { data, error } = await supabase
    .from('prestamos')
    .update({
      solicitud_tipo: null,
      solicitud_monto: 0,
      solicitud_por: null,
      solicitud_at: null,
      solicitud_notas: motivo ? `Rechazado: ${motivo}` : null,
    })
    .eq('id', prestamo.id)
    .select('*')
    .single();
  if (error) {
    if (faltaColumnaSolicitud(error)) return { ok: false, error: AVISO_FALTA_SOLICITUDES_PRESTAMO };
    return { ok: false, error: error.message };
  }
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamo.id, nombre);
  return { ok: true, prestamo: data, mensaje: 'Solicitud rechazada.' };
}

export function prestamoTieneSolicitudPendiente(p) {
  return Boolean(p?.solicitud_tipo);
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
  const monto = Number(row.monto) || 0;
  if (!(monto > 0)) return { ok: false, error: 'Monto inválido.' };
  const { data, error } = await supabase
    .from('prestamos_interarea')
    .insert([{
      ...row,
      monto,
      saldo: monto,
      abono: 0,
      estado: 'recuperar',
    }])
    .select('*')
    .single();
  if (error?.code === '42P01') return { ok: false, error: 'Ejecuta fix_contabilidad_ampliacion.sql' };
  // Si faltan columnas saldo/abono, reintentar sin ellas
  let prestamoRow = data;
  if (error && /saldo|abono/i.test(String(error.message || ''))) {
    const retry = await supabase
      .from('prestamos_interarea')
      .insert([{ ...row, monto, estado: 'recuperar' }])
      .select('*')
      .single();
    if (retry.error) return { ok: false, error: retry.error.message };
    prestamoRow = retry.data;
  } else if (error) {
    // Schemas viejos sin 'recuperar': caer a activo
    if (/recuperar|estado|check/i.test(String(error.message || ''))) {
      const retryActivo = await supabase
        .from('prestamos_interarea')
        .insert([{
          ...row,
          monto,
          saldo: monto,
          abono: 0,
          estado: 'activo',
        }])
        .select('*')
        .single();
      if (retryActivo.error && /saldo|abono/i.test(String(retryActivo.error.message || ''))) {
        const retry2 = await supabase
          .from('prestamos_interarea')
          .insert([{ ...row, monto, estado: 'activo' }])
          .select('*')
          .single();
        if (retry2.error) return { ok: false, error: retry2.error.message };
        prestamoRow = retry2.data;
      } else if (retryActivo.error) {
        return { ok: false, error: retryActivo.error.message };
      } else {
        prestamoRow = retryActivo.data;
      }
    } else {
      return { ok: false, error: error.message };
    }
  }

  const origenLbl = row.origen || '—';
  const destinoLbl = row.destino || '—';
  await crearNotificacion(supabase, {
    sucursal_id: row.sucursal_id || 'MAIN',
    tipo: TIPOS_NOTIF.PRESTAMO_INTERAREA,
    ref_tabla: 'prestamos_interarea',
    ref_id: prestamoRow.id,
    titulo: `Préstamo entre áreas · ${origenLbl} → ${destinoLbl}`,
    mensaje: `$${Number(row.monto || 0).toFixed(2)}${row.notas ? ` · ${row.notas}` : ''}`,
    area_buzon: row.destino || row.gastos_area || 'abarrotes',
  });

  const corteRes = await cargarPrestamoInterareaACorte(supabase, prestamoRow);
  if (!corteRes.ok) {
    await supabase.from('prestamos_interarea').delete().eq('id', prestamoRow.id);
    return { ok: false, error: corteRes.error || 'No se pudo cargar el préstamo al corte de origen.' };
  }

  return {
    ok: true,
    prestamo: {
      ...prestamoRow,
      cargado_corte: true,
      gasto_id: corteRes.gastoId || null,
    },
    gastoId: corteRes.gastoId,
    moduloCorte: corteRes.modulo,
    aviso: corteRes.aviso,
    mensaje: `Préstamo registrado y cargado como gasto al corte ${corteRes.modulo || origenLbl}.`,
  };
}

function saldoInterarea(p) {
  if (p?.saldo != null && p.saldo !== '') return Number(p.saldo) || 0;
  return Number(p?.monto) || 0;
}

function round2Prestamo(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Plan de abonos automáticos según el negativo de caja del área de origen.
 * Se recupera primero el préstamo más viejo: recovered = sum(saldos) - max(0, -caja).
 * Si cajaActual >= 0, todos quedan en saldo 0 (recuperado).
 */
export function planRecuperacionPrestamosPorNegativo(prestamos, cajaActual) {
  const abiertos = (prestamos || [])
    .filter((p) => prestamoInterareaEstaAbierto(p) && saldoInterarea(p) > 0.001)
    .slice()
    .sort((a, b) => String(a.created_at || a.fecha || '').localeCompare(String(b.created_at || b.fecha || '')));

  if (!abiertos.length) return [];

  const sumSaldos = round2Prestamo(abiertos.reduce((acc, p) => acc + saldoInterarea(p), 0));
  const negativo = round2Prestamo(Math.max(0, -(Number(cajaActual) || 0)));
  let porRecuperar = round2Prestamo(Math.max(0, sumSaldos - negativo));
  const cambios = [];

  for (const p of abiertos) {
    if (porRecuperar <= 0.001) break;
    const saldoAntes = round2Prestamo(saldoInterarea(p));
    const abono = round2Prestamo(Math.min(saldoAntes, porRecuperar));
    if (!(abono > 0.001)) continue;
    const saldoNuevo = round2Prestamo(Math.max(0, saldoAntes - abono));
    porRecuperar = round2Prestamo(Math.max(0, porRecuperar - abono));
    cambios.push({
      prestamo: p,
      saldoAntes,
      saldoNuevo,
      abono,
      recuperado: saldoNuevo <= 0.001,
    });
  }
  return cambios;
}

export function puedeOperarPrestamoAreaSucursal(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente';
}

/** Admin, gerente o repartidor pueden enviar préstamo área → RC Virtual. */
export function puedeRecolectarPrestamoInterareaRc(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente' || r === 'Repartidor';
}

const AVISO_SOLO_ADMIN_GERENTE_PRESTAMO_AREA =
  'Solo administrador o gerente pueden abonar, liquidar o editar préstamos área/sucursal.';

const AVISO_SOLO_RECOLECTAR_PRESTAMO_AREA =
  'Solo administrador, gerente o repartidor pueden recolectar el préstamo hacia RC Virtual.';

function exigirAdminGerentePrestamoArea(opts = {}) {
  if (opts.sistemaAuto) return { ok: true };
  const rol = opts.rolActor ?? opts.user?.rol;
  if (!puedeOperarPrestamoAreaSucursal(rol)) {
    return { ok: false, error: AVISO_SOLO_ADMIN_GERENTE_PRESTAMO_AREA };
  }
  return { ok: true };
}

function exigirPuedeRecolectarPrestamoArea(opts = {}) {
  const rol = opts.rolActor ?? opts.user?.rol;
  if (!puedeRecolectarPrestamoInterareaRc(rol)) {
    return { ok: false, error: AVISO_SOLO_RECOLECTAR_PRESTAMO_AREA };
  }
  return { ok: true };
}

function patchActorLiquidacionInterarea({ nombreActor, sucursal } = {}) {
  const quien = String(nombreActor || '').trim() || null;
  const donde = String(sucursal || '').trim().toUpperCase() || null;
  if (!quien && !donde) return {};
  return {
    liquidado_por: quien,
    liquidado_at: new Date().toISOString(),
    liquidado_sucursal: donde,
  };
}

async function actualizarPrestamoInterarea(supabase, prestamoId, upd) {
  let { data, error } = await supabase.from('prestamos_interarea').update(upd).eq('id', prestamoId).select('*').single();
  if (error && /liquidado_por|liquidado_at|liquidado_sucursal|rc_recibido_por|rc_recibido_at|rc_monto/i.test(String(error.message || ''))) {
    const slim = { ...upd };
    delete slim.liquidado_por;
    delete slim.liquidado_at;
    delete slim.liquidado_sucursal;
    delete slim.rc_recibido_por;
    delete slim.rc_recibido_at;
    delete slim.rc_monto;
    ({ data, error } = await supabase.from('prestamos_interarea').update(slim).eq('id', prestamoId).select('*').single());
  }
  return { data, error };
}

function patchRcRecibidoInterarea(opts = {}, montoRc = 0, prestamo = null) {
  const quien = String(opts.nombreActor || opts.user?.nombre || '').trim() || null;
  if (!quien) return {};
  const prev = Number(prestamo?.rc_monto) || 0;
  return {
    rc_recibido_por: quien,
    rc_recibido_at: new Date().toISOString(),
    rc_monto: Math.round((prev + (Number(montoRc) || 0)) * 100) / 100,
  };
}

export async function abonarPrestamoInterarea(supabase, prestamo, montoAbono, opts = {}) {
  const auth = exigirAdminGerentePrestamoArea(opts);
  if (!auth.ok) return auth;
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  // Abonar = separar dinero. Se permite mientras no se haya recolectado a RC.
  if (prestamo.rc_recibido_por) {
    return { ok: false, error: 'Ya fue recolectado a RC Virtual. No se puede abonar.' };
  }
  if (String(prestamo.estado || '') === 'cancelado') {
    return { ok: false, error: 'El préstamo está cancelado.' };
  }
  if (!prestamoInterareaEstaAbierto(prestamo) && !(Number(prestamo.saldo) > 0.001)) {
    // Legado recuperado sin RC pero con saldo: permitir; si no hay saldo, no.
    if (!(saldoInterarea(prestamo) > 0.001) && !prestamoInterareaPendienteRc(prestamo)) {
      return { ok: false, error: 'El préstamo no está abierto para abonar.' };
    }
  }
  const abono = Math.max(0, Number(montoAbono) || 0);
  if (!(abono > 0)) return { ok: false, error: 'Monto de abono inválido.' };
  const saldoAntes = saldoInterarea(prestamo);
  if (abono > saldoAntes + 0.001) return { ok: false, error: 'El abono no puede superar el saldo.' };
  const saldo = Math.max(0, Math.round((saldoAntes - abono) * 100) / 100);
  const abonoTotal = (Number(prestamo.abono) || 0) + abono;
  // No cerrar a «recuperado» solo por abonar: el dinero quedó separado;
  // falta Recolectar → RC. Si vuelve a ocuparse, se genera otro préstamo.
  const listoRc = String(prestamo.estado || '') === 'por_recolectar' || Boolean(prestamo.colectado_por);
  const estadoAbierto = listoRc ? 'por_recolectar' : 'recuperar';
  const upd = {
    saldo,
    abono: abonoTotal,
    estado: estadoAbierto,
  };
  let { data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, upd);
  if (error && /recuperado|recuperar|por_recolectar/i.test(String(error.message || ''))) {
    const legacy = {
      saldo,
      abono: abonoTotal,
      estado: 'activo',
    };
    ({ data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, legacy));
  }
  if (error && /saldo|abono/i.test(String(error.message || ''))) {
    ({ data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, {
      monto: Math.max(saldo, 0.01),
      estado: estadoAbierto,
    }));
    if (error && /recuperado|recuperar|por_recolectar/i.test(String(error.message || ''))) {
      ({ data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, {
        monto: Math.max(saldo, 0.01),
        estado: 'activo',
      }));
    }
  }
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    prestamo: data,
    saldo,
    liquidado: false,
    recuperado: false,
    separado: saldo <= 0.001,
    mensaje: saldo <= 0.001
      ? 'Dinero separado (saldo $0). Usa Recolectar para enviarlo a RC Virtual.'
      : `Abono ok. Saldo: ${saldo.toFixed(2)}.`,
  };
}

export async function liquidarPrestamoInterarea(supabase, prestamo, opts = {}) {
  const auth = exigirAdminGerentePrestamoArea(opts);
  if (!auth.ok) return auth;
  const saldo = saldoInterarea(prestamo);
  const yaCerrado = ['liquidado', 'recuperado'].includes(String(prestamo?.estado || ''));
  if (!(saldo > 0) && yaCerrado) {
    return { ok: false, error: 'Ya está recuperado.' };
  }
  if (!(saldo > 0)) {
    const actor = patchActorLiquidacionInterarea(opts);
    let { data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, {
      estado: 'recuperado',
      saldo: 0,
      ...actor,
    });
    if (error && /recuperado/i.test(String(error.message || ''))) {
      ({ data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, {
        estado: 'liquidado',
        saldo: 0,
        ...actor,
      }));
    }
    if (error && /saldo/i.test(String(error.message || ''))) {
      ({ data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, {
        estado: 'recuperado',
        ...actor,
      }));
      if (error && /recuperado/i.test(String(error.message || ''))) {
        ({ data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, {
          estado: 'liquidado',
          ...actor,
        }));
      }
    }
    if (error) return { ok: false, error: error.message };
    return { ok: true, prestamo: data, liquidado: true, recuperado: true };
  }
  return abonarPrestamoInterarea(supabase, prestamo, saldo, opts);
}

export async function editarPrestamoInterarea(supabase, prestamo, patch = {}, { user, sucursal } = {}) {
  const auth = exigirAdminGerentePrestamoArea({ user, rolActor: user?.rol });
  if (!auth.ok) return auth;
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (String(prestamo.estado || '') === 'cancelado') {
    return { ok: false, error: 'No se puede editar un préstamo cancelado.' };
  }
  if (prestamo.rc_recibido_por) {
    return { ok: false, error: 'Ya fue recolectado a RC Virtual. No se puede editar.' };
  }
  const authTxt = await asegurarCamposSinReservadoOPin(supabase, [patch.notas], { user, sucursal });
  if (!authTxt.ok) return authTxt;
  const upd = {};
  if (patch.notas !== undefined) upd.notas = String(patch.notas || '').trim() || null;
  if (patch.monto != null && patch.monto !== '' && !(Number(prestamo.abono) > 0)) {
    const m = Number(patch.monto);
    if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
    upd.monto = m;
    upd.saldo = m;
  }
  if (!Object.keys(upd).length) return { ok: false, error: 'Sin cambios.' };
  let { data, error } = await supabase.from('prestamos_interarea').update(upd).eq('id', prestamo.id).select('*').single();
  if (error && /saldo/i.test(String(error.message || ''))) {
    delete upd.saldo;
    ({ data, error } = await supabase.from('prestamos_interarea').update(upd).eq('id', prestamo.id).select('*').single());
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, prestamo: data, mensaje: 'Actualizado.' };
}

/**
 * Ajusta la cantidad pendiente (saldo) de un préstamo, p. ej. al recolectar.
 * Disponible hasta que un rol con privilegios lo recolecte a RC Virtual.
 * Conserva abonos previos: monto = abono + nuevoSaldo.
 */
export async function ajustarCantidadPrestamoInterarea(supabase, prestamo, nuevoSaldo, opts = {}) {
  const auth = exigirAdminGerentePrestamoArea(opts);
  if (!auth.ok) return auth;
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (!prestamoInterareaPendienteRc(prestamo) && !prestamoInterareaPuedeOperarHastaRc(prestamo)) {
    return { ok: false, error: 'Ya fue recolectado a RC Virtual. No se puede ajustar.' };
  }
  if (prestamo.rc_recibido_por) {
    return { ok: false, error: 'Ya fue recolectado a RC Virtual. No se puede ajustar.' };
  }
  const saldo = Math.round((Number(nuevoSaldo) || 0) * 100) / 100;
  if (!(saldo >= 0)) return { ok: false, error: 'Cantidad inválida.' };
  const abono = Math.max(0, Number(prestamo.abono) || 0);
  const monto = Math.round((abono + saldo) * 100) / 100;
  const recuperado = saldo <= 0.001;
  const listoRc = String(prestamo.estado || '') === 'por_recolectar' || Boolean(prestamo.colectado_por);
  const estadoAbierto = listoRc ? 'por_recolectar' : 'recuperar';
  const upd = {
    saldo: recuperado ? 0 : saldo,
    // No cerrar por ajuste a 0 si aún falta recolectar a RC: deja por_recolectar/recuperar.
    estado: recuperado && !listoRc ? 'recuperado' : (recuperado && listoRc ? 'por_recolectar' : estadoAbierto),
    ...(recuperado && !listoRc ? patchActorLiquidacionInterarea(opts) : { monto: Math.max(monto, 0.01) }),
  };
  if (!recuperado) upd.monto = Math.max(monto, 0.01);
  let { data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, upd);
  if (error && /recuperado|recuperar|por_recolectar/i.test(String(error.message || ''))) {
    ({ data, error } = await actualizarPrestamoInterarea(supabase, prestamo.id, {
      ...upd,
      estado: recuperado ? 'liquidado' : 'activo',
    }));
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, prestamo: data, saldo: recuperado ? 0 : saldo, recuperado };
}

/**
 * Recolecta hacia RC Virtual.
 * - Con saldo: abona ese monto y lo envía a RC.
 * - Sin saldo pero con abonos previos (dinero ya separado): solo sella RC con el monto separado.
 */
export async function recolectarPrestamoInterarea(supabase, prestamo, montoRecolectar, opts = {}) {
  const auth = exigirPuedeRecolectarPrestamoArea(opts);
  if (!auth.ok) return auth;
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (!prestamoInterareaPuedeRecolectarRc(prestamo)) {
    return {
      ok: false,
      error: 'No hay saldo ni dinero separado pendiente de recolectar a RC.',
    };
  }

  const actor = String(opts.nombreActor || opts.user?.nombre || '').trim();
  if (!actor) return { ok: false, error: 'No se identificó al usuario que recolecta.' };

  const saldo = saldoInterarea(prestamo);
  const abonado = Number(prestamo.abono) || 0;
  let monto = Math.round((Number(montoRecolectar) || 0) * 100) / 100;

  // Dinero ya separado (Abonar dejó saldo 0): recolectar el abono acumulado a RC.
  const soloSellarRc = !(saldo > 0.001) && abonado > 0.001;
  if (soloSellarRc) {
    if (!(monto > 0)) monto = Math.round(abonado * 100) / 100;
  } else {
    if (!(monto > 0)) return { ok: false, error: 'Indica un monto mayor a cero.' };
    if (monto > saldo + 0.001) {
      return { ok: false, error: `El monto no puede superar el saldo (${saldo.toFixed(2)}).` };
    }
  }

  const { recibirPrestamoInterareaRcVirtual, AVISO_FALTA_R_VIRTUAL } = await import('./rVirtual.js');
  const rc = await recibirPrestamoInterareaRcVirtual(supabase, {
    prestamo,
    monto,
    adminNombre: actor,
    recolectorNombre: prestamo.colectado_por || actor,
  });
  if (!rc.ok) {
    if (/fix_prestamos_interarea_rc_virtual|r_virtual_custodia|origen/i.test(String(rc.error || ''))) {
      return { ok: false, error: rc.error || AVISO_FALTA_RC_PRESTAMO_AREA };
    }
    if (String(rc.error || '').includes('RC Virtual') || String(rc.error || '') === AVISO_FALTA_R_VIRTUAL) {
      return { ok: false, error: rc.error };
    }
    return { ok: false, error: rc.error || 'No se pudo enviar a RC Virtual.' };
  }

  let prestamoFinal = prestamo;
  let saldoFinal = saldo;
  let recuperado = soloSellarRc;

  if (!soloSellarRc) {
    const abonoOpts = {
      ...opts,
      nombreActor: actor,
      sistemaAuto: false,
    };
    const abonoRes = await abonarPrestamoInterarea(supabase, prestamo, monto, abonoOpts);
    if (!abonoRes.ok) {
      return {
        ok: false,
        error: `Ya entró a RC Virtual (${rc.folio || rc.origenId}), pero no se actualizó el préstamo: ${abonoRes.error}`,
        rc,
      };
    }
    prestamoFinal = abonoRes.prestamo || prestamo;
    saldoFinal = abonoRes.saldo;
    recuperado = Number(saldoFinal) <= 0.001;
  }

  const rcPatch = {
    ...patchRcRecibidoInterarea({ nombreActor: actor }, monto, prestamo),
    ...(recuperado
      ? {
          estado: 'recuperado',
          saldo: 0,
          ...patchActorLiquidacionInterarea({ nombreActor: actor, sucursal: opts.sucursal }),
        }
      : {}),
  };
  if (Object.keys(rcPatch).length) {
    const { data: stamped, error: eRc } = await actualizarPrestamoInterarea(
      supabase,
      prestamo.id,
      rcPatch,
    );
    if (!eRc && stamped) {
      return {
        ok: true,
        prestamo: stamped,
        saldo: recuperado ? 0 : saldoFinal,
        recuperado,
        liquidado: recuperado,
        rc,
        mensaje: recuperado
          ? `Recolectado ${monto.toFixed(2)} → RC Virtual. Préstamo cerrado.`
          : `Recolectado ${monto.toFixed(2)} → RC Virtual. Saldo: ${Number(saldoFinal).toFixed(2)}.`,
      };
    }
  }

  return {
    ok: true,
    prestamo: prestamoFinal,
    saldo: saldoFinal,
    recuperado,
    liquidado: recuperado,
    rc,
    mensaje: recuperado
      ? `Recolectado ${monto.toFixed(2)} → RC Virtual. Préstamo cerrado.`
      : `Recolectado ${monto.toFixed(2)} → RC Virtual. Saldo: ${Number(saldoFinal).toFixed(2)}.`,
    aviso: Object.keys(rcPatch).length ? null : AVISO_FALTA_RC_PRESTAMO_AREA,
  };
}

/**
 * Sincroniza saldos de préstamos interárea cuyo origen es el módulo del corte:
 * conforme baja el negativo de caja, se abona automáticamente; a caja >= 0 → recuperado.
 */
export async function sincronizarRecuperacionPrestamosInterarea(supabase, opts = {}) {
  if (!supabase) return { ok: true, cambios: [] };
  const sucursal = String(opts.sucursal || opts.sucursal_id || '').trim() || 'MAIN';
  const modulo = normalizarAreaCorte(opts.modulo || opts.origen, '');
  if (!modulo) return { ok: true, cambios: [], omitido: 'sin_modulo' };
  const cajaActual = Number(opts.cajaActual);
  if (!Number.isFinite(cajaActual)) return { ok: true, cambios: [], omitido: 'sin_caja' };

  const estados = [...ESTADOS_PRESTAMO_INTERAREA_ABIERTOS];
  let q = supabase
    .from('prestamos_interarea')
    .select('*')
    .eq('sucursal_id', sucursal)
    .eq('origen', modulo)
    .in('estado', estados)
    .order('created_at', { ascending: true });
  let { data, error } = await q;
  if (error && /recuperar|por_recolectar/i.test(String(error.message || ''))) {
    ({ data, error } = await supabase
      .from('prestamos_interarea')
      .select('*')
      .eq('sucursal_id', sucursal)
      .eq('origen', modulo)
      .in('estado', ['activo'])
      .order('created_at', { ascending: true }));
  }
  if (error) return { ok: false, error: error.message, cambios: [] };

  // No auto-abonar préstamos ya listos para Recolectar → RC: los botones y el saldo
  // permanecen hasta que un rol con privilegios pulse Recolectar.
  const candidatos = (data || []).filter(
    (p) => String(p.estado || '') !== 'por_recolectar'
      && !p.colectado_por
      && !p.rc_recibido_por,
  );
  const plan = planRecuperacionPrestamosPorNegativo(candidatos, cajaActual);
  if (!plan.length) return { ok: true, cambios: [] };

  const aplicados = [];
  for (const item of plan) {
    if (!(item.abono > 0.001)) continue;
    const res = await abonarPrestamoInterarea(supabase, item.prestamo, item.abono, {
      sistemaAuto: true,
      nombreActor: opts.nombreActor || 'Sistema · recuperación por ventas',
      sucursal,
    });
    if (res.ok) {
      aplicados.push({
        id: item.prestamo.id,
        abono: item.abono,
        saldo: res.saldo,
        recuperado: Boolean(res.recuperado),
      });
    }
  }
  return { ok: true, cambios: aplicados };
}

/**
 * Si al recolectar Virtual (u otro módulo) aún hay deuda abierta hacia un área
 * (p. ej. abarrotes), marca esos préstamos como por_recolectar.
 */
export async function marcarPrestamosInterareaPorRecolectar(supabase, opts = {}) {
  if (!supabase) return { ok: true, count: 0 };
  const sucursal = String(opts.sucursal || opts.sucursal_id || '').trim() || 'MAIN';
  const areaDeuda = normalizarAreaCorte(opts.areaDeuda || 'abarrotes', 'abarrotes');
  const idsExtra = [...new Set((opts.ids || []).map(String).filter(Boolean))];

  const estadosAbiertos = [...ESTADOS_PRESTAMO_INTERAREA_ABIERTOS].filter((e) => e !== 'por_recolectar');
  let lista = [];

  if (idsExtra.length) {
    const { data } = await supabase.from('prestamos_interarea').select('*').in('id', idsExtra);
    lista = data || [];
  }

  let { data: porDestino, error } = await supabase
    .from('prestamos_interarea')
    .select('*')
    .eq('sucursal_id', sucursal)
    .eq('destino', areaDeuda)
    .in('estado', estadosAbiertos);
  if (error && /recuperar|por_recolectar/i.test(String(error.message || ''))) {
    ({ data: porDestino, error } = await supabase
      .from('prestamos_interarea')
      .select('*')
      .eq('sucursal_id', sucursal)
      .eq('destino', areaDeuda)
      .eq('estado', 'activo'));
  }
  if (!error && porDestino?.length) lista = [...lista, ...porDestino];

  let { data: porOrigen } = await supabase
    .from('prestamos_interarea')
    .select('*')
    .eq('sucursal_id', sucursal)
    .eq('origen', areaDeuda)
    .in('estado', estadosAbiertos.length ? estadosAbiertos : ['activo', 'recuperar']);
  if (porOrigen?.length) lista = [...lista, ...porOrigen];

  const vistos = new Set();
  const aMarcar = [];
  for (const p of lista) {
    const id = String(p.id);
    if (vistos.has(id)) continue;
    vistos.add(id);
    if (!prestamoInterareaEstaAbierto(p)) continue;
    if (String(p.estado) === 'por_recolectar') continue;
    if (!(saldoInterarea(p) > 0.001)) continue;
    aMarcar.push(p);
  }
  if (!aMarcar.length) return { ok: true, count: 0 };

  let count = 0;
  for (const p of aMarcar) {
    let { error: eUp } = await supabase
      .from('prestamos_interarea')
      .update({ estado: 'por_recolectar' })
      .eq('id', p.id);
    if (eUp && /por_recolectar/i.test(String(eUp.message || ''))) {
      // sin soporte de estado nuevo: dejar como está
      continue;
    }
    if (!eUp) count += 1;
  }
  return { ok: true, count };
}

/** Interárea carga gasto al corte de origen; solo se borra si ese gasto sigue en corte abierto. */
export async function eliminarPrestamoInterarea(supabase, prestamo) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (prestamo.rc_recibido_por) {
    return { ok: false, error: 'Ya fue recolectado a RC Virtual. No se puede eliminar.' };
  }
  if (['liquidado', 'recuperado'].includes(String(prestamo.estado || '')) && !prestamoInterareaPendienteRc(prestamo)) {
    return { ok: false, error: 'No se puede eliminar un préstamo recuperado.' };
  }
  if (prestamo.colectado_por) {
    return {
      ok: false,
      error: `Ya lo colectó ${prestamo.colectado_por}. No se puede eliminar (usa Recolectar → RC).`,
    };
  }
  const check = await corteDocumentoEliminable(supabase, {
    cargadoCorte: Boolean(prestamo.cargado_corte || prestamo.gasto_id),
    sucursal_id: prestamo.sucursal_id,
    modulo: normalizarAreaCorte(prestamo.origen, 'virtual'),
    comentarioIlike: `%${TOKEN_PRESTAMO_IA}${prestamo.id}%`,
    categoria: 'PRESTAMOS',
    gastoId: prestamo.gasto_id || null,
  });
  if (!check.ok) return check;
  if (!check.eliminable) return { ok: false, error: check.error };

  if (check.idsAbiertos?.length) {
    const { error: eDel } = await supabase.from('cortes_contabilidad_gastos').delete().in('id', check.idsAbiertos);
    if (eDel) return { ok: false, error: eDel.message };
  }

  const { error } = await supabase.from('prestamos_interarea').delete().eq('id', prestamo.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, eliminado: true, mensaje: 'Préstamo entre áreas eliminado.' };
}

export const AVISO_FALTA_PRESTAMOS_SUCURSALES =
  'Falta la tabla de préstamos entre sucursales. Ejecuta supabase/fix_prestamos_sucursales.sql y fix_prestamos_area_colectado.sql';

export const AVISO_FALTA_COLECTA_PRESTAMOS =
  'Para registrar quién colectó el préstamo, ejecuta supabase/fix_prestamos_area_colectado.sql';

function faltaTablaPrestamosSucursales(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('prestamos_sucursales') ||
    (msg.includes('schema cache') && msg.includes('prestamos_sucursales'))
  );
}

/** Lista préstamos entre tiendas visibles para la sucursal (origen o destino). */
export async function listarPrestamosSucursales(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, limit = 100, soloPendientes = false } = opts;
  let q = supabase
    .from('prestamos_sucursales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sucursal) {
    q = q.or(`sucursal_origen.eq.${sucursal},sucursal_destino.eq.${sucursal}`);
  }
  if (soloPendientes) q = q.eq('estado', 'pendiente_cobro');
  const { data, error } = await q;
  if (faltaTablaPrestamosSucursales(error)) return { data: [], aviso: AVISO_FALTA_PRESTAMOS_SUCURSALES };
  return { data: data || [], error: error?.message || null };
}

/**
 * Préstamo de una tienda a otra. Se carga como gasto al corte del área de origen
 * (virtual / abarrotes / garage). Queda pendiente de cobro hasta liquidarse
 * en la sucursal donde se originó.
 * (MAIN no usa este flujo: usa registrarEnvioMainATienda.)
 */
export async function registrarPrestamoSucursal(supabase, row) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const origen = String(row.sucursal_origen || '').trim().toUpperCase();
  const destino = String(row.sucursal_destino || '').trim().toUpperCase();
  if (!origen || !destino) return { ok: false, error: 'Origen y destino son obligatorios.' };
  if (origen === 'MAIN') {
    return {
      ok: false,
      error: 'Desde MAIN usa «Vale envío MAIN → tienda» (se carga al corte, no a contabilidad).',
    };
  }
  if (origen === destino) return { ok: false, error: 'La sucursal destino debe ser distinta a la de origen.' };
  const monto = Number(row.monto);
  if (!(monto > 0)) return { ok: false, error: 'Monto inválido.' };
  const area = String(row.area_corte || row.areaCorte || 'abarrotes').toLowerCase();
  if (!['virtual', 'abarrotes', 'garage'].includes(area)) {
    return { ok: false, error: 'Área de corte inválida (virtual, abarrotes o garage).' };
  }

  const payload = {
    sucursal_origen: origen,
    sucursal_destino: destino,
    monto,
    saldo: monto,
    abono: 0,
    fecha: row.fecha || new Date().toISOString().slice(0, 10),
    notas: row.notas || null,
    estado: 'pendiente_cobro',
    created_by: row.created_by || null,
    area_corte: area,
    tipo: 'sucursal',
  };

  let { data, error } = await supabase.from('prestamos_sucursales').insert([payload]).select('*').single();
  if (error && /area_corte|tipo/i.test(String(error.message || ''))) {
    const slim = { ...payload };
    delete slim.area_corte;
    delete slim.tipo;
    ({ data, error } = await supabase.from('prestamos_sucursales').insert([slim]).select('*').single());
  }
  if (faltaTablaPrestamosSucursales(error)) return { ok: false, error: AVISO_FALTA_PRESTAMOS_SUCURSALES };
  if (error) return { ok: false, error: error.message };

  const corteRes = await cargarPrestamoSucursalACorte(supabase, { ...data, area_corte: area, created_by: payload.created_by }, area);
  if (!corteRes.ok) {
    await supabase.from('prestamos_sucursales').delete().eq('id', data.id);
    return { ok: false, error: corteRes.error || 'No se pudo cargar el préstamo al corte de origen.' };
  }

  await crearNotificacion(supabase, {
    sucursal_id: origen,
    tipo: TIPOS_NOTIF.PRESTAMO_SUCURSAL,
    ref_tabla: 'prestamos_sucursales',
    ref_id: data.id,
    titulo: `Préstamo a sucursal · ${origen} → ${destino}`,
    mensaje: `$${monto.toFixed(2)} en corte ${area} · pendiente de cobro${row.notas ? ` · ${row.notas}` : ''}`,
  });
  await crearNotificacion(supabase, {
    sucursal_id: destino,
    tipo: TIPOS_NOTIF.PRESTAMO_SUCURSAL,
    ref_tabla: 'prestamos_sucursales',
    ref_id: data.id,
    titulo: `Préstamo recibido · ${origen} → ${destino}`,
    mensaje: `$${monto.toFixed(2)} — pagar a ${origen}${row.notas ? ` · ${row.notas}` : ''}`,
  });

  return {
    ok: true,
    prestamo: {
      ...data,
      area_corte: area,
      cargado_corte: true,
      gasto_id: corteRes.gastoId || null,
    },
    gastoId: corteRes.gastoId,
    moduloCorte: corteRes.modulo,
    aviso: corteRes.aviso,
    mensaje: `Préstamo a ${destino} cargado como gasto al corte ${area} de ${origen}. Queda pendiente de cobro.`,
  };
}

/**
 * MAIN manda efectivo a una tienda: se carga al corte de esa tienda al generar.
 * No inyecta moneda/caja y no registra nada en IE / contabilidad.
 */
export async function registrarEnvioMainATienda(supabase, row, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const destino = String(row.sucursal_destino || '').trim().toUpperCase();
  if (!destino || destino === 'MAIN') return { ok: false, error: 'Indica la tienda destino.' };
  const monto = Number(row.monto);
  if (!(monto > 0)) return { ok: false, error: 'Monto inválido.' };
  const area = String(row.area_corte || opts.areaCorte || 'abarrotes').toLowerCase();
  if (!['virtual', 'abarrotes', 'garage'].includes(area)) {
    return { ok: false, error: 'Área de corte inválida (virtual, abarrotes o garage).' };
  }
  const fecha = row.fecha || new Date().toISOString().slice(0, 10);
  const notas = row.notas || null;
  const created_by = row.created_by || opts.nombreActor || null;

  const payload = {
    sucursal_origen: 'MAIN',
    sucursal_destino: destino,
    monto,
    saldo: 0,
    abono: monto,
    fecha,
    notas,
    estado: 'liquidado',
    created_by,
  };

  const { data, error } = await supabase.from('prestamos_sucursales').insert([payload]).select('*').single();
  if (faltaTablaPrestamosSucursales(error)) return { ok: false, error: AVISO_FALTA_PRESTAMOS_SUCURSALES };
  if (error) return { ok: false, error: error.message };

  // Columnas opcionales (fix_prestamos_sucursales_main.sql); ignorar si aún no existen.
  const { error: eExtra } = await supabase
    .from('prestamos_sucursales')
    .update({ area_corte: area, cargado_corte: true, tipo: 'main_envio' })
    .eq('id', data.id);
  if (eExtra && !/column|schema cache/i.test(String(eExtra.message || ''))) {
    /* no bloquear el flujo por metadatos opcionales */
  }

  const { agregarGastoTurno } = await import('./corteContabilidad/store.js');
  const gastoRes = await agregarGastoTurno(
    supabase,
    destino,
    area,
    {
      categoria: 'VALE MAIN',
      subcategoria: 'ENVIO EFECTIVO',
      comentario: `${TOKEN_PRESTAMO_SUC}${data.id} · MAIN → ${destino}${notas ? ` · ${String(notas).toUpperCase()}` : ''}`,
      monto,
    },
    {
      rolActor: opts.rolActor || 'Administrador',
      nombreActor: created_by,
      autoAprobar: true,
      omitirIe: true,
    },
  );
  if (!gastoRes.ok) {
    await supabase.from('prestamos_sucursales').update({ estado: 'cancelado', saldo: monto, abono: 0 }).eq('id', data.id);
    return { ok: false, error: gastoRes.error || 'No se pudo cargar al corte de la tienda.' };
  }

  const gastoId = gastoRes.data?.id || null;
  const { error: eGasto } = await supabase
    .from('prestamos_sucursales')
    .update({ gasto_id: gastoId })
    .eq('id', data.id);
  if (eGasto && !/gasto_id|column|schema cache/i.test(String(eGasto.message || ''))) {
    /* no bloquear */
  }

  await crearNotificacion(supabase, {
    sucursal_id: destino,
    tipo: TIPOS_NOTIF.PRESTAMO_SUCURSAL,
    ref_tabla: 'prestamos_sucursales',
    ref_id: data.id,
    titulo: `Vale MAIN cargado · ${destino}`,
    mensaje: `$${monto.toFixed(2)} en corte ${area} (sin contabilidad)${notas ? ` · ${notas}` : ''}`,
  });

  return {
    ok: true,
    prestamo: {
      ...data,
      area_corte: area,
      cargado_corte: true,
      tipo: 'main_envio',
      estado: 'liquidado',
      saldo: 0,
      abono: monto,
      gasto_id: gastoId,
    },
    gasto: gastoRes.data,
    mensaje: `Vale MAIN → ${destino} cargado al corte ${area}. No se registra en IE/contabilidad.`,
  };
}

/** Abono o liquidación del préstamo entre sucursales (solo en la tienda origen). */
export async function abonarPrestamoSucursal(supabase, prestamo, montoAbono, { nombreActor, rolActor } = {}) {
  const auth = exigirAdminGerentePrestamoArea({ rolActor });
  if (!auth.ok) return auth;
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (prestamo.estado === 'liquidado' || prestamo.estado === 'cancelado') {
    return { ok: false, error: 'Este préstamo ya está cerrado.' };
  }
  const abono = Number(montoAbono);
  if (!(abono > 0)) return { ok: false, error: 'Monto de abono inválido.' };
  const saldoActual = Number(prestamo.saldo) || 0;
  if (abono > saldoActual + 0.001) return { ok: false, error: 'El abono no puede superar el saldo.' };

  const saldo = Math.max(0, Math.round((saldoActual - abono) * 100) / 100);
  const { data, error } = await supabase
    .from('prestamos_sucursales')
    .update({
      saldo,
      abono: (Number(prestamo.abono) || 0) + abono,
      estado: saldo <= 0 ? 'liquidado' : 'pendiente_cobro',
    })
    .eq('id', prestamo.id)
    .select('*')
    .single();
  if (faltaTablaPrestamosSucursales(error)) return { ok: false, error: AVISO_FALTA_PRESTAMOS_SUCURSALES };
  if (error) return { ok: false, error: error.message };

  if (saldo <= 0) {
    await marcarNotificacionAtendida(supabase, 'prestamos_sucursales', prestamo.id, nombreActor || null);
  }
  return { ok: true, prestamo: data, saldo };
}

export {
  cargarValeACorte,
  cargarPrestamoEmpleadoACorte,
  cargarPrestamoInterareaACorte,
  cargarPrestamoSucursalACorte,
  marcarPrestamosColectadosEnRecoleccion,
} from './cargosContabilidad.js';
