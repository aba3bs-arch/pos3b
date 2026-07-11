import { etiquetaCategoriaVale, normalizarAreaCorte } from './contabilidadConstants.js';

/** Registra un vale aprobado como gasto del turno en el corte del área del beneficiario. */
export async function cargarValeACorte(supabase, vale) {
  if (!supabase || !vale?.id) return { ok: false, error: 'Vale inválido.' };
  if (vale.cargado_corte) return { ok: true, yaCargado: true };
  const modulo = normalizarAreaCorte(vale.area, 'virtual');
  const payload = {
    sucursal_id: vale.sucursal_id || 'MAIN',
    modulo,
    categoria: 'VALES',
    subcategoria: String(etiquetaCategoriaVale(vale.categoria) || 'CONSUMO').toUpperCase(),
    comentario: `VALE ${vale.folio || ''} · ${vale.nombre_empleado}`.trim().toUpperCase(),
    monto: Number(vale.monto) || 0,
    usuario_id: vale.usuario_id || null,
    usuario_nombre: vale.nombre_empleado || null,
    cerrado: false,
    descontado_nomina: false,
  };
  const { error: e1 } = await supabase.from('cortes_contabilidad_gastos').insert([payload]);
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
