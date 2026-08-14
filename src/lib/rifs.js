import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { crearNotificacion, TIPOS_NOTIF, emitirRefreshNotificaciones } from './contabilidadNotificaciones.js';
import { cargarRifACorte, quitarRifDeCorteAbierto } from './cargosContabilidad.js';

export const AVISO_FALTA_RIFS =
  'Falta la tabla rifs. En Supabase → SQL Editor ejecuta: supabase/fix_rifs.sql';

export const ESTADOS_RIF = ['abierto', 'liquidado', 'vencido', 'cancelado'];

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('rifs');
}

let folioRifLocal = 0;

export async function siguienteFolioRif(supabase) {
  if (!supabase) {
    folioRifLocal += 1;
    return `RIF-${String(folioRifLocal).padStart(4, '0')}`;
  }
  const { data, error } = await supabase
    .from('rifs')
    .select('folio')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error && faltaTabla(error)) {
    folioRifLocal += 1;
    return `RIF-${String(folioRifLocal).padStart(4, '0')}`;
  }
  let max = 0;
  for (const row of data || []) {
    const m = String(row.folio || '').match(/RIF-(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return `RIF-${String(max + 1).padStart(4, '0')}`;
}

export function etiquetaEstadoRif(estado) {
  const map = {
    abierto: 'Abierto',
    liquidado: 'Liquidado',
    vencido: 'Vencido (en corte)',
    cancelado: 'Cancelado',
  };
  return map[estado] || estado || '—';
}

export function rifPuedeLiquidar(rif) {
  return rif?.estado === 'abierto' || rif?.estado === 'vencido';
}

export function rifPuedeAbonar(rif) {
  return rif?.estado === 'abierto' || rif?.estado === 'vencido';
}

export function rifPuedeImprimir(rif) {
  return rif && rif.estado !== 'cancelado';
}

export function rifPuedeCancelar(rif) {
  return rif?.estado === 'abierto' || rif?.estado === 'vencido';
}

export async function listarRifs(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, estado, limit = 100, todasTiendas = false } = opts;
  let q = supabase.from('rifs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sucursal && !todasTiendas) {
    const s = normalizarCodigoTienda(sucursal) || sucursal;
    q = q.or(`sucursal_origen.eq.${s},sucursal_destino.eq.${s}`);
  }
  if (estado) q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_RIFS };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

/**
 * Crea RIF. No carga a corte al emitir; solo si vence la hora promesa.
 */
export async function registrarRif(supabase, row, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const origen = normalizarCodigoTienda(row.sucursal_origen) || row.sucursal_origen;
  const destino = normalizarCodigoTienda(row.sucursal_destino) || row.sucursal_destino;
  const responsable = String(row.responsable_nombre || '').trim();
  const monto = Number(row.monto);
  const horaPromesa = row.hora_promesa;
  if (!origen) return { ok: false, error: 'Indica tienda origen.' };
  if (!destino) return { ok: false, error: 'Indica tienda receptora.' };
  if (origen === destino) return { ok: false, error: 'Origen y receptora deben ser distintas.' };
  if (!responsable) return { ok: false, error: 'Indica el responsable del RIF.' };
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'Monto inválido.' };
  if (!horaPromesa) return { ok: false, error: 'Indica hora promesa de pago.' };
  const tPromesa = new Date(horaPromesa).getTime();
  if (!Number.isFinite(tPromesa)) return { ok: false, error: 'Hora promesa inválida.' };

  const folio = row.folio || (await siguienteFolioRif(supabase));
  const payload = {
    folio,
    sucursal_origen: origen,
    sucursal_destino: destino,
    responsable_nombre: responsable,
    responsable_usuario_id: row.responsable_usuario_id || null,
    monto,
    motivo: String(row.motivo || '').trim() || null,
    hora_promesa: new Date(horaPromesa).toISOString(),
    estado: 'abierto',
    emitido_por: opts.usuarioNombre || row.emitido_por || null,
    emitido_por_id: opts.usuarioId || row.emitido_por_id || null,
    emitido_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('rifs').insert([payload]).select('*').single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_RIFS };
  if (error) return { ok: false, error: error.message };

  await crearNotificacion(supabase, {
    sucursal_id: origen,
    tipo: TIPOS_NOTIF.RIF_ABIERTO,
    ref_tabla: 'rifs',
    ref_id: data.id,
    titulo: `RIF ${folio}`,
    mensaje: `${etiquetaTienda(origen)} → ${etiquetaTienda(destino)} · ${responsable} · $${monto.toFixed(2)} · promesa ${new Date(data.hora_promesa).toLocaleString('es-MX')}`,
    area_buzon: 'abarrotes',
  });

  return { ok: true, rif: data };
}

