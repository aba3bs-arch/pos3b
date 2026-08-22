import { etiquetaCategoriaVale, normalizarAreaCorte, valeDescuentaNomina } from './contabilidadConstants.js';

/**
 * ¿El gasto ligado a un documento sigue en un corte abierto (cerrado=false)?
 * Si nunca se cargó a corte → eliminable.
 * Si está en corte cerrado → no eliminable.
 */
export async function corteDocumentoEliminable(supabase, opts = {}) {
  const {
    cargadoCorte = false,
    sucursal_id,
    modulo,
    comentarioIlike,
    categoria,
    gastoId,
  } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión.', eliminable: false };
  if (!cargadoCorte && !gastoId) {
    return { ok: true, eliminable: true, motivo: 'sin_corte', idsAbiertos: [], idsCerrados: [] };
  }

  let idsAbiertos = [];
  let idsCerrados = [];

  if (gastoId) {
    const { data, error } = await supabase
      .from('cortes_contabilidad_gastos')
      .select('id, cerrado')
      .eq('id', gastoId)
      .maybeSingle();
    if (error && error.code !== '42P01') return { ok: false, error: error.message, eliminable: false };
    if (data) {
      if (data.cerrado) idsCerrados.push(data.id);
      else idsAbiertos.push(data.id);
    } else {
      return { ok: true, eliminable: true, motivo: 'gasto_no_encontrado', idsAbiertos: [], idsCerrados: [] };
    }
  } else {
    let q = supabase
      .from('cortes_contabilidad_gastos')
      .select('id, cerrado')
      .eq('sucursal_id', sucursal_id || 'MAIN');
    if (modulo) q = q.eq('modulo', modulo);
    if (categoria) q = q.eq('categoria', categoria);
    if (comentarioIlike) q = q.ilike('comentario', comentarioIlike);
    const { data, error } = await q;
    if (error) {
      if (error.code === '42P01') return { ok: true, eliminable: true, motivo: 'sin_tabla', idsAbiertos: [], idsCerrados: [] };
      return { ok: false, error: error.message, eliminable: false };
    }
    for (const g of data || []) {
      if (g.cerrado) idsCerrados.push(g.id);
      else idsAbiertos.push(g.id);
    }
  }

  if (idsCerrados.length && !idsAbiertos.length) {
    return {
      ok: true,
      eliminable: false,
      motivo: 'corte_cerrado',
      error: 'El documento ya está en un corte cerrado. No se puede eliminar.',
      idsAbiertos,
      idsCerrados,
    };
  }
  if (idsAbiertos.length) {
    return { ok: true, eliminable: true, motivo: 'corte_abierto', idsAbiertos, idsCerrados };
  }
  return { ok: true, eliminable: true, motivo: 'sin_gasto', idsAbiertos: [], idsCerrados: [] };
}

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
  if (prestamo.omitir_corte) {
    return { ok: false, error: 'Este préstamo es solo nómina (usuario MAIN); no se carga a corte.' };
  }
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

/** Token en el comentario del gasto para ligar el préstamo al corte / recolección. */
export const TOKEN_PRESTAMO_IA = 'PRESTAMO-IA:';
export const TOKEN_PRESTAMO_SUC = 'PRESTAMO-SUC:';

const UUID_EN_COMENTARIO = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

function faltaColumnaMsg(error, nombres = []) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (!msg) return false;
  return nombres.some((n) => msg.includes(String(n).toLowerCase()));
}

export function comentarioGastoPrestamoInterarea(prestamo) {
  const origen = String(prestamo?.origen || '').toUpperCase();
  const destino = String(prestamo?.destino || '').toUpperCase();
  const notas = String(prestamo?.notas || '').trim();
  const extra = notas ? ` · ${notas.toUpperCase()}` : '';
  return `${TOKEN_PRESTAMO_IA}${prestamo.id} · ${origen}→${destino}${extra}`;
}

