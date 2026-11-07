/**
 * Estadísticas · Ingresos de Venta en Ruta, créditos pendientes, entrega del recolector
 * y estado actual del inventario del camión.
 *
 * Responde:
 *  1) ¿Cuánto ingresó la ruta (contado + crédito cobrado) y cuánto queda por cobrar?
 *  2) ¿Qué créditos están pendientes, desde cuándo y de quién?
 *  3) ¿El recolector entrega el dinero completo? (vendido en efectivo + cobros de crédito
 *     contra lo entregado, lo que está en tránsito y lo que nunca se registró)
 *  4) ¿Qué hay hoy en cada camión y si lo vendido coincide con las ventas registradas?
 */
import { normalizarCodigoTienda, etiquetaTienda } from '../constants/sucursales.js';
import { quitarSufijoPagoFolio } from './foliosPago.js';
import { montosPagoDesdeVentaRuta } from './compraGastoCorte.js';
import { esCargoPendienteCxc, listarMovimientosCxc, esCargoDesdeRecoleccion } from './rutaCxc.js';
import { precioCompraCatalogo, disponibleEnLineaCarga, listarCargasRuta, lineasDeVariasCargas } from './ventaEnRuta.js';
import { listarCamionesRuta, etiquetaCamion } from './rutaCamiones.js';
import {
  tiendaDeVentaRuta,
  ventaCancelada,
  listarVentasRutaPorRango,
  repartidorDeCarga,
  cargarContextoLiquidacion,
} from './ventasRutaPorTienda.js';
import { inicioDia, finDia } from './corteCaja.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

export const DIAS_ATRASO_ENTREGA = 3;
export const DIAS_CARGA_ABIERTA_ALERTA = 7;
export const TOLERANCIA_FALTANTE_MXN = 10;

export const BUCKETS_ANTIGUEDAD = [
  { id: '0-7', etiqueta: '0–7 días', max: 7, color: '#27ae60' },
  { id: '8-15', etiqueta: '8–15 días', max: 15, color: '#f1c40f' },
  { id: '16-30', etiqueta: '16–30 días', max: 30, color: '#e67e22' },
  { id: '31+', etiqueta: 'Más de 30 días', max: Infinity, color: '#c0392b' },
];

export function diasDesde(iso, ahora = new Date()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - t) / 86400000));
}

export function bucketAntiguedad(dias) {
  return BUCKETS_ANTIGUEDAD.find((b) => dias <= b.max) || BUCKETS_ANTIGUEDAD[BUCKETS_ANTIGUEDAD.length - 1];
}

function esCancelado(m) {
  return /cancel/i.test(String(m?.estatus || ''));
}

function claveTiendaCliente(m) {
  if (String(m?.cliente_tipo || '').toLowerCase() === 'externo') {
    return { clave: `EXT:${String(m.cliente_id || '').toUpperCase()}`, nombre: m.cliente_nombre || m.cliente_id || 'Cliente externo', externo: true };
  }
  const cod = normalizarCodigoTienda(m?.cliente_id) || String(m?.cliente_id || '').toUpperCase();
  return { clave: cod, nombre: etiquetaTienda(cod) || m?.cliente_nombre || cod, externo: false };
}

/** Un cargo nacido en Recolecciones (no es venta de ruta). */
export function origenCargoCxc(m) {
  const carga = String(m?.carga_id || '');
  if (carga.startsWith('rec:') || esCargoDesdeRecoleccion(m)) return 'recoleccion';
  return 'ruta';
}

/**
 * Cartera de créditos pendientes (todas las fechas), ordenada del más viejo al más nuevo.
 * @param {Array} movimientos filas de ruta_cxc_movimientos
 * @param {{ tienda?: string, vendedorPorCarga?: Map<string,string>, ahora?: Date }} opts
 */