export async function liquidarRif(supabase, id, opts = {}) {
  if (!supabase || !id) return { ok: false, error: 'RIF inválido.' };
  const { data: rif, error: e0 } = await supabase.from('rifs').select('*').eq('id', id).maybeSingle();
  if (e0 && faltaTabla(e0)) return { ok: false, error: AVISO_FALTA_RIFS };
  if (e0) return { ok: false, error: e0.message };
  if (!rif) return { ok: false, error: 'RIF no encontrado.' };
  if (!rifPuedeLiquidar(rif)) {
    return { ok: false, error: `No se puede liquidar: estado ${etiquetaEstadoRif(rif.estado)}.` };
  }

  // Si estaba vencido en corte abierto, quitar el gasto al liquidar.
  if (rif.estado === 'vencido' && (rif.gasto_id || !rif.gasto_eliminado)) {
    const q = await quitarRifDeCorteAbierto(supabase, rif);
    if (!q.ok) return q;
  }

  const { data, error } = await supabase
    .from('rifs')
    .update({
      estado: 'liquidado',
      liquidado_por: opts.usuarioNombre || null,
      liquidado_at: new Date().toISOString(),
      saldo: 0,
      gasto_eliminado: true,
      gasto_id: null,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error && /saldo|gasto_/i.test(String(error.message || ''))) {
    const retry = await supabase
      .from('rifs')
      .update({
        estado: 'liquidado',
        liquidado_por: opts.usuarioNombre || null,
        liquidado_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (retry.error) return { ok: false, error: retry.error.message };
    return afterLiquidarRif(supabase, rif, retry.data, opts);
  }
  if (error) return { ok: false, error: error.message };
  return afterLiquidarRif(supabase, rif, data, opts);
}

async function afterLiquidarRif(supabase, rif, data, opts) {
  try {
    await crearNotificacion(supabase, {
      sucursal_id: rif.sucursal_origen,
      tipo: TIPOS_NOTIF.RIF_LIQUIDADO,
      ref_tabla: 'rifs',
      ref_id: rif.id,
      titulo: `RIF ${rif.folio} liquidado`,
      mensaje: `Liquidó ${opts.usuarioNombre || '—'} · ${etiquetaTienda(rif.sucursal_origen)}`,
      area_buzon: 'abarrotes',
    });
  } catch {
    /* ignore */
  }
  emitirRefreshNotificaciones();
  return { ok: true, rif: data };
}

export async function abonarRif(supabase, rif, montoAbono, opts = {}) {
  if (!supabase || !rif?.id) return { ok: false, error: 'RIF inválido.' };
  if (!rifPuedeAbonar(rif)) return { ok: false, error: 'Solo se abona a RIF abiertos o vencidos.' };
  const abono = Math.max(0, Number(montoAbono) || 0);
  if (!(abono > 0)) return { ok: false, error: 'Monto inválido.' };
  const montoAntes = Number(rif.saldo != null ? rif.saldo : rif.monto) || 0;
  if (abono > montoAntes + 0.001) return { ok: false, error: 'El abono no puede superar el saldo.' };
  const saldo = Math.max(0, Math.round((montoAntes - abono) * 100) / 100);
  if (saldo <= 0.001) return liquidarRif(supabase, rif.id, opts);

  if (!opts.hora_promesa) {
    return { ok: false, error: 'En abono parcial indica la nueva promesa de pago (fecha y hora).' };
  }
  const t = new Date(opts.hora_promesa).getTime();
  if (!Number.isFinite(t)) return { ok: false, error: 'Nueva promesa de pago inválida.' };

  const upd = {
    monto: saldo,
    saldo,
    hora_promesa: new Date(opts.hora_promesa).toISOString(),
  };

  let { data, error } = await supabase
    .from('rifs')
    .update(upd)
    .eq('id', rif.id)
    .select('*')
    .single();
  if (error && /saldo/i.test(String(error.message || ''))) {
    const sinSaldo = { ...upd };
    delete sinSaldo.saldo;
    ({ data, error } = await supabase.from('rifs').update(sinSaldo).eq('id', rif.id).select('*').single());
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, rif: data, saldo, abono };
}

export async function editarRif(supabase, rif, patch = {}, opts = {}) {
  if (!supabase || !rif?.id) return { ok: false, error: 'RIF inválido.' };
  if (!['abierto', 'vencido'].includes(String(rif.estado || ''))) {
    return { ok: false, error: 'Solo se editan RIF abiertos o vencidos.' };
  }
  const { asegurarCamposSinReservadoOPin } = await import('./reservadoAdminPrincipal.js');
  const authTxt = await asegurarCamposSinReservadoOPin(
    supabase,
    [patch.motivo, patch.responsable_nombre],
    { user: opts.user, sucursal: opts.sucursal },
  );
  if (!authTxt.ok) return authTxt;

  const upd = {};
  if (patch.motivo !== undefined) upd.motivo = String(patch.motivo || '').trim() || null;
  if (patch.responsable_nombre != null && String(patch.responsable_nombre).trim()) {
    upd.responsable_nombre = String(patch.responsable_nombre).trim();
  }
  if (patch.monto != null && patch.monto !== '' && rif.estado === 'abierto') {
    const m = Number(patch.monto);
    if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
    upd.monto = m;
    upd.saldo = m;
  }
  if (patch.hora_promesa) {
    const t = new Date(patch.hora_promesa).getTime();
    if (!Number.isFinite(t)) return { ok: false, error: 'Hora promesa inválida.' };
    upd.hora_promesa = new Date(patch.hora_promesa).toISOString();
  }
  if (!Object.keys(upd).length) return { ok: false, error: 'Sin cambios.' };
  let { data, error } = await supabase.from('rifs').update(upd).eq('id', rif.id).select('*').single();
  if (error && /saldo/i.test(String(error.message || ''))) {
    delete upd.saldo;
    ({ data, error } = await supabase.from('rifs').update(upd).eq('id', rif.id).select('*').single());
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, rif: data, mensaje: 'RIF actualizado.' };
}

/** Elimina RIF solo si el gasto de corte (si existe) sigue abierto. */
export async function eliminarRif(supabase, rif, opts = {}) {
  if (!supabase || !rif?.id) return { ok: false, error: 'RIF inválido.' };
  if (rif.estado === 'liquidado') return { ok: false, error: 'No se puede eliminar un RIF liquidado.' };

  const { corteDocumentoEliminable } = await import('./cargosContabilidad.js');
  const check = await corteDocumentoEliminable(supabase, {
    cargadoCorte: Boolean(rif.gasto_id && !rif.gasto_eliminado) || rif.estado === 'vencido',
    sucursal_id: rif.sucursal_origen,
    modulo: 'abarrotes',
    categoria: 'FONDO_REQUERIDO',
    comentarioIlike: rif.folio ? `%RIF ${rif.folio}%` : undefined,
    gastoId: rif.gasto_id || null,
  });
  if (!check.ok) return check;
  if (!check.eliminable) return { ok: false, error: check.error };

  if (check.idsAbiertos?.length) {
    const { error: eDel } = await supabase.from('cortes_contabilidad_gastos').delete().in('id', check.idsAbiertos);
    if (eDel) return { ok: false, error: eDel.message };
  }

  const { error } = await supabase.from('rifs').delete().eq('id', rif.id);
  if (error) {
    return cancelarRif(supabase, rif.id, { usuarioNombre: opts.usuarioNombre });
  }
  return { ok: true, eliminado: true, mensaje: 'RIF eliminado.' };
}

export async function cancelarRif(supabase, id, opts = {}) {
  if (!supabase || !id) return { ok: false, error: 'RIF inválido.' };
  const { data: rif, error: e0 } = await supabase.from('rifs').select('*').eq('id', id).maybeSingle();
  if (e0 && faltaTabla(e0)) return { ok: false, error: AVISO_FALTA_RIFS };
  if (e0) return { ok: false, error: e0.message };
  if (!rif) return { ok: false, error: 'RIF no encontrado.' };
  if (!rifPuedeCancelar(rif)) return { ok: false, error: 'Solo se cancelan RIF abiertos o vencidos.' };

  if (rif.estado === 'vencido' && rif.gasto_id && !rif.gasto_eliminado) {
    const q = await quitarRifDeCorteAbierto(supabase, rif);
    if (!q.ok) return q;
  }

  const { data, error } = await supabase
    .from('rifs')
    .update({ estado: 'cancelado' })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, rif: data };
}

/**
 * Procesa RIF abiertos cuya hora promesa ya pasó → vencido + gasto en corte abarrotes (tienda origen).
 */
export async function procesarRifsVencidos(supabase, opts = {}) {
  if (!supabase) return { ok: true, procesados: 0 };
  const ahora = opts.ahora ? new Date(opts.ahora) : new Date();
  const { data, error } = await supabase
    .from('rifs')
    .select('*')
    .eq('estado', 'abierto')
    .lte('hora_promesa', ahora.toISOString())
    .limit(80);
  if (error && faltaTabla(error)) return { ok: true, procesados: 0, aviso: AVISO_FALTA_RIFS };
  if (error) return { ok: false, error: error.message, procesados: 0 };

  let procesados = 0;
  const errores = [];
  for (const rif of data || []) {
    const cargo = await cargarRifACorte(supabase, rif, {
      usuarioNombre: opts.usuarioNombre || 'sistema',
    });
    if (!cargo.ok) {
      errores.push(`${rif.folio}: ${cargo.error}`);
      continue;
    }
    const { error: eUp } = await supabase
      .from('rifs')
      .update({
        estado: 'vencido',
        gasto_id: cargo.gastoId || rif.gasto_id || null,
      })
      .eq('id', rif.id)
      .eq('estado', 'abierto');
    if (eUp) {
      errores.push(`${rif.folio}: ${eUp.message}`);
      continue;
    }
    procesados += 1;
    try {
      await crearNotificacion(supabase, {
        sucursal_id: rif.sucursal_origen,
        tipo: TIPOS_NOTIF.RIF_VENCIDO,
        ref_tabla: 'rifs',
        ref_id: rif.id,
        titulo: `RIF ${rif.folio} vencido → corte`,
        mensaje: `Fondo requerido $${Number(rif.monto).toFixed(2)} · Resp. ${rif.responsable_nombre} · ${etiquetaTienda(rif.sucursal_origen)}`,
        area_buzon: 'abarrotes',
      });
    } catch {
      /* ignore */
    }
  }
  if (procesados) emitirRefreshNotificaciones();
  return { ok: errores.length === 0, procesados, errores };
}

/** Marca gasto_eliminado cuando Admin borra el gasto del corte (llamado desde store si aplica). */
export async function marcarGastoRifEliminado(supabase, gastoId) {
  if (!supabase || !gastoId) return { ok: true };
  const { error } = await supabase
    .from('rifs')
    .update({ gasto_eliminado: true, gasto_id: null })
    .eq('gasto_id', gastoId);
  if (error && !faltaTabla(error)) return { ok: false, error: error.message };
  return { ok: true };
}
