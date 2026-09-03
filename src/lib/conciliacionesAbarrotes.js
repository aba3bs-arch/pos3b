/**
 * Conciliaciones Abarrotes — exclusivamente:
 * cobros del repartidor (Recolección en módulo Recolecciones)
 * vs gastos Smoking de Corte Abarrotes.
 */
import { normalizarCodigoTienda, esAlmacenCentral } from '../constants/sucursales.js';
import { inicioDia, finDia, hoyYmdNogales } from './corteCaja.js';
import { esCategoriaProveedores } from './corteContabilidad/catalogoGastos.js';
import { proveedorDesdeGastoCorte } from './ieAbarrotesProveedores.js';
import { normalizarNombreProveedorClave } from './proveedorEntregas.js';
import { fmtMonto, listarRepartidores, fechaClaveDesdeIso } from './controlEfectivo.js';

export const PROVEEDOR_CONCILIACION = 'Smoking';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function ymdDeIso(iso) {
  return fechaClaveDesdeIso(iso) || String(iso || '').slice(0, 10);
}

function enRangoYmd(ymd, desde, hasta) {
  if (!ymd) return false;
  if (desde && ymd < desde) return false;
  if (hasta && ymd > hasta) return false;
  return true;
}

/** True si el gasto de corte es de proveedor Smoking. */
export function esGastoSmokingCorte(gasto) {
  if (!esCategoriaProveedores(gasto?.categoria)) return false;
  const proveedor = proveedorDesdeGastoCorte(gasto);
  const blob = [
    proveedor,
    gasto?.subcategoria,
    gasto?.comentario,
    gasto?.categoria,
  ]
    .map((x) => normalizarNombreProveedorClave(x))
    .join(' ');
  return blob.includes('SMOKING');
}

/**
 * Carga cobros Recolección (entradas) y gastos Smoking de cortes (salidas).
 */
export async function cargarDatosConciliacion(supabase, {
  desde,
  hasta,
  sucursal = null,
  repartidorId = null,
  incluirEnTransito = true,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const suc = sucursal ? normalizarCodigoTienda(sucursal) : null;
  const desdeDt = inicioDia(desde);
  const hastaDt = finDia(hasta);
  const avisos = [];

  const [transitoRes, gastosCorteRes, repsRes] = await Promise.all([
    (async () => {
      let q = supabase
        .from('transito_efectivo')
        .select(
          'id, sucursal_origen, repartidor_id, repartidores(nombre), cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, estatus, descripcion_gasto, fecha_liquidacion, usuario_liquida',
        )
        .eq('tipo_movimiento', 'Recolección')
        .gte('fecha_hora', desdeDt.toISOString())
        .lte('fecha_hora', hastaDt.toISOString())
        .order('fecha_hora', { ascending: false })
        .limit(8000);
      if (repartidorId) q = q.eq('repartidor_id', repartidorId);
      if (suc) q = q.eq('sucursal_origen', suc);
      return q;
    })(),
    (async () => {
      let q = supabase
        .from('cortes_contabilidad_gastos')
        .select('*')
        .eq('modulo', 'abarrotes')
        .ilike('categoria', '%PROVEEDOR%')
        .or('subcategoria.ilike.%Smoking%,comentario.ilike.%Smoking%')
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);
      if (suc) q = q.eq('sucursal_id', suc);
      return q;
    })(),
    listarRepartidores(supabase).catch((e) => {
      avisos.push(`Repartidores: ${e.message}`);
      return [];
    }),
  ]);

  if (transitoRes.error) avisos.push(`Recolecciones: ${transitoRes.error.message}`);
  if (gastosCorteRes.error && gastosCorteRes.error.code !== '42P01') {
    avisos.push(`Gastos Smoking: ${gastosCorteRes.error.message}`);
  }

  const estatusCobroOk = new Set(
    incluirEnTransito
      ? ['En Tránsito', 'Liquidado', 'Por Cobrar']
      : ['Liquidado', 'Por Cobrar'],
  );

  const entradas = [];
  for (const m of transitoRes.data || []) {
    if (!estatusCobroOk.has(m.estatus)) continue;
    if (esAlmacenCentral(m.sucursal_origen)) continue;
    const ymd = ymdDeIso(m.fecha_hora);
    if (!enRangoYmd(ymd, desde, hasta)) continue;
    entradas.push({
      id: `t:${m.id}`,
      fuente: 'transito',
      movimiento_id: m.id,
      grupo: 'recoleccion',
      etiqueta: 'Cobro recolección',
      tipo_movimiento: m.tipo_movimiento,
      estatus: m.estatus,
      monto: round2(m.monto),
      fecha: m.fecha_hora,
      ymd,
      tienda: m.sucursal_origen || '—',
      folio: m.num_traspaso || '—',
      repartidor_id: m.repartidor_id || null,
      repartidor: m.repartidores?.nombre || m.cajero_nombre || '—',
      detalle: m.descripcion_gasto || '',
    });
  }

  const salidas = [];
  for (const g of gastosCorteRes.data || []) {
    if (!esGastoSmokingCorte(g)) continue;
    const est = g.estado_aprobacion;
    if (est && est !== 'aprobado') continue;
    if (esAlmacenCentral(g.sucursal_id)) continue;
    if (suc && normalizarCodigoTienda(g.sucursal_id) !== suc) continue;
    const ymd = ymdDeIso(g.created_at);
    if (!enRangoYmd(ymd, desde, hasta)) continue;
    const proveedor = proveedorDesdeGastoCorte(g);
    salidas.push({
      id: `gp:${g.id}`,
      fuente: 'gasto_smoking_corte',
      movimiento_id: g.id,
      grupo: 'smoking',
      etiqueta: 'Gasto Smoking (corte)',
      monto: round2(g.monto),
      fecha: g.created_at,
      ymd,
      tienda: g.sucursal_id || '—',
      folio: g.subcategoria || '—',
      proveedor,
      categoria: g.categoria,
      subcategoria: g.subcategoria || '',
      detalle: g.comentario || '',
      usuario: g.usuario_nombre || '—',
    });
  }

  const sum = (rows) => round2(rows.reduce((a, r) => a + (Number(r.monto) || 0), 0));

  const resumenEntradas = {
    recoleccion: sum(entradas),
    total: sum(entradas),
    count: entradas.length,
  };

  const resumenSalidas = {
    smoking: sum(salidas),
    total: sum(salidas),
    count: salidas.length,
  };

  return {
    ok: true,
    desde,
    hasta,
    avisos,
    entradas,
    salidas,
    resumenEntradas,
    resumenSalidas,
    diferencia: round2(resumenEntradas.total - resumenSalidas.total),
    repartidores: Array.isArray(repsRes) ? repsRes : [],
    proveedorFijo: PROVEEDOR_CONCILIACION,
  };
}