export function analizarCarteraPendiente(movimientos, { tienda = '', vendedorPorCarga = new Map(), ahora = new Date() } = {}) {
  const suc = tienda ? (normalizarCodigoTienda(tienda) || String(tienda).toUpperCase()) : '';
  const lista = [];
  for (const m of movimientos || []) {
    if (!esCargoPendienteCxc(m)) continue;
    const t = claveTiendaCliente(m);
    if (suc && t.clave !== suc) continue;
    const dias = diasDesde(m.created_at, ahora);
    const origen = origenCargoCxc(m);
    lista.push({
      id: m.id,
      folio: m.folio_venta || m.venta_id || '—',
      ventaId: m.venta_id ? String(m.venta_id) : null,
      clave: t.clave,
      tienda: t.nombre,
      externo: t.externo,
      fecha: m.created_at,
      dias,
      bucket: bucketAntiguedad(dias).id,
      monto: r2(m.monto),
      origen,
      vendedor: origen === 'recoleccion'
        ? 'Recolección en tienda'
        : (vendedorPorCarga.get(String(m.carga_id || '')) || m.usuario_nombre || 'Sin vendedor'),
    });
  }
  lista.sort((a, b) => b.dias - a.dias || b.monto - a.monto);

  const sumar = (rows) => r2(rows.reduce((s, x) => s + x.monto, 0));
  const ruta = lista.filter((x) => x.origen === 'ruta');
  const recoleccion = lista.filter((x) => x.origen === 'recoleccion');

  const agrupar = (rows, keyFn, nombreFn) => {
    const map = new Map();
    for (const x of rows) {
      const k = keyFn(x);
      const f = map.get(k) || { clave: k, nombre: nombreFn(x), creditos: 0, monto: 0, masViejoDias: 0 };
      f.creditos += 1;
      f.monto = r2(f.monto + x.monto);
      f.masViejoDias = Math.max(f.masViejoDias, x.dias);
      map.set(k, f);
    }
    return [...map.values()].sort((a, b) => b.monto - a.monto);
  };

  const porAntiguedad = BUCKETS_ANTIGUEDAD.map((b) => {
    const rows = ruta.filter((x) => x.bucket === b.id);
    return { ...b, creditos: rows.length, monto: sumar(rows) };
  });

  return {
    lista,
    ruta: { creditos: ruta.length, monto: sumar(ruta), masViejoDias: ruta[0]?.dias || 0 },
    recoleccion: { creditos: recoleccion.length, monto: sumar(recoleccion) },
    total: { creditos: lista.length, monto: sumar(lista) },
    vencidoMas30: sumar(ruta.filter((x) => x.dias > 30)),
    porAntiguedad,
    porTienda: agrupar(ruta, (x) => x.clave, (x) => x.tienda),
    porVendedor: agrupar(ruta, (x) => x.vendedor, (x) => x.vendedor),
  };
}

/**
 * Ingresos de venta en ruta del periodo: contado + crédito (cobrado / pendiente).
 * El pendiente sale de los cargos CxC vivos ligados a las ventas del periodo.
 */