export function comentarioGastoPrestamoSucursal(prestamo) {
  const origen = String(prestamo?.sucursal_origen || '').toUpperCase();
  const destino = String(prestamo?.sucursal_destino || '').toUpperCase();
  const notas = String(prestamo?.notas || '').trim();
  const extra = notas ? ` · ${notas.toUpperCase()}` : '';
  return `${TOKEN_PRESTAMO_SUC}${prestamo.id} · ${origen}→${destino}${extra}`;
}

export function idsPrestamosDesdeGastosRecoleccion(gastos = []) {
  const iaRe = new RegExp(`${TOKEN_PRESTAMO_IA}(${UUID_EN_COMENTARIO})`, 'i');
  const sucRe = new RegExp(`${TOKEN_PRESTAMO_SUC}(${UUID_EN_COMENTARIO})`, 'i');
  const interarea = [];
  const sucursales = [];
  const gastoIds = [];
  for (const g of gastos || []) {
    if (g?.id != null && g.id !== '' && !String(g.id).startsWith('local-')) {
      gastoIds.push(String(g.id));
    }
    const c = String(g?.comentario || '');
    const mIa = c.match(iaRe);
    if (mIa) interarea.push(mIa[1].toLowerCase());
    const mSuc = c.match(sucRe);
    if (mSuc) sucursales.push(mSuc[1].toLowerCase());
  }
  return {
    interarea: [...new Set(interarea)],
    sucursales: [...new Set(sucursales)],
    gastoIds: [...new Set(gastoIds)],
  };
}

async function marcarPrestamoCargadoCorte(supabase, tabla, prestamoId, { gastoId, areaCorte } = {}) {
  const full = {
    cargado_corte: true,
    gasto_id: gastoId || null,
  };
  if (areaCorte) full.area_corte = areaCorte;
  let { error } = await supabase.from(tabla).update(full).eq('id', prestamoId);
  if (error && faltaColumnaMsg(error, ['area_corte'])) {
    const noArea = { cargado_corte: true, gasto_id: gastoId || null };
    ({ error } = await supabase.from(tabla).update(noArea).eq('id', prestamoId));
  }
  if (error && faltaColumnaMsg(error, ['gasto_id'])) {
    ({ error } = await supabase.from(tabla).update({ cargado_corte: true }).eq('id', prestamoId));
  }
  if (error && faltaColumnaMsg(error, ['cargado_corte'])) {
    return { ok: true, aviso: 'Falta ejecutar supabase/fix_prestamos_area_colectado.sql' };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, gastoId };
}

/**
 * Carga un préstamo entre áreas como gasto del corte de origen
 * (virtual / abarrotes / garage). No va a IE: es movimiento interno.
 */
export async function cargarPrestamoInterareaACorte(supabase, prestamo) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (prestamo.cargado_corte && prestamo.gasto_id) return { ok: true, yaCargado: true, gastoId: prestamo.gasto_id };
  const modulo = normalizarAreaCorte(prestamo.origen, 'virtual');
  const payload = {
    sucursal_id: prestamo.sucursal_id || 'MAIN',
    modulo,
    categoria: 'PRESTAMOS',
    subcategoria: 'AREA',
    comentario: comentarioGastoPrestamoInterarea(prestamo),
    monto: Number(prestamo.monto) || 0,
    usuario_nombre: prestamo.created_by || null,
    cerrado: false,
    descontado_nomina: false,
    estado_aprobacion: 'aprobado',
    solicitado_por: prestamo.created_by || null,
  };
  let { data, error: e1 } = await supabase
    .from('cortes_contabilidad_gastos')
    .insert([payload])
    .select('id')
    .single();
  if (e1 && faltaColumnaMsg(e1, ['estado_aprobacion', 'solicitado_por', 'descontado_nomina'])) {
    const slim = { ...payload };
    delete slim.estado_aprobacion;
    delete slim.solicitado_por;
    delete slim.descontado_nomina;
    ({ data, error: e1 } = await supabase.from('cortes_contabilidad_gastos').insert([slim]).select('id').single());
  }
  if (e1) return { ok: false, error: e1.message };
  const gastoId = data?.id || null;
  const marked = await marcarPrestamoCargadoCorte(supabase, 'prestamos_interarea', prestamo.id, { gastoId });
  if (!marked.ok) return marked;
  return { ok: true, modulo, gastoId, aviso: marked.aviso };
}

