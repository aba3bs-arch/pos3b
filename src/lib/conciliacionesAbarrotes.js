/**
 * Conciliaciones Abarrotes — recolecciones + cobros de crédito
 * vs gastos PROVEEDORES (efectivo) del Corte Abarrotes.
 */
import { normalizarCodigoTienda, esAlmacenCentral } from '../constants/sucursales.js';
import { inicioDia, finDia, hoyYmdNogales } from './corteCaja.js';
import { esCategoriaProveedores } from './corteContabilidad/catalogoGastos.js';
import { proveedorDesdeGastoCorte } from './ieAbarrotesProveedores.js';
import { normalizarNombreProveedorClave } from './proveedorEntregas.js';
import { fmtMonto, listarRepartidores, fechaClaveDesdeIso } from './controlEfectivo.js';

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

/** Clasifica un movimiento de tránsito para el lado de entradas. */
export function clasificarEntradaTransito(m) {
  const tipo = String(m?.tipo_movimiento || '');
  if (tipo === 'Venta Ruta') {
    return { grupo: 'credito_ruta', etiqueta: 'Cobro crédito ruta' };
  }
  if (tipo === 'Entrega Crédito') {
    return { grupo: 'credito_tienda', etiqueta: 'Crédito tienda (por cobrar / cobrado)' };
  }
  if (tipo === 'Recolección') {
    const folio = String(m?.num_traspaso || '');
    const desc = String(m?.descripcion_gasto || m?.cajero_nombre || '');
    // Cobros de crédito tienda suelen conservar el folio original tras pasar a Recolección.
    if (/crédito|credito|CXC-|entrega crédito/i.test(`${folio} ${desc}`)) {
      return { grupo: 'credito_tienda', etiqueta: 'Cobro crédito tienda' };
    }
    return { grupo: 'recoleccion', etiqueta: 'Recolección' };
  }
  return null;
}

/**
 * Carga entradas (recolecciones + créditos) y salidas (gastos proveedor + gastos recolector).
 */