export function analizarIngresosRuta(ventas, movimientos, { tienda = '', desde = '', hasta = '' } = {}) {
  const suc = tienda ? (normalizarCodigoTienda(tienda) || String(tienda).toUpperCase()) : '';
  const pendientes = (movimientos || []).filter(esCargoPendienteCxc);
  const pendPorVenta = new Map();
  const pendPorFolio = new Map();
  for (const c of pendientes) {
    if (c.venta_id) pendPorVenta.set(String(c.venta_id), r2((pendPorVenta.get(String(c.venta_id)) || 0) + Number(c.monto)));
    const fam = quitarSufijoPagoFolio(c.folio_venta);
    if (fam) pendPorFolio.set(fam, r2((pendPorFolio.get(fam) || 0) + Number(c.monto)));
  }

  const out = {
    ventas: 0,
    canceladas: 0,
    total: 0,
    contado: 0,
    creditoVendido: 0,
    creditoPendiente: 0,
    creditoCobrado: 0,
    ingresoRealizado: 0,
    pctRealizado: null,
    cobranzaDelPeriodo: 0,
    porTienda: [],
  };
  const tiendas = new Map();
  const folioYaContado = new Set();

  for (const v of ventas || []) {
    if (ventaCancelada(v)) {
      out.canceladas += 1;
      continue;
    }
    const t = tiendaDeVentaRuta(v);
    if (suc && t.clave !== suc) continue;
    const pago = montosPagoDesdeVentaRuta(v);
    const efectivo = r2(pago.montoEfectivo);
    const credito = r2(pago.montoCredito);
    const estado = String(v?.estado_credito || '').toLowerCase();

    let pendiente = 0;
    if (credito > 0 && estado !== 'anulado') {
      const fam = quitarSufijoPagoFolio(v.folio);
      const porId = pendPorVenta.get(String(v.id));
      if (porId != null) pendiente = porId;
      else if (fam && !folioYaContado.has(fam) && pendPorFolio.has(fam)) {
        pendiente = pendPorFolio.get(fam);
        folioYaContado.add(fam);
      }
      pendiente = Math.min(credito, pendiente);
    }
    const creditoEfectivo = estado === 'anulado' ? 0 : credito;
    const cobrado = r2(Math.max(0, creditoEfectivo - pendiente));

    out.ventas += 1;
    out.total = r2(out.total + efectivo + creditoEfectivo);
    out.contado = r2(out.contado + efectivo);
    out.creditoVendido = r2(out.creditoVendido + creditoEfectivo);
    out.creditoPendiente = r2(out.creditoPendiente + pendiente);
    out.creditoCobrado = r2(out.creditoCobrado + cobrado);

    const f = tiendas.get(t.clave) || {
      clave: t.clave, nombre: t.nombre, externo: t.externo, ventas: 0, total: 0, contado: 0, credito: 0, pendiente: 0,
    };
    f.ventas += 1;
    f.total = r2(f.total + efectivo + creditoEfectivo);
    f.contado = r2(f.contado + efectivo);
    f.credito = r2(f.credito + creditoEfectivo);
    f.pendiente = r2(f.pendiente + pendiente);
    tiendas.set(t.clave, f);
  }

  out.ingresoRealizado = r2(out.contado + out.creditoCobrado);
  out.pctRealizado = out.total > 0 ? r2((out.ingresoRealizado / out.total) * 100) : null;

  const ini = desde ? inicioDia(desde).getTime() : -Infinity;
  const fin = hasta ? finDia(hasta).getTime() : Infinity;
  for (const m of movimientos || []) {
    if (m.tipo !== 'abono') continue;
    if (suc && claveTiendaCliente(m).clave !== suc) continue;
    const t = new Date(m.pagado_at || m.created_at).getTime();
    if (t >= ini && t <= fin) out.cobranzaDelPeriodo = r2(out.cobranzaDelPeriodo + Number(m.monto || 0));
  }

  out.porTienda = [...tiendas.values()].sort((a, b) => b.total - a.total);
  return out;
}

/**
 * ¿El recolector entrega completo? Por recolector:
 *   esperado = efectivo vendido + cobros de crédito
 *   entregado (Liquidado) + por entregar (En Tránsito) + sin registrar = esperado
 * Los gastos se muestran aparte (se descuentan al liquidar).
 */