/**
 * Carga un préstamo entre sucursales (o envío MAIN) como gasto del corte de origen.
 */
export async function cargarPrestamoSucursalACorte(supabase, prestamo, areaCorte) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  if (prestamo.cargado_corte && prestamo.gasto_id) return { ok: true, yaCargado: true, gastoId: prestamo.gasto_id };
  const modulo = normalizarAreaCorte(areaCorte || prestamo.area_corte, 'abarrotes');
  const suc = String(prestamo.sucursal_origen || '').toUpperCase() || 'MAIN';
  const payload = {
    sucursal_id: suc,
    modulo,
    categoria: 'PRESTAMOS',
    subcategoria: 'SUCURSAL',
    comentario: comentarioGastoPrestamoSucursal(prestamo),
    monto: Number(prestamo.monto) || 0,
    usuario_nombre: prestamo.created_by || null,
    cerrado: false,
    descontado_nomina: false,
    estado_aprobacion: 'aprobado',
    solicitado_por: prestamo.created_by || null,
  };
  let { data, error: e1 } = await supabase
    .from('cortes_contabilidad_gastos')
    .insert([payload])
    .select('id')
    .single();
  if (e1 && faltaColumnaMsg(e1, ['estado_aprobacion', 'solicitado_por', 'descontado_nomina'])) {
    const slim = { ...payload };
    delete slim.estado_aprobacion;
    delete slim.solicitado_por;
    delete slim.descontado_nomina;
    ({ data, error: e1 } = await supabase.from('cortes_contabilidad_gastos').insert([slim]).select('id').single());
  }
  if (e1) return { ok: false, error: e1.message };
  const gastoId = data?.id || null;
  const marked = await marcarPrestamoCargadoCorte(supabase, 'prestamos_sucursales', prestamo.id, {
    gastoId,
    areaCorte: modulo,
  });
  if (!marked.ok) return marked;
  return { ok: true, modulo, gastoId, aviso: marked.aviso };
}

function patchColectaPrestamo({ recolectorNombre, folio, modulo }) {
  return {
    colectado_por: recolectorNombre || null,
    colectado_at: new Date().toISOString(),
    colectado_folio: folio || null,
    colectado_modulo: modulo || null,
  };
}

async function aplicarColectaPrestamos(supabase, tabla, ids, patch) {
  const uniq = [...new Set((ids || []).map((id) => String(id).toLowerCase()).filter(Boolean))];
  if (!uniq.length) return { ok: true, count: 0 };
  let { data, error } = await supabase
    .from(tabla)
    .update(patch)
    .in('id', uniq)
    .is('colectado_por', null)
    .select('id');
  if (error && faltaColumnaMsg(error, ['colectado_modulo'])) {
    const slim = { ...patch };
    delete slim.colectado_modulo;
    ({ data, error } = await supabase
      .from(tabla)
      .update(slim)
      .in('id', uniq)
      .is('colectado_por', null)
      .select('id'));
  }
  if (error && faltaColumnaMsg(error, ['colectado_por', 'colectado_at', 'colectado_folio'])) {
    return { ok: true, count: 0, aviso: 'Falta ejecutar supabase/fix_prestamos_area_colectado.sql' };
  }
  if (error) return { ok: false, error: error.message, count: 0 };
  return { ok: true, count: (data || []).length };
}

