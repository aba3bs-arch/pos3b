import { etiquetaCategoriaVale, normalizarAreaCorte, valeDescuentaNomina } from './contabilidadConstants.js';

/** Registra un vale aprobado como gasto del turno en el corte del área del beneficiario. */
export async function cargarValeACorte(supabase, vale) {
  if (!supabase || !vale?.id) return { ok: false, error: 'Vale inválido.' };
  if (vale.cargado_corte) return { ok: true, yaCargado: true };
  const modulo = normalizarAreaCorte(vale.area, 'virtual');
  const etiqueta = String(etiquetaCategoriaVale(vale.categoria) || 'CONSUMO').toUpperCase();
  const descuenta =
    vale.descuenta_nomina === true ||
    vale.descuenta_nomina === false
      ? Boolean(vale.descuenta_nomina)
      : valeDescuentaNomina(vale.categoria);
  // Marca NOMINA para que el consolidado de nómina lo tome aunque el label no diga CONSUMO.
  const subcategoria = descuenta && !etiqueta.includes('CONSUMO') && !etiqueta.includes('PERSONAL') && !etiqueta.includes('NOMINA')
    ? `${etiqueta} · NOMINA`
    : etiqueta;
  const payload = {
    sucursal_id: vale.sucursal_id || 'MAIN',
    modulo,
    categoria: 'VALES',
    subcategoria,
    comentario: `VALE ${vale.folio || ''} · ${vale.nombre_empleado}`.trim().toUpperCase(),
    monto: Number(vale.monto) || 0,
    usuario_id: vale.usuario_id || null,
    usuario_nombre: vale.nombre_empleado || null,
    cerrado: false,
    descontado_nomina: false,
  };  const { error: e1 } = await supabase.from('cortes_contabilidad_gastos').insert([payload]);
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await supabase.from('vales').update({ cargado_corte: true }).eq('id', vale.id);
  if (e2) return { ok: false, error: e2.message };
  return { ok: true, modulo };
}

/** Quita el gasto del vale del turno abierto (si aún no se cerró el corte). */
export async function quitarValeDeCorteAbierto(supabase, vale) {
  if (!supabase || !vale?.cargado_corte) return { ok: true };
  const folio = String(vale.folio || '').trim();
  const modulo = normalizarAreaCorte(vale.area, 'virtual');
  let q = supabase
    .from('cortes_contabilidad_gastos')
    .select('id')
    .eq('sucursal_id', vale.sucursal_id || 'MAIN')
    .eq('modulo', modulo)
    .eq('cerrado', false);
  if (folio) q = q.ilike('comentario', `%VALE ${folio}%`);
  else q = q.eq('categoria', 'VALES').eq('usuario_nombre', vale.nombre_empleado || '');
  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01') return { ok: true, aviso: 'Sin tabla de gastos de corte.' };
    return { ok: false, error: error.message };
  }
  const ids = (data || []).map((g) => g.id);
  if (ids.length) {
    const { error: eDel } = await supabase.from('cortes_contabilidad_gastos').delete().in('id', ids);
    if (eDel) return { ok: false, error: eDel.message };
  }
  return { ok: true, removidos: ids.length };
}

/**
 * Carga un RIF vencido como gasto «Fondo requerido» en corte de abarrotes (tienda origen).
 * El Admin puede eliminar el gasto en Corte Abarrotes; el total se ajusta solo.
 */
export async function cargarRifACorte(supabase, rif, opts = {}) {
  if (!supabase || !rif?.id) return { ok: false, error: 'RIF inválido.' };
  if (rif.gasto_id && !rif.gasto_eliminado) return { ok: true, yaCargado: true, gastoId: rif.gasto_id };
  const suc = rif.sucursal_origen || 'MAIN';
  const folio = String(rif.folio || '').trim();
  const payload = {
    sucursal_id: suc,
    modulo: 'abarrotes',
    categoria: 'FONDO_REQUERIDO',
    subcategoria: 'RIF',
    comentario: `RIF ${folio} · Resp. ${rif.responsable_nombre || '—'} · → ${rif.sucursal_destino || ''}`.trim().toUpperCase(),
    monto: Number(rif.monto) || 0,
    usuario_id: rif.responsable_usuario_id || null,
    usuario_nombre: rif.responsable_nombre || null,
    cerrado: false,
    descontado_nomina: false,
  };
  const { data, error: e1 } = await supabase
    .from('cortes_contabilidad_gastos')
    .insert([payload])
    .select('id')
    .single();
  if (e1) return { ok: false, error: e1.message };
  return { ok: true, gastoId: data?.id || null, modulo: 'abarrotes' };
}

/** Quita gasto de RIF del turno abierto (Admin cancela RIF vencido o limpia corte). */
export async function quitarRifDeCorteAbierto(supabase, rif) {
  if (!supabase || !rif) return { ok: true };
  const folio = String(rif.folio || '').trim();
  const suc = rif.sucursal_origen || 'MAIN';
  let ids = [];
  if (rif.gasto_id) {
    ids = [rif.gasto_id];
  } else {
    let q = supabase
      .from('cortes_contabilidad_gastos')
      .select('id')
      .eq('sucursal_id', suc)
      .eq('modulo', 'abarrotes')
      .eq('cerrado', false)
      .eq('categoria', 'FONDO_REQUERIDO');
    if (folio) q = q.ilike('comentario', `%RIF ${folio}%`);
    const { data, error } = await q;
    if (error) {
      if (error.code === '42P01') return { ok: true, aviso: 'Sin tabla de gastos de corte.' };
      return { ok: false, error: error.message };
    }
    ids = (data || []).map((g) => g.id);
  }
  if (ids.length) {
    const { error: eDel } = await supabase.from('cortes_contabilidad_gastos').delete().in('id', ids);
    if (eDel) return { ok: false, error: eDel.message };
  }
  if (rif.id) {
    await supabase
      .from('rifs')
      .update({ gasto_eliminado: true, gasto_id: null })
      .eq('id', rif.id);
  }
  return { ok: true, removidos: ids.length };
}

export async function cargarPrestamoEmpleadoACorte(supabase, prestamo, areaCorte) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (prestamo.cargado_corte) return { ok: true, yaCargado: true };
  const modulo = normalizarAreaCorte(areaCorte || prestamo.area_corte, 'virtual');
  const payload = {
    sucursal_id: prestamo.sucursal_id || 'MAIN',
    modulo,
    categoria: 'PRESTAMOS',
    subcategoria: 'DESEMBOLSO',
    comentario: `PRÉSTAMO ${prestamo.nombre_empleado}`.trim().toUpperCase(),
    monto: Number(prestamo.monto_original) || 0,
    usuario_id: prestamo.usuario_id || null,
    usuario_nombre: prestamo.nombre_empleado || null,
    cerrado: false,
    descontado_nomina: false,
  };
  const { error: e1 } = await supabase.from('cortes_contabilidad_gastos').insert([payload]);
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await supabase
    .from('prestamos')
    .update({ cargado_corte: true, area_corte: modulo })
    .eq('id', prestamo.id);
  if (e2) {
    if (String(e2.message || '').toLowerCase().includes('area_corte')) {
      const { error: e2b } = await supabase.from('prestamos').update({ cargado_corte: true }).eq('id', prestamo.id);
      if (e2b) return { ok: false, error: e2b.message };
    } else {
      return { ok: false, error: e2.message };
    }
  }
  return { ok: true, modulo };
}