export function analizarEntregaRecolectores({
  ventas = [],
  cargasPorId = new Map(),
  repartidores = [],
  transitoPeriodo = [],
  transitoPendiente = [],
  tienda = '',
  ahora = new Date(),
} = {}) {
  const suc = tienda ? (normalizarCodigoTienda(tienda) || String(tienda).toUpperCase()) : '';
  const nombreRep = new Map((repartidores || []).map((r) => [String(r.id), r.nombre || String(r.id)]));
  const filas = new Map();
  const SIN = '__sin__';
  const get = (id) => {
    const k = id ? String(id) : SIN;
    let f = filas.get(k);
    if (!f) {
      f = {
        id: k,
        nombre: k === SIN ? 'Sin recolector identificado' : (nombreRep.get(k) || k),
        vendidoEfectivo: 0,
        vendidoCredito: 0,
        cobrosCredito: 0,
        registrado: 0,
        entregado: 0,
        porEntregar: 0,
        otrosEstatus: 0,
        gastos: 0,
        enTransitoActual: 0,
        masViejoDias: 0,
      };
      filas.set(k, f);
    }
    return f;
  };

  for (const v of ventas) {
    if (ventaCancelada(v)) continue;
    const t = tiendaDeVentaRuta(v);
    if (suc && t.clave !== suc) continue;
    const pago = montosPagoDesdeVentaRuta(v);
    const f = get(repartidorDeCarga(cargasPorId.get(String(v.carga_id)), repartidores));
    f.vendidoEfectivo = r2(f.vendidoEfectivo + pago.montoEfectivo);
    if (String(v?.estado_credito || '').toLowerCase() !== 'anulado') {
      f.vendidoCredito = r2(f.vendidoCredito + pago.montoCredito);
    }
  }

  for (const m of transitoPeriodo) {
    if (esCancelado(m)) continue;
    const tipo = String(m.tipo_movimiento || '');
    if (tipo === 'Gasto') {
      if (suc) continue;
      get(m.repartidor_id).gastos = r2(get(m.repartidor_id).gastos + (Number(m.monto) || 0));
      continue;
    }
    if (tipo !== 'Venta Ruta' && tipo !== 'Cobro Crédito') continue;
    if (suc && (normalizarCodigoTienda(m.sucursal_origen) || m.sucursal_origen) !== suc) continue;
    const f = get(m.repartidor_id);
    const monto = Number(m.monto) || 0;
    if (tipo === 'Venta Ruta') f.registrado = r2(f.registrado + monto);
    else f.cobrosCredito = r2(f.cobrosCredito + monto);
    if (m.estatus === 'Liquidado') f.entregado = r2(f.entregado + monto);
    else if (m.estatus === 'En Tránsito') f.porEntregar = r2(f.porEntregar + monto);
    else f.otrosEstatus = r2(f.otrosEstatus + monto);
  }

  for (const m of transitoPendiente) {
    const tipo = String(m.tipo_movimiento || '');
    if (tipo !== 'Venta Ruta' && tipo !== 'Cobro Crédito') continue;
    if (esCancelado(m) || m.estatus !== 'En Tránsito') continue;
    if (suc && (normalizarCodigoTienda(m.sucursal_origen) || m.sucursal_origen) !== suc) continue;
    const f = get(m.repartidor_id);
    f.enTransitoActual = r2(f.enTransitoActual + (Number(m.monto) || 0));
    f.masViejoDias = Math.max(f.masViejoDias, diasDesde(m.fecha_hora, ahora));
  }

  const out = [...filas.values()].map((f) => {
    const esperado = r2(f.vendidoEfectivo + f.cobrosCredito);
    const sinRegistrar = r2(f.vendidoEfectivo - f.registrado);
    const tol = Math.max(TOLERANCIA_FALTANTE_MXN, f.vendidoEfectivo * 0.02);
    let estado = 'completo';
    if (sinRegistrar > tol) estado = 'faltante';
    else if (f.enTransitoActual > 0 && f.masViejoDias > DIAS_ATRASO_ENTREGA) estado = 'atrasado';
    else if (f.enTransitoActual > 0 || f.porEntregar > 0) estado = 'por_entregar';
    else if (sinRegistrar < -tol) estado = 'de_mas';
    return {
      ...f,
      esperado,
      sinRegistrar,
      pctEntregado: esperado > 0 ? r2((f.entregado / esperado) * 100) : null,
      estado,
    };
  });
  return out
    .filter((f) => f.vendidoEfectivo > 0 || f.registrado > 0 || f.cobrosCredito > 0 || f.enTransitoActual > 0)
    .sort((a, b) => b.sinRegistrar - a.sinRegistrar || b.enTransitoActual - a.enTransitoActual);
}

/**
 * Estado actual de cada camión con carga abierta.
 * disponible = cargada − vendida − devuelta (por línea).
 * @param {{cargas: Array, lineasPorCarga: Map<string, Array>, ventasPorCarga: Map<string, number>,
 *   productos: Map<string, object>, camiones: Array, repartidores: Array}} datos
 */