export async function cargarDatosConciliacion(supabase, {
  desde,
  hasta,
  sucursal = null,
  repartidorId = null,
  proveedorFiltro = '',
  incluirGastosRecolector = true,
  incluirEnTransito = true,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const suc = sucursal ? normalizarCodigoTienda(sucursal) : null;
  const desdeDt = inicioDia(desde);
  const hastaDt = finDia(hasta);
  const avisos = [];
  const filtroProvClave = normalizarNombreProveedorClave(proveedorFiltro);

  const [transitoRes, gastosProvRes, gastosRecRes, repsRes, provRes] = await Promise.all([
    (async () => {
      let q = supabase
        .from('transito_efectivo')
        .select(
          'id, sucursal_origen, repartidor_id, repartidores(nombre), cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, estatus, descripcion_gasto, fecha_liquidacion, usuario_liquida',
        )
        .in('tipo_movimiento', ['Recolección', 'Entrega Crédito', 'Venta Ruta'])
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
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);
      if (suc) q = q.eq('sucursal_id', suc);
      return q;
    })(),
    incluirGastosRecolector
      ? (async () => {
          let q = supabase
            .from('transito_efectivo')
            .select(
              'id, sucursal_origen, repartidor_id, repartidores(nombre), cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, estatus, descripcion_gasto, fecha_liquidacion, usuario_liquida',
            )
            .eq('tipo_movimiento', 'Gasto')
            .neq('estatus', 'Cancelado')
            .gte('fecha_hora', desdeDt.toISOString())
            .lte('fecha_hora', hastaDt.toISOString())
            .order('fecha_hora', { ascending: false })
            .limit(3000);
          if (repartidorId) q = q.eq('repartidor_id', repartidorId);
          if (suc) q = q.eq('sucursal_origen', suc);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    listarRepartidores(supabase).catch((e) => {
      avisos.push(`Repartidores: ${e.message}`);
      return [];
    }),
    supabase.from('proveedores').select('id, nombre').order('nombre'),
  ]);

  if (transitoRes.error) avisos.push(`Tránsito: ${transitoRes.error.message}`);
  if (gastosProvRes.error && gastosProvRes.error.code !== '42P01') {
    avisos.push(`Gastos proveedor: ${gastosProvRes.error.message}`);
  }
  if (gastosRecRes.error && gastosRecRes.error.code !== '42P01') {
    avisos.push(`Gastos recolector: ${gastosRecRes.error.message}`);
  }
  if (provRes.error) avisos.push(`Proveedores: ${provRes.error.message}`);

  const estatusEntradaOk = new Set(
    incluirEnTransito
      ? ['En Tránsito', 'Liquidado', 'Por Cobrar']
      : ['Liquidado', 'Por Cobrar'],
  );

  const entradas = [];
  for (const m of transitoRes.data || []) {
    if (!estatusEntradaOk.has(m.estatus)) continue;
    if (esAlmacenCentral(m.sucursal_origen)) continue;
    const ymd = ymdDeIso(m.fecha_hora);
    if (!enRangoYmd(ymd, desde, hasta)) continue;
    const cls = clasificarEntradaTransito(m);
    if (!cls) continue;
    entradas.push({
      id: `t:${m.id}`,
      fuente: 'transito',
      movimiento_id: m.id,
      grupo: cls.grupo,
      etiqueta: cls.etiqueta,
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

  // Cobros de crédito ruta también quedan como gasto CREDITO RUTA (doble registro con Venta Ruta).
  // No los sumamos como entrada aparte para no duplicar: la entrada es el tránsito Venta Ruta.

  const salidas = [];
  for (const g of gastosProvRes.data || []) {
    if (!esCategoriaProveedores(g.categoria)) continue;
    const est = g.estado_aprobacion;
    if (est && est !== 'aprobado') continue;
    if (esAlmacenCentral(g.sucursal_id)) continue;
    if (suc && normalizarCodigoTienda(g.sucursal_id) !== suc) continue;
    const proveedor = proveedorDesdeGastoCorte(g);
    if (filtroProvClave) {
      const k = normalizarNombreProveedorClave(proveedor);
      if (!k.includes(filtroProvClave) && filtroProvClave !== k) continue;
    }
    const ymd = ymdDeIso(g.created_at);
    if (!enRangoYmd(ymd, desde, hasta)) continue;
    salidas.push({
      id: `gp:${g.id}`,
      fuente: 'gasto_proveedor',
      movimiento_id: g.id,
      grupo: 'proveedor',
      etiqueta: 'Compra proveedor (efectivo)',
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

  for (const g of gastosRecRes.data || []) {
    if (esAlmacenCentral(g.sucursal_origen)) continue;
    const ymd = ymdDeIso(g.fecha_hora);
    if (!enRangoYmd(ymd, desde, hasta)) continue;
    const desc = String(g.descripcion_gasto || '');
    if (filtroProvClave) {
      const k = normalizarNombreProveedorClave(desc);
      if (!k.includes(filtroProvClave)) continue;
    }
    salidas.push({
      id: `gr:${g.id}`,
      fuente: 'gasto_recolector',
      movimiento_id: g.id,
      grupo: 'gasto_recolector',
      etiqueta: 'Gasto recolector (efectivo)',
      monto: round2(g.monto),
      fecha: g.fecha_hora,
      ymd,
      tienda: g.sucursal_origen || '—',
      folio: g.num_traspaso || '—',
      proveedor: desc || 'Gasto recolector',
      detalle: desc,
      estatus: g.estatus,
      repartidor: g.repartidores?.nombre || g.cajero_nombre || '—',
    });
  }

  const sum = (rows) => round2(rows.reduce((a, r) => a + (Number(r.monto) || 0), 0));

  const resumenEntradas = {
    recoleccion: sum(entradas.filter((e) => e.grupo === 'recoleccion')),
    credito_tienda: sum(entradas.filter((e) => e.grupo === 'credito_tienda')),
    credito_ruta: sum(entradas.filter((e) => e.grupo === 'credito_ruta')),
    total: sum(entradas),
    count: entradas.length,
  };

  const resumenSalidas = {
    proveedor: sum(salidas.filter((s) => s.grupo === 'proveedor')),
    gasto_recolector: sum(salidas.filter((s) => s.grupo === 'gasto_recolector')),
    total: sum(salidas),
    count: salidas.length,
  };

  const porProveedor = {};
  for (const s of salidas.filter((x) => x.grupo === 'proveedor')) {
    const nom = s.proveedor || 'Sin nombre';
    if (!porProveedor[nom]) porProveedor[nom] = { nombre: nom, total: 0, count: 0 };
    porProveedor[nom].total = round2(porProveedor[nom].total + s.monto);
    porProveedor[nom].count += 1;
  }

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
    porProveedor: Object.values(porProveedor).sort((a, b) => b.total - a.total),
    repartidores: Array.isArray(repsRes) ? repsRes : [],
    proveedoresCatalogo: provRes.data || [],
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
 * Sella una conciliación (persiste en conciliaciones_abarrotes).
 */
export async function sellarConciliacion(supabase, {
  desde,
  hasta,
  sucursal = null,
  repartidorId = null,
  proveedorFiltro = '',
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
    version: 1,
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
      texto: `Entradas ${fmtMonto(totalEntradas)} − Salidas ${fmtMonto(totalSalidas)} = ${fmtMonto(diferencia)}`,
    },
  };

  const row = {
    folio,
    desde,
    hasta,
    sucursal_id: sucursal || null,
    repartidor_id: repartidorId || null,
    proveedor_filtro: proveedorFiltro || null,
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
