import {
  AVISO_FALTA_CONT_VIRTUAL,
  VALE_A_CONT_VIRTUAL,
  esGastoCubreTurnoOTaxi,
  listarCatalogoContVirtual,
  mapearCorteACatalogo,
  mapearGastoCorteCubreTaxiACatalogo,
  resolverNombresCatalogo,
} from './contVirtualCatalogo.js';
import { etiquetaCategoriaVale } from './valesCategorias.js';
import { pastelDesdeMapa } from './resumenOperativoData.js';

function fechaEfectivaVale(vale) {
  return String(vale?.fecha || vale?.created_at || '').slice(0, 10);
}

function valeEstaAprobado(vale) {
  const e = vale?.estado_aprobacion;
  return !e || e === 'aprobado';
}

function gastoCorteEstaAprobado(gasto) {
  const e = gasto?.estado_aprobacion;
  return !e || e === 'aprobado';
}

function fechaEfectivaGastoCorte(gasto) {
  return String(gasto?.created_at || gasto?.fecha || '').slice(0, 10);
}

const LS_EGRESOS = 'pos3b_cont_virtual_egresos';

function faltaTabla(error) {
  const msg = String(error?.message || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('cont_virtual_egresos') || (msg.includes('schema cache') && msg.includes('cont_virtual'));
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function leerLocal() {
  try {
    const raw = localStorage.getItem(LS_EGRESOS);
    if (raw) {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS_EGRESOS, JSON.stringify(lista.slice(0, 2000)));
  } catch {
    /* quota */
  }
}

function ymdEnRango(ymd, desde, hasta) {
  const f = String(ymd || '').slice(0, 10);
  if (!f) return false;
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
}

/** Categorías de vale que se auto-registran en IE VIRTUAL (área virtual o garage). */
export function valeDebeIrAContVirtual(vale) {
  if (!vale) return false;
  const area = String(vale.area || 'virtual').toLowerCase();
  if (area !== 'virtual' && area !== 'garage') return false;
  if (!valeEstaAprobado(vale)) return false;
  const cat = String(vale.categoria || '').toLowerCase();
  return Boolean(VALE_A_CONT_VIRTUAL[cat]);
}

/**
 * Gastos CUBRE TURNO / TAXIS capturados en Corte Virtual (aprobados)
 * van directo al libro IE VIRTUAL, clasificados por tienda.
 */
export function gastoCorteDebeIrAContVirtual(gasto) {
  if (!gasto) return false;
  if (String(gasto.modulo || '').toLowerCase() !== 'virtual') return false;
  if (!gastoCorteEstaAprobado(gasto)) return false;
  return esGastoCubreTurnoOTaxi(gasto);
}

function normalizarCuentaIe(raw, fallback = 'virtual') {
  const c = String(raw || fallback).toLowerCase();
  return c === 'garage' ? 'garage' : 'virtual';
}

export async function registrarEgresoContVirtual(supabase, row) {
  const monto = round2(row?.monto);
  if (!(monto > 0)) return { ok: false, error: 'Monto inválido.' };
  if (!row?.categoria_id) return { ok: false, error: 'Indica categoría.' };

  const payload = {
    sucursal_id: row.sucursal_id || 'MAIN',
    fecha: String(row.fecha || new Date().toISOString()).slice(0, 10),
    categoria_id: row.categoria_id,
    categoria_nombre: row.categoria_nombre || row.categoria_id,
    subcategoria_id: row.subcategoria_id || null,
    subcategoria_nombre: row.subcategoria_nombre || null,
    monto,
    descripcion: String(row.descripcion || '').trim() || null,
    fuente: row.fuente || 'manual',
    ref_tabla: row.ref_tabla || null,
    ref_id: row.ref_id != null ? String(row.ref_id) : null,
    usuario_nombre: row.usuario_nombre || null,
    cuenta: normalizarCuentaIe(row.cuenta || row.area || row.modulo, 'virtual'),
  };

  if (!supabase) {
    const lista = leerLocal();
    if (payload.ref_tabla && payload.ref_id) {
      const exists = lista.some((e) => e.ref_tabla === payload.ref_tabla && String(e.ref_id) === payload.ref_id);
      if (exists) return { ok: true, yaExiste: true };
    }
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    lista.unshift({ ...payload, id, created_at: new Date().toISOString() });
    guardarLocal(lista);
    return { ok: true, id, soloLocal: true };
  }

  if (payload.ref_tabla && payload.ref_id) {
    const { data: prev } = await supabase
      .from('cont_virtual_egresos')
      .select('id')
      .eq('ref_tabla', payload.ref_tabla)
      .eq('ref_id', payload.ref_id)
      .maybeSingle();
    if (prev?.id) return { ok: true, yaExiste: true, id: prev.id };
  }

  const { data, error } = await supabase.from('cont_virtual_egresos').insert([payload]).select('id').single();
  if (error) {
    if (faltaTabla(error)) {
      const lista = leerLocal();
      const id = `local-${Date.now()}`;
      lista.unshift({ ...payload, id, created_at: new Date().toISOString() });
      guardarLocal(lista);
      return { ok: true, id, soloLocal: true, aviso: AVISO_FALTA_CONT_VIRTUAL };
    }
    // Columna cuenta aún no existe: reintentar sin ella
    if (String(error.message || '').toLowerCase().includes('cuenta')) {
      const { cuenta: _c, ...sinCuenta } = payload;
      const retry = await supabase.from('cont_virtual_egresos').insert([sinCuenta]).select('id').single();
      if (!retry.error) return { ok: true, id: retry.data?.id };
      if (String(retry.error.message || '').toLowerCase().includes('duplicate')) return { ok: true, yaExiste: true };
      return { ok: false, error: retry.error.message };
    }
    if (String(error.message || '').toLowerCase().includes('duplicate')) return { ok: true, yaExiste: true };
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

export async function registrarEgresoDesdeVale(supabase, vale) {
  if (!valeDebeIrAContVirtual(vale)) return { ok: true, omitido: true };
  const map = VALE_A_CONT_VIRTUAL[String(vale.categoria || '').toLowerCase()];
  if (!map) return { ok: true, omitido: true };

  const catRes = await listarCatalogoContVirtual(supabase);
  const nombres = resolverNombresCatalogo(catRes.data, map.categoriaId, map.subcategoriaId);

  return registrarEgresoContVirtual(supabase, {
    sucursal_id: vale.sucursal_id || 'MAIN',
    fecha: fechaEfectivaVale(vale),
    categoria_id: map.categoriaId,
    categoria_nombre: nombres.categoria_nombre,
    subcategoria_id: map.subcategoriaId,
    subcategoria_nombre: nombres.subcategoria_nombre,
    monto: vale.monto,
    descripcion: `VALE ${vale.folio || ''} · ${etiquetaCategoriaVale(vale.categoria)} · ${vale.nombre_empleado || ''}`.trim(),
    fuente: 'vale',
    ref_tabla: 'vales',
    ref_id: vale.id,
    usuario_nombre: vale.nombre_empleado || vale.autorizado_por || null,
    cuenta: normalizarCuentaIe(vale.area, 'virtual'),
  });
}

export async function registrarEgresoDesdeGastoCorte(supabase, gasto) {
  if (!gastoCorteDebeIrAContVirtual(gasto)) return { ok: true, omitido: true };
  const map = mapearGastoCorteCubreTaxiACatalogo(gasto);
  if (!map) return { ok: true, omitido: true };

  const catRes = await listarCatalogoContVirtual(supabase);
  const nombres = resolverNombresCatalogo(catRes.data, map.categoriaId, map.subcategoriaId);
  const catLbl = String(gasto.categoria || '').trim().toUpperCase();
  const subLbl = String(gasto.subcategoria || '').trim().toUpperCase();
  const nota = String(gasto.comentario || '').trim();

  return registrarEgresoContVirtual(supabase, {
    sucursal_id: gasto.sucursal_id || 'MAIN',
    fecha: fechaEfectivaGastoCorte(gasto) || new Date().toISOString().slice(0, 10),
    categoria_id: map.categoriaId,
    categoria_nombre: nombres.categoria_nombre,
    subcategoria_id: map.subcategoriaId,
    subcategoria_nombre: nombres.subcategoria_nombre,
    monto: gasto.monto,
    descripcion: [catLbl, subLbl, nota].filter(Boolean).join(' · '),
    fuente: 'corte',
    ref_tabla: 'cortes_contabilidad_gastos',
    ref_id: gasto.id,
    usuario_nombre: gasto.usuario_nombre || gasto.solicitado_por || null,
    cuenta: 'virtual',
  });
}

export async function eliminarEgresoContVirtual(supabase, id) {
  if (!id) return { ok: false, error: 'ID inválido.' };
  if (!supabase || String(id).startsWith('local-')) {
    guardarLocal(leerLocal().filter((e) => String(e.id) !== String(id)));
    return { ok: true };
  }
  const { data: row } = await supabase.from('cont_virtual_egresos').select('fuente').eq('id', id).maybeSingle();
  if (row && row.fuente !== 'manual') {
    return { ok: false, error: 'Solo se pueden borrar egresos capturados manualmente.' };
  }
  const { error } = await supabase.from('cont_virtual_egresos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listarEgresosContVirtual(supabase, { desde, hasta, sucursal } = {}) {
  if (!supabase) {
    let lista = leerLocal();
    lista = lista.filter((e) => ymdEnRango(e.fecha, desde, hasta));
    if (sucursal) lista = lista.filter((e) => e.sucursal_id === sucursal);
    return { data: lista };
  }
  let q = supabase.from('cont_virtual_egresos').select('*').order('fecha', { ascending: false }).limit(3000);
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let lista = leerLocal().filter((e) => ymdEnRango(e.fecha, desde, hasta));
    if (sucursal) lista = lista.filter((e) => e.sucursal_id === sucursal);
    return { data: lista, aviso: AVISO_FALTA_CONT_VIRTUAL };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

/** Backfill: vales Virtual (gasolina/herramienta/accesorios/consumo) aún no en el libro. */
export async function sincronizarValesContVirtual(supabase, { limit = 400 } = {}) {
  if (!supabase) return { ok: true, count: 0 };
  const { data, error } = await supabase
    .from('vales')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(limit);
  if (error) {
    if (faltaTabla(error) || error.code === '42P01') return { ok: true, count: 0 };
    return { ok: false, error: error.message };
  }
  let count = 0;
  for (const v of data || []) {
    if (!valeDebeIrAContVirtual(v)) continue;
    const res = await registrarEgresoDesdeVale(supabase, v);
    if (res.ok && !res.yaExiste && !res.omitido) count += 1;
  }
  return { ok: true, count };
}

/** Backfill: gastos CUBRE TURNO / TAXIS de Corte Virtual aún no en el libro IE. */
export async function sincronizarGastosCubreTaxiContVirtual(supabase, { limit = 500 } = {}) {
  if (!supabase) return { ok: true, count: 0 };
  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('modulo', 'virtual')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (faltaTabla(error) || error.code === '42P01') return { ok: true, count: 0 };
    return { ok: false, error: error.message };
  }
  let count = 0;
  for (const g of data || []) {
    if (!gastoCorteDebeIrAContVirtual(g)) continue;
    const res = await registrarEgresoDesdeGastoCorte(supabase, g);
    if (res.ok && !res.yaExiste && !res.omitido) count += 1;
  }
  return { ok: true, count };
}

/**
 * Unifica egresos del periodo: libro Cont Virtual + gastos de corte (no VALES duplicados) + préstamos.
 */
export function unificarEgresosParaPanel({
  egresosLibro = [],
  gastosCorte = [],
  prestamos = [],
  catalogo = [],
}) {
  const refsVale = new Set(
    (egresosLibro || [])
      .filter((e) => e.ref_tabla === 'vales' && e.ref_id)
      .map((e) => String(e.ref_id)),
  );
  const refsGastoCorte = new Set(
    (egresosLibro || [])
      .filter((e) => e.ref_tabla === 'cortes_contabilidad_gastos' && e.ref_id)
      .map((e) => String(e.ref_id)),
  );

  const detalle = [];

  for (const e of egresosLibro || []) {
    detalle.push({
      id: e.id,
      fecha: String(e.fecha || '').slice(0, 10),
      tienda: e.sucursal_id,
      categoria: e.categoria_nombre || e.categoria_id,
      categoria_id: e.categoria_id,
      subcategoria: e.subcategoria_nombre || e.subcategoria_id || '',
      subcategoria_id: e.subcategoria_id,
      comentario: e.descripcion,
      empleado: e.usuario_nombre,
      monto: round2(e.monto),
      fuente: e.fuente || 'manual',
      borrable: e.fuente === 'manual',
      cuenta: normalizarCuentaIe(e.cuenta, 'virtual'),
    });
  }

  for (const g of gastosCorte || []) {
    if (!gastoCorteEstaAprobado(g)) continue;
    const catRaw = String(g.categoria || '').toUpperCase();
    if (catRaw === 'VALES') continue; // los vales van por el libro / sync
    if (catRaw === 'PRESTAMOS') continue;
    // CUBRE TURNO / TAXIS Virtual van al libro (sync); evitar doble conteo
    if (esGastoCubreTurnoOTaxi(g) || refsGastoCorte.has(String(g.id))) continue;
    const map = mapearCorteACatalogo(g.categoria, g.subcategoria);
    const nombres = resolverNombresCatalogo(catalogo, map.categoriaId, map.subcategoriaId);
    detalle.push({
      id: `corte-${g.id}`,
      fecha: String(g.created_at || '').slice(0, 10),
      tienda: g.sucursal_id,
      categoria: nombres.categoria_nombre,
      categoria_id: map.categoriaId,
      subcategoria: nombres.subcategoria_nombre,
      subcategoria_id: map.subcategoriaId,
      comentario: g.comentario,
      empleado: g.usuario_nombre,
      monto: round2(g.monto),
      fuente: 'corte',
      borrable: false,
      cuenta: normalizarCuentaIe(g.modulo, 'virtual'),
    });
  }

  for (const p of prestamos || []) {
    const nombres = resolverNombresCatalogo(catalogo, 'prestamos', 'prestamos-desembolso');
    detalle.push({
      id: `prestamo-${p.id}`,
      fecha: String(p.created_at || p.aprobado_admin_at || '').slice(0, 10),
      tienda: p.sucursal_id,
      categoria: nombres.categoria_nombre,
      categoria_id: 'prestamos',
      subcategoria: nombres.subcategoria_nombre,
      subcategoria_id: 'prestamos-desembolso',
      comentario: p.nombre_empleado,
      empleado: p.nombre_empleado,
      monto: round2(p.monto_original),
      fuente: 'prestamo',
      borrable: false,
      cuenta: normalizarCuentaIe(p.area_corte, 'virtual'),
    });
  }

  detalle.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const porCategoria = {};
  const porSubcategoria = {};
  for (const d of detalle) {
    const ck = d.categoria_id || d.categoria || 'otros';
    const sk = d.subcategoria_id || `${ck}|${d.subcategoria}` || 'otros';
    porCategoria[ck] = round2((porCategoria[ck] || 0) + d.monto);
    porSubcategoria[sk] = {
      id: sk,
      categoria_id: d.categoria_id,
      label: d.subcategoria ? `${d.categoria} / ${d.subcategoria}` : d.categoria,
      total: round2(((porSubcategoria[sk] && porSubcategoria[sk].total) || 0) + d.monto),
    };
  }

  const pastelCategorias = pastelDesdeMapa(
    Object.fromEntries(
      Object.entries(porCategoria).map(([k, total]) => {
        const nombre = catalogo.find((c) => c.id === k)?.nombre || k;
        return [nombre, total];
      }),
    ),
  );

  const pastelSubcategorias = Object.values(porSubcategoria)
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  const pastelSub = pastelDesdeMapa(Object.fromEntries(pastelSubcategorias.map((x) => [x.label, x.total])));

  const egresosTotal = round2(detalle.reduce((a, d) => a + d.monto, 0));

  return {
    detalle,
    egresosTotal,
    porCategoria,
    pastelCategorias,
    pastelSubcategorias: pastelSub,
    refsValeCount: refsVale.size,
  };
}