export function resumirCamionesAbiertos({
  cargas = [],
  lineasPorCarga = new Map(),
  ventasPorCarga = new Map(),
  productos = new Map(),
  camiones = [],
  repartidores = [],
  ahora = new Date(),
} = {}) {
  const camionPorId = new Map((camiones || []).map((c) => [String(c.id), c]));
  const nombreRep = new Map((repartidores || []).map((r) => [String(r.id), r.nombre]));
  const resumen = [];

  for (const carga of cargas) {
    const lineas = lineasPorCarga.get(String(carga.id)) || [];
    let cargada = 0;
    let vendida = 0;
    let devuelta = 0;
    let disponible = 0;
    let valorDisponibleCosto = 0;
    let valorDisponibleRuta = 0;
    let valorVendidoRuta = 0;
    let sinCosto = 0;
    let inconsistentes = 0;
    const productosLista = [];

    for (const l of lineas) {
      const c = Number(l.qty_cargada) || 0;
      const v = Number(l.qty_vendida) || 0;
      const d = Number(l.qty_devuelta) || 0;
      const disp = disponibleEnLineaCarga(l);
      const prod = productos.get(String(l.producto_id));
      const compra = prod ? precioCompraCatalogo(prod) : null;
      const precioRuta = Number(l.precio) > 0 ? Number(l.precio) : Number(prod?.precio_ruta) || 0;
      cargada += c;
      vendida += v;
      devuelta += d;
      disponible = r3(disponible + disp);
      valorDisponibleRuta = r2(valorDisponibleRuta + disp * precioRuta);
      valorVendidoRuta = r2(valorVendidoRuta + v * precioRuta);
      if (compra != null && compra > 0) valorDisponibleCosto = r2(valorDisponibleCosto + disp * compra);
      else if (disp > 0) sinCosto += 1;
      if (v + d > c + 0.0001) inconsistentes += 1;
      productosLista.push({
        producto_id: String(l.producto_id),
        nombre: l.producto_nombre || prod?.nombre || String(l.producto_id),
        cargada: c,
        vendida: v,
        devuelta: d,
        disponible: disp,
        valorRuta: r2(disp * precioRuta),
      });
    }
    productosLista.sort((a, b) => b.valorRuta - a.valorRuta || a.nombre.localeCompare(b.nombre, 'es'));

    const camion = camionPorId.get(String(carga.camion_id || ''));
    const ventasRegistradas = r2(ventasPorCarga.get(String(carga.id)) || 0);
    const sinRegistrar = r2(valorVendidoRuta - ventasRegistradas);
    const dias = diasDesde(carga.created_at, ahora);
    const tol = Math.max(TOLERANCIA_FALTANTE_MXN, valorVendidoRuta * 0.02);
    const alertas = [];
    if (sinRegistrar > tol) alertas.push(`Salió mercancía por ${fmtMx(sinRegistrar)} sin venta registrada.`);
    if (dias > DIAS_CARGA_ABIERTA_ALERTA) alertas.push(`Carga abierta hace ${dias} días: liquídala o devuélvela.`);
    if (inconsistentes > 0) alertas.push(`${inconsistentes} producto(s) con más vendido/devuelto que cargado.`);
    if (sinCosto > 0) alertas.push(`${sinCosto} producto(s) en el camión sin costo capturado.`);

    resumen.push({
      cargaId: String(carga.id),
      folio: carga.folio || '',
      recolector: carga.vendedor_nombre
        || nombreRep.get(String(carga.vendedor_id || '').replace(/^rt:/i, ''))
        || '—',
      camion: camion ? etiquetaCamion(camion) : (carga.camion_id ? String(carga.camion_id) : 'Sin camión'),
      desde: carga.created_at,
      dias,
      productos: productosLista.filter((p) => p.disponible > 0).length,
      cargada: r3(cargada),
      vendida: r3(vendida),
      devuelta: r3(devuelta),
      disponible,
      pctVendido: cargada > 0 ? r2((vendida / cargada) * 100) : null,
      valorDisponibleRuta,
      valorDisponibleCosto,
      valorVendidoRuta,
      ventasRegistradas,
      sinRegistrar,
      alertas,
      detalle: productosLista,
    });
  }
  return resumen.sort((a, b) => b.valorDisponibleRuta - a.valorDisponibleRuta);
}

