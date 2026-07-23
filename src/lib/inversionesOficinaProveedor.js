import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { registrarEgresoContVirtual } from './contVirtualEgresos.js';
import { agregarGastoTurno } from './corteContabilidad/store.js';
import { crearNotificacion, marcarNotificacionAtendida, TIPOS_NOTIF } from './contabilidadNotificaciones.js';
import { LIBRO_IE_ANTONIO, LIBRO_IE_FRANCISCO } from './contabilidadDepartamentos.js';

export const AVISO_FALTA_INVERSIONES_OFICINA =
  'Falta la tabla de inversiones oficina→proveedor. Ejecuta supabase/fix_inversiones_oficina_proveedor.sql en Supabase.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('inversiones_oficina_proveedor') ||
    (msg.includes('schema cache') && msg.includes('inversiones_oficina'))
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function hoyYmd() {
  return new Date().toISOString().slice(0, 10);
}

/** Cuenta IE y módulo de corte sugeridos según el libro. */
export function defaultsInversionPorLibro(libro) {
  const esFran = libro === LIBRO_IE_FRANCISCO || libro === 'francisco';
  if (esFran) {
    return { libro: LIBRO_IE_FRANCISCO, cuenta: 'abarrotes', modulo_corte: 'abarrotes' };
  }
  return { libro: LIBRO_IE_ANTONIO, cuenta: 'virtual', modulo_corte: 'virtual' };
}

export async function listarInversionesOficina(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursalDestino, libro, soloPendientes = false, limit = 100 } = opts;
  let q = supabase
    .from('inversiones_oficina_proveedor')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sucursalDestino) q = q.eq('sucursal_destino', normalizarCodigoTienda(sucursalDestino));
  if (libro) q = q.eq('libro', libro);
  if (soloPendientes) q = q.eq('estado', 'pendiente_cobro');
  const { data, error } = await q;
  if (faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_INVERSIONES_OFICINA };
  return { data: data || [], error: error?.message || null };
}

/**
 * Registra inversión: egreso en IE + pendiente de cobro en tienda destino.
 */
export async function registrarInversionOficinaProveedor(supabase, row, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const defs = defaultsInversionPorLibro(row.libro || opts.libro);
  const destino = normalizarCodigoTienda(row.sucursal_destino);
  if (!destino) return { ok: false, error: 'Indica la tienda donde se recuperará la inversión.' };
  const monto = round2(row.monto);
  if (!(monto > 0)) return { ok: false, error: 'Monto inválido.' };

  const cuenta = row.cuenta || defs.cuenta;
  const modulo_corte = row.modulo_corte || defs.modulo_corte;
  const libro = defs.libro;
  const proveedor = String(row.proveedor_nombre || '').trim();
  const fecha = String(row.fecha || hoyYmd()).slice(0, 10);
  const notas = String(row.notas || '').trim() || null;
  const created_by = opts.nombreActor || row.created_by || null;

  const descIe = [
    'Inversión oficina → proveedor',
    proveedor || null,
    `Recupera: ${destino}`,
    notas,
  ]
    .filter(Boolean)
    .join(' · ');

  const egreso = await registrarEgresoContVirtual(supabase, {
    sucursal_id: row.sucursal_origen || 'MAIN',
    fecha,
    cuenta,
    categoria_id: 'operativos',
    categoria_nombre: 'Gastos operativos',
    subcategoria_id: 'operativos-otros',
    subcategoria_nombre: 'Otros',
    monto,
    descripcion: descIe,
    fuente: 'manual',
    usuario_nombre: created_by,
  });
  if (!egreso.ok) return { ok: false, error: egreso.error || 'No se pudo registrar el egreso en IE.' };

  const payload = {
    sucursal_origen: normalizarCodigoTienda(row.sucursal_origen) || 'MAIN',
    libro,
    cuenta,
    sucursal_destino: destino,
    modulo_corte,
    proveedor_nombre: proveedor || null,
    monto,
    saldo: monto,
    abono: 0,
    fecha,
    notas,
    estado: 'pendiente_cobro',
    egreso_ie_id: egreso.id != null ? String(egreso.id) : null,
    created_by,
  };

  const { data, error } = await supabase.from('inversiones_oficina_proveedor').insert([payload]).select('*').single();
  if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_INVERSIONES_OFICINA };
  if (error) return { ok: false, error: error.message };

  // Enlaza ref del egreso si se pudo
  if (egreso.id && !egreso.soloLocal) {
    await supabase
      .from('cont_virtual_egresos')
      .update({
        ref_tabla: 'inversiones_oficina_proveedor',
        ref_id: String(data.id),
        descripcion: descIe,
      })
      .eq('id', egreso.id);
  }

  await crearNotificacion(supabase, {
    sucursal_id: destino,
    tipo: TIPOS_NOTIF.INVERSION_OFICINA,
    ref_tabla: 'inversiones_oficina_proveedor',
    ref_id: data.id,
    titulo: `Inversión a recuperar · ${destino}`,
    mensaje: `$${monto.toFixed(2)}${proveedor ? ` · ${proveedor}` : ''} — cobrar en corte ${modulo_corte}${notas ? ` · ${notas}` : ''}`,
  });

  return {
    ok: true,
    inversion: data,
    egresoId: egreso.id,
    mensaje: `Inversión registrada en IE (${libro === 'francisco' ? 'ABARROTES' : 'VIRTUAL'}). Pendiente de cobro en ${destino}.`,
  };
}