async function idsPrestamosPorGastoId(supabase, tabla, gastoIds) {
  const ids = [...new Set((gastoIds || []).map(String).filter((id) => id && !id.startsWith('local-')))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from(tabla).select('id, gasto_id').in('gasto_id', ids);
  if (error) return [];
  return (data || []).map((r) => String(r.id));
}

/**
 * Cuando el recolector cierra la recolección de Virtual / Abarrotes / Garage,
 * sella en el préstamo quién colectó si ese préstamo viajó como gasto del corte.
 */
export async function marcarPrestamosColectadosEnRecoleccion(supabase, opts = {}) {
  if (!supabase) return { ok: true, count: 0 };
  const {
    sucursal,
    modulo,
    gastos = [],
    gastosIds = [],
    recolectorNombre,
    folio,
  } = opts;
  const nombre = String(recolectorNombre || '').trim();
  if (!nombre) return { ok: true, count: 0, omitido: 'sin_recolector' };

  let listaGastos = Array.isArray(gastos) ? [...gastos] : [];
  const idsSet = new Set(
    [...gastosIds, ...listaGastos.map((g) => g?.id)]
      .map((id) => (id != null && id !== '' ? String(id) : ''))
      .filter((id) => id && !id.startsWith('local-')),
  );

  const parsed = idsPrestamosDesdeGastosRecoleccion(listaGastos);
  parsed.gastoIds.forEach((id) => idsSet.add(id));

  const haveIds = new Set(
    listaGastos.filter((g) => g?.id != null && g.id !== '').map((g) => String(g.id)),
  );
  const missing = [...idsSet].filter((id) => !haveIds.has(id));
  if (missing.length) {
    const { data } = await supabase
      .from('cortes_contabilidad_gastos')
      .select('id, comentario, categoria, subcategoria')
      .in('id', missing);
    if (data?.length) {
      listaGastos = [...listaGastos, ...data];
    }
  }

  const fromComments = idsPrestamosDesdeGastosRecoleccion(listaGastos);
  fromComments.gastoIds.forEach((id) => idsSet.add(id));

  const [iaPorGasto, sucPorGasto] = await Promise.all([
    idsPrestamosPorGastoId(supabase, 'prestamos_interarea', [...idsSet]),
    idsPrestamosPorGastoId(supabase, 'prestamos_sucursales', [...idsSet]),
  ]);

  const iaIds = [...new Set([...fromComments.interarea, ...iaPorGasto])];
  const sucIds = [...new Set([...fromComments.sucursales, ...sucPorGasto])];

  if (!iaIds.length && !sucIds.length) return { ok: true, count: 0 };

  const patch = patchColectaPrestamo({ recolectorNombre: nombre, folio, modulo: modulo || null });
  const [iaRes, sucRes] = await Promise.all([
    aplicarColectaPrestamos(supabase, 'prestamos_interarea', iaIds, patch),
    aplicarColectaPrestamos(supabase, 'prestamos_sucursales', sucIds, patch),
  ]);

  // Préstamos interárea aún con saldo → por_recolectar (deuda vigente al recolectar).
  if (iaIds.length) {
    try {
      const { data: abiertos } = await supabase
        .from('prestamos_interarea')
        .select('id, saldo, monto, estado')
        .in('id', iaIds);
      for (const p of abiertos || []) {
        const saldo = p.saldo != null ? Number(p.saldo) : Number(p.monto) || 0;
        const est = String(p.estado || '');
        if (!(saldo > 0.001)) continue;
        if (['recuperado', 'liquidado', 'cancelado'].includes(est)) continue;
        if (est === 'por_recolectar') continue;
        await supabase.from('prestamos_interarea').update({ estado: 'por_recolectar' }).eq('id', p.id);
      }
    } catch {
      /* no bloquear */
    }
  }

  const aviso = iaRes.aviso || sucRes.aviso || null;
  if (!iaRes.ok && !sucRes.ok) {
    return { ok: false, error: iaRes.error || sucRes.error, count: 0, aviso };
  }
  return {
    ok: true,
    count: (iaRes.count || 0) + (sucRes.count || 0),
    interarea: iaRes.count || 0,
    sucursales: sucRes.count || 0,
    sucursal: sucursal || null,
    aviso,
  };
}