const fmtMx = (n) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Avisos en lenguaje llano para toda la pantalla. */
export function construirAvisosIngresosRuta({ ingresos, cartera, entrega = [], camiones = [] } = {}) {
  const avisos = [];
  if (ingresos && ingresos.total > 0 && ingresos.creditoPendiente > 0) {
    const pct = r2((ingresos.creditoPendiente / ingresos.total) * 100);
    avisos.push({
      nivel: pct >= 25 ? 'alto' : 'medio',
      texto: `${fmtMx(ingresos.creditoPendiente)} (${pct}% de lo vendido en el periodo) sigue pendiente de cobro.`,
    });
  }
  if (cartera?.vencidoMas30 > 0) {
    avisos.push({ nivel: 'alto', texto: `${fmtMx(cartera.vencidoMas30)} de créditos de ruta llevan más de 30 días sin cobrarse.` });
  }
  for (const f of entrega.filter((x) => x.estado === 'faltante')) {
    avisos.push({
      nivel: 'alto',
      texto: `${f.nombre}: vendió ${fmtMx(f.vendidoEfectivo)} en efectivo pero solo hay ${fmtMx(f.registrado)} registrado: faltan ${fmtMx(f.sinRegistrar)}.`,
    });
  }
  for (const f of entrega.filter((x) => x.estado === 'atrasado')) {
    avisos.push({
      nivel: 'alto',
      texto: `${f.nombre} trae ${fmtMx(f.enTransitoActual)} sin entregar; lo más viejo tiene ${f.masViejoDias} días.`,
    });
  }
  for (const c of camiones) {
    for (const a of c.alertas.filter((x) => /sin venta registrada|abierta hace/.test(x))) {
      avisos.push({ nivel: 'alto', texto: `${c.camion} (${c.recolector}): ${a}` });
    }
  }
  if (!avisos.length) avisos.push({ nivel: 'info', texto: 'Sin alertas: los ingresos, créditos, entregas y camiones no muestran diferencias.' });
  return avisos;
}

async function paginar(crearQuery, max = 20) {
  const data = [];
  for (let p = 0; p < max; p += 1) {
    const { data: lote, error } = await crearQuery().range(p * 1000, p * 1000 + 999);
    if (error) return { data, error: error.message };
    data.push(...(lote || []));
    if (!lote || lote.length < 1000) break;
  }
  return { data };
}

async function porLotes(supabase, tabla, columnas, columna, ids, extra = (q) => q) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await extra(supabase.from(tabla).select(columnas).in(columna, ids.slice(i, i + 100)));
    if (error) return { data: out, error: error.message };
    out.push(...(data || []));
  }
  return { data: out };
}