/**
 * Cobra (total o abono) en el corte de la tienda: baja caja + reduce saldo de la inversión.
 */
export async function cobrarInversionEnCorte(supabase, inversion, montoCobro, opts = {}) {
  if (!supabase || !inversion?.id) return { ok: false, error: 'Inversión inválida.' };
  if (inversion.estado !== 'pendiente_cobro') return { ok: false, error: 'Esta inversión ya no está pendiente.' };

  const sucursal = normalizarCodigoTienda(opts.sucursal || inversion.sucursal_destino);
  const modulo = opts.modulo || inversion.modulo_corte || 'abarrotes';
  if (sucursal !== normalizarCodigoTienda(inversion.sucursal_destino)) {
    return { ok: false, error: `El cobro debe hacerse en la tienda ${inversion.sucursal_destino}.` };
  }
  if (String(modulo) !== String(inversion.modulo_corte)) {
    return {
      ok: false,
      error: `Cobra esta inversión en el corte de ${inversion.modulo_corte} (no en ${modulo}).`,
    };
  }

  const saldo = round2(inversion.saldo);
  let monto = round2(montoCobro);
  if (!(monto > 0)) return { ok: false, error: 'Monto de cobro inválido.' };
  if (monto > saldo) monto = saldo;

  const gastoRes = await agregarGastoTurno(
    supabase,
    sucursal,
    modulo,
    {
      categoria: 'INVERSION OFICINA',
      subcategoria: 'RECUPERACION PROVEEDOR',
      comentario: `INV ${String(inversion.id).slice(0, 8)} · ${inversion.proveedor_nombre || 'Proveedor'}${inversion.notas ? ` · ${inversion.notas}` : ''}`.toUpperCase(),
      monto,
    },
    { rolActor: opts.rolActor, nombreActor: opts.nombreActor, autoAprobar: true },
  );
  if (!gastoRes.ok) return { ok: false, error: gastoRes.error || 'No se pudo cargar el gasto al corte.' };

  const nuevoSaldo = round2(saldo - monto);
  const nuevoAbono = round2((Number(inversion.abono) || 0) + monto);
  const estado = nuevoSaldo <= 0 ? 'liquidado' : 'pendiente_cobro';

  const { data: actualizada, error } = await supabase
    .from('inversiones_oficina_proveedor')
    .update({ saldo: Math.max(0, nuevoSaldo), abono: nuevoAbono, estado })
    .eq('id', inversion.id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };

  await supabase.from('inversiones_oficina_proveedor_abonos').insert([
    {
      inversion_id: inversion.id,
      monto,
      fecha: hoyYmd(),
      sucursal_id: sucursal,
      modulo,
      gasto_corte_id: gastoRes.data?.id || null,
      usuario_nombre: opts.nombreActor || null,
    },
  ]);

  if (estado === 'liquidado') {
    await marcarNotificacionAtendida(supabase, 'inversiones_oficina_proveedor', inversion.id, opts.nombreActor);
  }

  return {
    ok: true,
    inversion: actualizada,
    gasto: gastoRes.data,
    pendiente: gastoRes.pendiente,
    mensaje:
      estado === 'liquidado'
        ? `Inversión liquidada. Se descontaron $${monto.toFixed(2)} del corte.`
        : `Abono $${monto.toFixed(2)}. Saldo pendiente: $${nuevoSaldo.toFixed(2)}.`,
  };
}

export async function cancelarInversionOficina(supabase, inversionId, { nombre } = {}) {
  if (!supabase || !inversionId) return { ok: false, error: 'Inversión inválida.' };
  const { data: inv, error: e0 } = await supabase
    .from('inversiones_oficina_proveedor')
    .select('*')
    .eq('id', inversionId)
    .single();
  if (e0 || !inv) return { ok: false, error: 'No encontrada.' };
  if (inv.estado === 'liquidado') return { ok: false, error: 'Ya está liquidada; no se puede cancelar.' };
  if (Number(inv.abono) > 0) {
    return { ok: false, error: 'Ya tiene abonos. No se puede cancelar; liquida el saldo restante en el corte.' };
  }
  const { error } = await supabase
    .from('inversiones_oficina_proveedor')
    .update({ estado: 'cancelado', saldo: 0 })
    .eq('id', inversionId);
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'inversiones_oficina_proveedor', inversionId, nombre);
  return { ok: true };
}