export function totalesSeleccion(entradas, salidas, selEntradas, selSalidas) {
  const ent = (entradas || []).filter((e) => selEntradas?.[e.id]);
  const sal = (salidas || []).filter((s) => selSalidas?.[s.id]);
  const totalEntradas = round2(ent.reduce((a, r) => a + (Number(r.monto) || 0), 0));
  const totalSalidas = round2(sal.reduce((a, r) => a + (Number(r.monto) || 0), 0));
  return {
    entradas: ent,
    salidas: sal,
    totalEntradas,
    totalSalidas,
    diferencia: round2(totalEntradas - totalSalidas),
  };
}

export function inicializarSeleccion(rows) {
  const out = {};
  for (const r of rows || []) out[r.id] = true;
  return out;
}

function folioConciliacion() {
  const ymd = hoyYmdNogales().replace(/-/g, '');
  const rnd = Math.floor(Math.random() * 900 + 100);
  return `CA-${ymd}-${rnd}`;
}

/**
 * Sella una conciliación Smoking vs cobros (persiste en conciliaciones_abarrotes).
 */
export async function sellarConciliacion(supabase, {
  desde,
  hasta,
  sucursal = null,
  repartidorId = null,
  entradas = [],
  salidas = [],
  totalEntradas = 0,
  totalSalidas = 0,
  diferencia = 0,
  notas = '',
  user = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };
  if (!entradas.length && !salidas.length) {
    return { ok: false, error: 'Selecciona al menos un movimiento para sellar.' };
  }

  const folio = folioConciliacion();
  const detalle = {
    version: 2,
    tipo: 'smoking_vs_recolecciones',
    entradas: entradas.map((e) => ({
      id: e.movimiento_id,
      fuente: e.fuente,
      grupo: e.grupo,
      monto: e.monto,
      tienda: e.tienda,
      folio: e.folio,
      fecha: e.fecha,
      etiqueta: e.etiqueta,
    })),
    salidas: salidas.map((s) => ({
      id: s.movimiento_id,
      fuente: s.fuente,
      grupo: s.grupo,
      monto: s.monto,
      tienda: s.tienda,
      proveedor: s.proveedor,
      folio: s.folio,
      fecha: s.fecha,
      etiqueta: s.etiqueta,
    })),
    resumen: {
      totalEntradas,
      totalSalidas,
      diferencia,
      texto: `Cobros ${fmtMonto(totalEntradas)} − Smoking ${fmtMonto(totalSalidas)} = ${fmtMonto(diferencia)}`,
    },
  };

  const row = {
    folio,
    desde,
    hasta,
    sucursal_id: sucursal || null,
    repartidor_id: repartidorId || null,
    proveedor_filtro: PROVEEDOR_CONCILIACION,
    total_entradas: round2(totalEntradas),
    total_salidas: round2(totalSalidas),
    diferencia: round2(diferencia),
    detalle,
    notas: notas || null,
    estatus: 'sellada',
    usuario_id: user?.id || null,
    usuario_nombre: user?.nombre || null,
  };

  const { data, error } = await supabase
    .from('conciliaciones_abarrotes')
    .insert([row])
    .select('*')
    .single();

  if (error) {
    if (/does not exist|schema cache|42P01/i.test(String(error.message || ''))) {
      return {
        ok: false,
        error: 'Falta la tabla conciliaciones_abarrotes. Ejecuta supabase/fix_conciliaciones_abarrotes.sql en Supabase.',
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function listarConciliaciones(supabase, { desde, hasta, limite = 50 } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  let q = supabase
    .from('conciliaciones_abarrotes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (desde) q = q.gte('desde', desde);
  if (hasta) q = q.lte('hasta', hasta);
  const { data, error } = await q;
  if (error) {
    if (/does not exist|schema cache|42P01/i.test(String(error.message || ''))) {
      return {
        ok: true,
        data: [],
        aviso: 'Ejecuta supabase/fix_conciliaciones_abarrotes.sql para guardar sellados.',
      };
    }
    return { ok: false, error: error.message, data: [] };
  }
  return { ok: true, data: data || [] };
}

export async function anularConciliacion(supabase, id, { user, motivo } = {}) {
  if (!supabase || !id) return { ok: false, error: 'Datos incompletos.' };
  const { error } = await supabase
    .from('conciliaciones_abarrotes')
    .update({
      estatus: 'anulada',
      anulado_at: new Date().toISOString(),
      anulado_por: user?.nombre || null,
      motivo_anulacion: motivo || null,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export { fmtMonto, round2 };