/** Carga todo lo necesario para el análisis. */
export async function cargarAnalisisIngresosRuta(supabase, { desde, hasta, sucursal = null } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };
  const ahora = new Date();
  const avisos = [];
  const ini = inicioDia(desde).toISOString();
  const fin = finDia(hasta).toISOString();

  const [ventasRes, cxcRes, transitoRes, pendienteRes, cargasRes, camionesRes] = await Promise.all([
    listarVentasRutaPorRango(supabase, { desde, hasta }),
    listarMovimientosCxc(supabase, { todos: true }),
    paginar(() => supabase.from('transito_efectivo')
      .select('id, monto, estatus, tipo_movimiento, fecha_hora, repartidor_id, sucursal_origen')
      .in('tipo_movimiento', ['Venta Ruta', 'Cobro Crédito', 'Gasto'])
      .gte('fecha_hora', ini).lte('fecha_hora', fin).order('fecha_hora', { ascending: false })),
    paginar(() => supabase.from('transito_efectivo')
      .select('id, monto, estatus, tipo_movimiento, fecha_hora, repartidor_id, sucursal_origen')
      .in('tipo_movimiento', ['Venta Ruta', 'Cobro Crédito'])
      .eq('estatus', 'En Tránsito').order('fecha_hora', { ascending: false })),
    listarCargasRuta(supabase, { estado: 'en_ruta', limit: 200 }),
    listarCamionesRuta(supabase).catch(() => ({ data: [] })),
  ]);
  for (const [nombre, r] of [['Ventas de ruta', ventasRes], ['Créditos', cxcRes], ['Tránsito', transitoRes], ['Pendiente en tránsito', pendienteRes], ['Cargas', cargasRes]]) {
    if (r?.error) avisos.push(`${nombre}: ${r.error}`);
  }
  if (cxcRes?.aviso) avisos.push(cxcRes.aviso);

  const ventas = ventasRes.data || [];
  const movimientos = cxcRes.data || [];
  const cargasAbiertas = cargasRes.data || [];

  const ctx = await cargarContextoLiquidacion(supabase, ventas);
  const cargasPorId = new Map(ctx.cargasPorId);
  for (const c of cargasAbiertas) cargasPorId.set(String(c.id), c);

  const idsCxc = [...new Set(movimientos.filter(esCargoPendienteCxc).map((m) => String(m.carga_id || '')).filter((x) => x && !x.startsWith('rec:')))];
  const faltantes = idsCxc.filter((id) => !cargasPorId.has(id));
  if (faltantes.length) {
    const r = await porLotes(supabase, 'ruta_cargas', 'id, vendedor_id, vendedor_nombre', 'id', faltantes);
    for (const c of r.data) cargasPorId.set(String(c.id), c);
  }
  const vendedorPorCarga = new Map();
  for (const [id, c] of cargasPorId) vendedorPorCarga.set(id, c.vendedor_nombre || '');

  const lineasRes = await lineasDeVariasCargas(supabase, cargasAbiertas);
  const lineasPorCarga = new Map();
  for (const r of lineasRes.porCarga || []) lineasPorCarga.set(String(r.cargaId), r.lineas || []);
  if (lineasRes.error) avisos.push(`Líneas de carga: ${lineasRes.error}`);

  const idsProd = [...new Set((lineasRes.data || []).map((l) => String(l.producto_id)).filter(Boolean))];
  const productos = new Map();
  if (idsProd.length) {
    const r = await porLotes(supabase, 'productos', 'id, nombre, precio_compra_sin, precio_compra_con, impuesto, precio_ruta', 'id', idsProd);
    if (r.error) avisos.push(`Productos: ${r.error}`);
    for (const p of r.data) productos.set(String(p.id), p);
  }

  const ventasPorCarga = new Map();
  if (cargasAbiertas.length) {
    const r = await porLotes(supabase, 'ruta_ventas', 'id, carga_id, total, estado', 'carga_id', cargasAbiertas.map((c) => String(c.id)));
    if (r.error) avisos.push(`Ventas por carga: ${r.error}`);
    for (const v of r.data) {
      if (ventaCancelada(v)) continue;
      ventasPorCarga.set(String(v.carga_id), r2((ventasPorCarga.get(String(v.carga_id)) || 0) + Number(v.total || 0)));
    }
  }

  return {
    ok: true,
    ahora,
    desde,
    hasta,
    sucursal,
    ventas,
    movimientos,
    transitoPeriodo: transitoRes.data || [],
    transitoPendiente: pendienteRes.data || [],
    cargasAbiertas,
    cargasPorId,
    vendedorPorCarga,
    repartidores: ctx.repartidores || [],
    camiones: camionesRes.data || [],
    lineasPorCarga,
    ventasPorCarga,
    productos,
    avisos,
  };
}

/** Une todo en el resultado que pinta la pantalla. */
export function armarAnalisisIngresosRuta(datos, { tienda = '' } = {}) {
  const ingresos = analizarIngresosRuta(datos.ventas, datos.movimientos, { tienda, desde: datos.desde, hasta: datos.hasta });
  const cartera = analizarCarteraPendiente(datos.movimientos, { tienda, vendedorPorCarga: datos.vendedorPorCarga, ahora: datos.ahora });
  const entrega = analizarEntregaRecolectores({
    ventas: datos.ventas,
    cargasPorId: datos.cargasPorId,
    repartidores: datos.repartidores,
    transitoPeriodo: datos.transitoPeriodo,
    transitoPendiente: datos.transitoPendiente,
    tienda,
    ahora: datos.ahora,
  });
  const camiones = resumirCamionesAbiertos({
    cargas: datos.cargasAbiertas,
    lineasPorCarga: datos.lineasPorCarga,
    ventasPorCarga: datos.ventasPorCarga,
    productos: datos.productos,
    camiones: datos.camiones,
    repartidores: datos.repartidores,
    ahora: datos.ahora,
  });
  const avisos = construirAvisosIngresosRuta({ ingresos, cartera, entrega, camiones });
  return { ingresos, cartera, entrega, camiones, avisos };
}
