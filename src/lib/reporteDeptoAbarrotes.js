/**
 * Reporte del departamento de catálogo ABARROTES (productos.cat),
 * no del módulo de corte Abarrotes vs Virtual/Garage.
 *
 * Ventas: tickets POS. Compras: pedidos recibidos (excluye «Venta en ruta»).
 * Entradas: movimientos_inventario tipo entrada/traspaso (masivo, compra, CEDIS).
 */
import {
  esAlmacenCentral,
  etiquetaTienda,
  listarSucursalesOperativas,
  normalizarCodigoTienda,
} from '../constants/sucursales.js';
import { finDia, inicioDia, ymdNogalesFromDate } from './corteCaja.js';
import { normalizarDepartamento } from './departamentos.js';
import { stockEnUbicacion, stockAlmacenCentral } from './inventarioMultitienda.js';
import { VENTAS_PAGE_SIZE } from './ventasQuery.js';

/** Mismo arranque que estadisticasData.FECHA_INICIO_ESTADISTICAS. */
export const FECHA_INICIO_DEPTO_ABARROTES = '2026-07-25';

const COLORES_TIENDA = [
  '#2980b9',
  '#e67e22',
  '#27ae60',
  '#8e44ad',
  '#c0392b',
  '#16a085',
  '#f39c12',
  '#2c3e50',
  '#d35400',
  '#7f8c8d',
];

export const CAT_DEPTO_ABARROTES = 'ABARROTES';

const MODOS_ENTRADA_IGNORAR = new Set([
  'venta',
  'cancelacion',
  'conteo_departamento',
  'conteo_snapshot',
  'retiro',
  'merma',
]);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function articulosDeVenta(venta) {
  return parseJsonArray(venta?.articulos);
}

export function articulosDeCompra(compra) {
  const items = parseJsonArray(compra?.items);
  if (items.length) return items;
  return parseJsonArray(compra?.items_pedido);
}

export function pidDeLinea(line) {
  const id = String(line?.id ?? line?.producto_id ?? line?.codigo ?? '').trim();
  if (id) return id;
  const nom = String(line?.nombre || line?.producto_nombre || '').trim().toUpperCase();
  return nom ? `nom:${nom}` : '';
}

export function qtyDeLinea(line) {
  return Math.abs(Number(line?.qty ?? line?.cantidad ?? line?.qty_recibido ?? line?.qty_pedido) || 0);
}

export function esLineaDeptoAbarrotes(line, abaIds, cat = CAT_DEPTO_ABARROTES) {
  const pid = pidDeLinea(line);
  if (pid && abaIds instanceof Set && abaIds.has(pid)) return true;
  const raw = line?.cat ?? line?.departamento ?? line?.depto;
  return normalizarDepartamento(raw) === cat;
}

export function ymdDesdeIso(iso) {
  if (!iso) return '';
  try {
    return ymdNogalesFromDate(iso) || String(iso).slice(0, 10);
  } catch {
    return String(iso).slice(0, 10);
  }
}

/** Sábado de inicio de semana operativa (sáb–vie), a partir de YYYY-MM-DD. */
export function semanaOperativaKey(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const utc = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const day = new Date(utc).getUTCDay();
  const diasDesdeSabado = (day + 1) % 7;
  const start = new Date(utc - diasDesdeSabado * 86400000);
  const yy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(start.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function etiquetaSemana(key) {
  if (!key) return '—';
  const [y, m, d] = String(key).split('-');
  return `Sem sáb ${d}/${m}${y ? `/${String(y).slice(2)}` : ''}`;
}

function mesKey(ymd) {
  return String(ymd || '').slice(0, 7);
}

function diasInclusive(desde, hasta) {
  const a = String(desde || '').slice(0, 10);
  const b = String(hasta || '').slice(0, 10);
  if (!a || !b) return 1;
  const d0 = new Date(`${a}T12:00:00Z`);
  const d1 = new Date(`${b}T12:00:00Z`);
  const diff = Math.round((d1 - d0) / 86400000);
  return Math.max(1, diff + 1);
}

function colorTienda(i) {
  return COLORES_TIENDA[i % COLORES_TIENDA.length];
}

function bucketSemana(map, key) {
  if (!key) return null;
  if (!map[key]) map[key] = { monto: 0, unidades: 0, tickets: new Set(), docs: 0, entradasU: 0 };
  return map[key];
}

function emptySku() {
  return { nombre: '', monto: 0, unidades: 0, tickets: 0 };
}

export function estadoVacioTienda(id) {
  return {
    id,
    label: etiquetaTienda(id),
    ventasMonto: 0,
    ventasUnidades: 0,
    tickets: new Set(),
    lineas: 0,
    comprasMonto: 0,
    comprasUnidades: 0,
    comprasDocs: 0,
    entradasUnidades: 0,
    entradasCompraU: 0,
    entradasMasivoU: 0,
    entradasCedisU: 0,
    entradasTraspasoU: 0,
    semana: {},
    mes: {},
    skuVentas: {},
    skuCompras: {},
  };
}

export function crearEstadoReporte({ tiendas = null } = {}) {
  const lista = (tiendas && tiendas.length)
    ? tiendas.map(normalizarCodigoTienda).filter(Boolean)
    : listarSucursalesOperativas();
  const porTienda = {};
  for (const t of lista) porTienda[t] = estadoVacioTienda(t);
  return {
    tiendas: lista,
    porTienda,
    ticketsPOS: 0,
    ticketsConAbarrotes: 0,
    ventasPOSMonto: 0,
    ventasAbarrotesMonto: 0,
    ventasAbarrotesUnidades: 0,
    lineasAbarrotes: 0,
    comprasDocsReales: 0,
    comprasDocsRuta: 0,
    comprasDocsAbarrotes: 0,
    comprasPedidoAbarrotesDocs: 0,
    comprasAbarrotesMonto: 0,
    comprasAbarrotesUnidades: 0,
    primeraVenta: '',
    ultimaVenta: '',
    primeraCompra: '',
    ultimaCompra: '',
    semanaPOS: {},
    pedidosAbarrotes: [],
  };
}

function montoVentaLinea(line, catalogo) {
  const q = qtyDeLinea(line) || 1;
  let precio = Number(line?.precio) || 0;
  if (!precio) {
    const pid = pidDeLinea(line);
    precio = Number(catalogo?.get(pid)?.precio) || 0;
  }
  const importe = Number(line?.importe ?? line?.subtotal);
  if (Number.isFinite(importe) && importe !== 0) return { q, monto: round2(importe) };
  return { q, monto: round2(q * precio) };
}

function montoCompraLinea(line, catalogo) {
  const q = qtyDeLinea(line);
  let costo = Number(line?.costo ?? line?.costo_est ?? line?.precio) || 0;
  if (!costo) {
    const pid = pidDeLinea(line);
    const p = catalogo?.get(pid);
    costo = Number(p?.precio_compra_con ?? p?.precio_compra_sin ?? p?.costo) || 0;
  }
  return { q, monto: round2(q * costo) };
}

function minYmd(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return a < b ? a : b;
}

function maxYmd(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Acumula un ticket POS. Devuelve true si tuvo líneas ABARROTES.
 */
export function agregarTicket(estado, venta, abaIds, catalogo = new Map()) {
  estado.ticketsPOS += 1;
  const ymd = ymdDesdeIso(venta?.created_at);
  const suc = normalizarCodigoTienda(venta?.sucursal_id);
  const totalTicket = Number(venta?.total) || 0;
  estado.ventasPOSMonto = round2(estado.ventasPOSMonto + totalTicket);
  if (ymd) {
    estado.primeraVenta = minYmd(estado.primeraVenta, ymd);
    estado.ultimaVenta = maxYmd(estado.ultimaVenta, ymd);
    const wk = semanaOperativaKey(ymd);
    if (!estado.semanaPOS[wk]) estado.semanaPOS[wk] = { tickets: 0, monto: 0 };
    estado.semanaPOS[wk].tickets += 1;
    estado.semanaPOS[wk].monto = round2(estado.semanaPOS[wk].monto + totalTicket);
  }
  if (esAlmacenCentral(suc)) return false;

  let hit = false;
  for (const a of articulosDeVenta(venta)) {
    if (!esLineaDeptoAbarrotes(a, abaIds)) continue;
    hit = true;
    const { q, monto } = montoVentaLinea(a, catalogo);
    estado.ventasAbarrotesMonto = round2(estado.ventasAbarrotesMonto + monto);
    estado.ventasAbarrotesUnidades = round3(estado.ventasAbarrotesUnidades + q);
    estado.lineasAbarrotes += 1;
    const st = estado.porTienda[suc];
    if (!st) continue;
    st.ventasMonto = round2(st.ventasMonto + monto);
    st.ventasUnidades = round3(st.ventasUnidades + q);
    st.lineas += 1;
    if (venta?.id != null) st.tickets.add(venta.id);
    const pid = pidDeLinea(a) || 'sin-id';
    if (!st.skuVentas[pid]) st.skuVentas[pid] = emptySku();
    const sku = st.skuVentas[pid];
    sku.nombre = a.nombre || a.descripcion || catalogo.get(pid)?.nombre || sku.nombre || pid;
    sku.monto = round2(sku.monto + monto);
    sku.unidades = round3(sku.unidades + q);
    sku.tickets += 1;
    if (ymd) {
      const wk = bucketSemana(st.semana, semanaOperativaKey(ymd));
      if (wk) {
        wk.monto = round2(wk.monto + monto);
        wk.unidades = round3(wk.unidades + q);
        if (venta?.id != null) wk.tickets.add(venta.id);
      }
      const mk = mesKey(ymd);
      if (!st.mes[mk]) st.mes[mk] = { ventas: 0, compras: 0, ventasU: 0, comprasU: 0 };
      st.mes[mk].ventas = round2(st.mes[mk].ventas + monto);
      st.mes[mk].ventasU = round3(st.mes[mk].ventasU + q);
    }
  }
  if (hit) estado.ticketsConAbarrotes += 1;
  return hit;
}

function esCompraVentaEnRuta(compra) {
  return /venta\s+en\s+ruta/i.test(String(compra?.notas || ''));
}

function notasTienenAbarrotes(compra) {
  return /abarrotes/i.test(String(compra?.notas || ''));
}

/**
 * Acumula una compra recibida. Ignora «Venta en ruta» y estado=pedido.
 */
export function agregarCompra(estado, compra, abaIds, catalogo = new Map()) {
  if (esCompraVentaEnRuta(compra)) {
    estado.comprasDocsRuta += 1;
    return false;
  }
  const esPedidoAba = notasTienenAbarrotes(compra);
  if (esPedidoAba) {
    estado.pedidosAbarrotes.push({
      id: compra?.id,
      fecha: ymdDesdeIso(compra?.created_at || compra?.fecha) || String(compra?.created_at || '').slice(0, 10),
      sucursal: normalizarCodigoTienda(compra?.sucursal_id),
      label: etiquetaTienda(compra?.sucursal_id),
      total: round2(compra?.total),
      estado: compra?.estado || '',
      notas: String(compra?.notas || '').slice(0, 180),
      lineas: articulosDeCompra(compra).length,
    });
  }
  if (String(compra?.estado || '').toLowerCase() === 'pedido') return false;

  estado.comprasDocsReales += 1;
  const items = articulosDeCompra(compra);
  const ymd = ymdDesdeIso(compra?.created_at || compra?.fecha);
  const suc = normalizarCodigoTienda(compra?.sucursal_id);
  let montoAba = 0;
  let unidAba = 0;
  const lineas = [];
  for (const it of items) {
    if (!esLineaDeptoAbarrotes(it, abaIds)) continue;
    const { q, monto } = montoCompraLinea(it, catalogo);
    if (q <= 0 && monto <= 0) continue;
    lineas.push({ it, q, monto });
    montoAba = round2(montoAba + monto);
    unidAba = round3(unidAba + q);
  }
  if (esPedidoAba) estado.comprasPedidoAbarrotesDocs += 1;
  if (!lineas.length) return false;

  estado.comprasDocsAbarrotes += 1;
  estado.comprasAbarrotesMonto = round2(estado.comprasAbarrotesMonto + montoAba);
  estado.comprasAbarrotesUnidades = round3(estado.comprasAbarrotesUnidades + unidAba);
  if (ymd) {
    estado.primeraCompra = minYmd(estado.primeraCompra, ymd);
    estado.ultimaCompra = maxYmd(estado.ultimaCompra, ymd);
  }
  const st = estado.porTienda[suc];
  if (!st) return true;
  st.comprasMonto = round2(st.comprasMonto + montoAba);
  st.comprasUnidades = round3(st.comprasUnidades + unidAba);
  st.comprasDocs += 1;
  if (ymd) {
    const wk = bucketSemana(st.semana, semanaOperativaKey(ymd));
    if (wk) {
      wk.compras = round2((wk.compras || 0) + montoAba);
      wk.comprasU = round3((wk.comprasU || 0) + unidAba);
      wk.docs += 1;
    }
    const mk = mesKey(ymd);
    if (!st.mes[mk]) st.mes[mk] = { ventas: 0, compras: 0, ventasU: 0, comprasU: 0 };
    st.mes[mk].compras = round2(st.mes[mk].compras + montoAba);
    st.mes[mk].comprasU = round3(st.mes[mk].comprasU + unidAba);
  }
  for (const { it, q, monto } of lineas) {
    const pid = pidDeLinea(it) || 'sin-id';
    if (!st.skuCompras[pid]) st.skuCompras[pid] = emptySku();
    const sku = st.skuCompras[pid];
    sku.nombre = it.nombre || it.producto_nombre || catalogo.get(pid)?.nombre || sku.nombre || pid;
    sku.monto = round2(sku.monto + monto);
    sku.unidades = round3(sku.unidades + q);
  }
  return true;
}

export function agregarEntrada(estado, mov, abaIds) {
  const pid = String(mov?.producto_id || '').trim();
  const dep = normalizarDepartamento(mov?.departamento);
  if (pid && abaIds instanceof Set && !abaIds.has(pid) && dep !== CAT_DEPTO_ABARROTES) return false;
  if (!pid && dep !== CAT_DEPTO_ABARROTES) return false;
  const modo = String(mov?.modo || '').toLowerCase();
  if (MODOS_ENTRADA_IGNORAR.has(modo)) return false;
  const tipo = String(mov?.tipo || '').toLowerCase();
  let suc = normalizarCodigoTienda(mov?.sucursal_id);
  if (tipo === 'traspaso') {
    const meta = mov?.meta && typeof mov.meta === 'object' ? mov.meta : {};
    suc = normalizarCodigoTienda(meta.sucursal_destino || meta.traspaso_destino || suc);
  }
  const st = estado.porTienda[suc];
  if (!st) return false;
  const q = Math.abs(Number(mov?.cantidad) || 0);
  if (q <= 0) return false;
  st.entradasUnidades = round3(st.entradasUnidades + q);
  let bucket = 'entradasMasivoU';
  if (tipo === 'traspaso') bucket = 'entradasTraspasoU';
  else if (modo === 'compra' || /compra/i.test(String(mov?.motivo || ''))) bucket = 'entradasCompraU';
  else if (modo === 'cedis') bucket = 'entradasCedisU';
  st[bucket] = round3((st[bucket] || 0) + q);
  const ymd = ymdDesdeIso(mov?.created_at);
  if (ymd) {
    const wk = bucketSemana(st.semana, semanaOperativaKey(ymd));
    if (wk) wk.entradasU = round3(wk.entradasU + q);
  }
  return true;
}

export function paretoDeMapa(skuMap, valueKey = 'monto', limit = 12) {
  const items = Object.entries(skuMap || {}).map(([id, s]) => ({
    id,
    nombre: s.nombre || id,
    monto: round2(s.monto || 0),
    unidades: round3(s.unidades || 0),
    tickets: Number(s.tickets) || 0,
  }));
  items.sort((a, b) => (b[valueKey] || 0) - (a[valueKey] || 0));
  const total = items.reduce((s, x) => s + (Number(x[valueKey]) || 0), 0) || 1;
  let acum = 0;
  const out = items.map((x, i) => {
    const val = Number(x[valueKey]) || 0;
    acum += val;
    return {
      ...x,
      pct: round2((100 * val) / total),
      acumPct: round2((100 * acum) / total),
      rank: i + 1,
    };
  });
  const corte80 = out.find((x) => x.acumPct >= 80)?.rank || out.length;
  return {
    totalSkus: out.length,
    skus80: corte80,
    top: out.slice(0, limit),
    valorTotal: round2(items.reduce((s, x) => s + (Number(x[valueKey]) || 0), 0)),
  };
}

export function diagnosticoTienda({
  ventasMonto,
  ventasUnidades,
  tickets,
  comprasMonto,
  comprasDocs,
  coberturaUnidades,
  stockUnidades,
  diasDeInventario,
}) {
  if ((ventasMonto || 0) <= 0 && (comprasMonto || 0) <= 0) {
    return { id: 'sin_movimiento', texto: 'Casi no hay movimiento de abarrotes en esta tienda.' };
  }
  if (coberturaUnidades != null && coberturaUnidades < 0.5 && (stockUnidades || 0) < (ventasUnidades || 0) * 0.1) {
    return { id: 'desabasto', texto: 'Se vende más de lo que se ha comprado; el piso está delgado.' };
  }
  if (coberturaUnidades != null && coberturaUnidades < 0.8) {
    return { id: 'abasto_corto', texto: 'Las compras no alcanzan a reponer lo vendido.' };
  }
  if (coberturaUnidades != null && coberturaUnidades > 1.4 && diasDeInventario && diasDeInventario > 45) {
    return { id: 'sobreabasto', texto: 'Se ha metido más mercancía de la que se está vendiendo.' };
  }
  if ((tickets || 0) === 0 && (comprasDocs || 0) > 0) {
    return { id: 'comprado_sin_venta', texto: 'Hay compras de abarrotes pero casi no se registran ventas del departamento.' };
  }
  return { id: 'abasto_ok', texto: 'Compras y ventas del departamento van más o menos a la par.' };
}

export const COLOR_DIAGNOSTICO = {
  desabasto: '#c0392b',
  abasto_corto: '#e67e22',
  sobreabasto: '#8e44ad',
  sin_movimiento: '#7f8c8d',
  comprado_sin_venta: '#2980b9',
  abasto_ok: '#27ae60',
};

function stockDeptoProducto(prod, sucursal) {
  if (!prod) return 0;
  if (sucursal) return Math.max(0, stockEnUbicacion(prod, sucursal, 'piso', sucursal));
  return 0;
}

export function textoConclusion({ totales, rango, paretoTiendas }) {
  const cov = totales.coberturaUnidades;
  const diasSin = rango.diasSinPedido;
  const top3 = (paretoTiendas || []).slice(0, 3);
  const acum3 = top3.length ? round2(top3[top3.length - 1].acumPct) : 0;
  const partes = [];
  if ((totales.comprasPedidoAbarrotesDocs || 0) < 15 && (cov == null || cov < 0.3)) {
    partes.push(
      'El departamento ABARROTES no se ha estado surtiendo de forma formal: hay ventas en caja, pero casi no hay Pedido Abarrotes recibido.',
    );
  } else if (cov != null && cov < 0.8) {
    partes.push('Las compras formales del departamento no alcanzan a cubrir lo que se está vendiendo.');
  } else {
    partes.push('Hay registro de compras y ventas del departamento en el periodo.');
  }
  if (diasSin != null && diasSin >= 21) {
    partes.push(`Llevan ${diasSin} días sin un pedido recibido de ABARROTES.`);
  }
  if (top3.length) {
    partes.push(
      `El ${acum3.toFixed(0)}% de la venta del depto. se concentra en ${top3.map((t) => t.label).join(', ')}.`,
    );
  }
  if ((totales.entradasMasivoU || 0) > (totales.entradasCompraU || 0) * 3 && (totales.entradasMasivoU || 0) > 100) {
    partes.push('La mercancía entra más por carga masiva que por compra formal.');
  }
  return partes.join(' ');
}

/**
 * Cierra el estado acumulado → objeto listo para la UI.
 */
export function construirReporte(estado, {
  desde,
  hasta,
  inventario = [],
  abaIds = new Set(),
  catalogo = new Map(),
  avisos = [],
} = {}) {
  const dias = diasInclusive(desde, hasta);
  const stockPorTienda = {};
  const skuStock = {};
  let stockCedisU = 0;
  let stockCedisValor = 0;
  let skusCedis = 0;
  for (const t of estado.tiendas) {
    stockPorTienda[t] = { unidades: 0, valorVenta: 0, skusConStock: 0, skusCero: 0 };
    skuStock[t] = {};
  }
  for (const pid of abaIds) {
    const prod = catalogo.get(pid) || inventario.find((p) => String(p.id) === pid);
    const precio = Number(prod?.precio) || 0;
    for (const t of estado.tiendas) {
      const u = Math.max(0, stockDeptoProducto(prod, t));
      skuStock[t][pid] = u;
      stockPorTienda[t].unidades += u;
      stockPorTienda[t].valorVenta += u * precio;
      if (u > 0) stockPorTienda[t].skusConStock += 1;
      else stockPorTienda[t].skusCero += 1;
    }
    const uCedis = Math.max(0, stockAlmacenCentral(prod, 'CEDIS'));
    stockCedisU += uCedis;
    stockCedisValor += uCedis * precio;
    if (uCedis > 0) skusCedis += 1;
  }

  const semanas = new Set(Object.keys(estado.semanaPOS));
  for (const t of estado.tiendas) {
    Object.keys(estado.porTienda[t].semana).forEach((k) => semanas.add(k));
  }
  const weeksSorted = [...semanas].filter(Boolean).sort();

  const tiendas = estado.tiendas.map((t) => {
    const st = estado.porTienda[t];
    const tickets = st.tickets.size;
    const stockU = round3(stockPorTienda[t].unidades);
    const dailyU = dias > 0 ? st.ventasUnidades / dias : 0;
    const dos = dailyU > 0 ? round2(stockU / dailyU) : null;
    const cobertura = st.ventasUnidades > 0 ? round2(st.comprasUnidades / st.ventasUnidades) : null;
    const coberturaEnt = st.ventasUnidades > 0 ? round2(st.entradasUnidades / st.ventasUnidades) : null;
    let vendidos = 0;
    let agotados = 0;
    let neverBought = 0;
    for (const [pid, s] of Object.entries(st.skuVentas)) {
      if ((s.unidades || 0) <= 0) continue;
      vendidos += 1;
      if ((skuStock[t][pid] || 0) <= 0) agotados += 1;
      if ((st.skuCompras[pid]?.unidades || 0) <= 0) neverBought += 1;
    }
    const diag = diagnosticoTienda({
      ventasMonto: st.ventasMonto,
      ventasUnidades: st.ventasUnidades,
      tickets,
      comprasMonto: st.comprasMonto,
      comprasDocs: st.comprasDocs,
      coberturaUnidades: cobertura,
      stockUnidades: stockU,
      diasDeInventario: dos,
    });
    const semanal = weeksSorted.map((w) => {
      const v = st.semana[w] || {};
      return {
        semana: w,
        label: etiquetaSemana(w),
        ventas: round2(v.monto || 0),
        compras: round2(v.compras || 0),
        ventasUnidades: round3(v.unidades || 0),
        comprasUnidades: round3(v.comprasU || 0),
        entradasUnidades: round3(v.entradasU || 0),
        tickets: v.tickets instanceof Set ? v.tickets.size : 0,
        docsCompra: v.docs || 0,
      };
    });
    return {
      id: t,
      label: st.label,
      ventasMonto: round2(st.ventasMonto),
      ventasUnidades: round3(st.ventasUnidades),
      tickets,
      comprasMonto: round2(st.comprasMonto),
      comprasUnidades: round3(st.comprasUnidades),
      comprasDocs: st.comprasDocs,
      entradasUnidades: round3(st.entradasUnidades),
      entradasCompraU: round3(st.entradasCompraU),
      entradasMasivoU: round3(st.entradasMasivoU),
      entradasCedisU: round3(st.entradasCedisU),
      entradasTraspasoU: round3(st.entradasTraspasoU),
      stockUnidades: stockU,
      stockValorVenta: round2(stockPorTienda[t].valorVenta),
      skusConStock: stockPorTienda[t].skusConStock,
      skusCero: stockPorTienda[t].skusCero,
      skusVendidos: vendidos,
      skusAgotadosVendidos: agotados,
      skusVendidosSinCompra: neverBought,
      coberturaUnidades: cobertura,
      coberturaEntradas: coberturaEnt,
      diasDeInventario: dos,
      ticketPromedioAba: tickets ? round2(st.ventasMonto / tickets) : 0,
      diagnostico: diag.id,
      diagnosticoTxt: diag.texto,
      paretoVentas: paretoDeMapa(st.skuVentas, 'monto', 12),
      paretoCompras: paretoDeMapa(st.skuCompras, 'monto', 8),
      semanal,
    };
  });

  const storePareto = [...tiendas].sort((a, b) => b.ventasMonto - a.ventasMonto);
  const sumV = storePareto.reduce((s, x) => s + x.ventasMonto, 0) || 1;
  let ac = 0;
  const paretoTiendas = storePareto.map((x, i) => {
    ac += x.ventasMonto;
    return {
      id: x.id,
      label: x.label,
      total: x.ventasMonto,
      pct: round2((100 * x.ventasMonto) / sumV),
      acumPct: round2((100 * ac) / sumV),
      color: colorTienda(i),
      rank: i + 1,
    };
  });

  const semanal = weeksSorted.map((w) => {
    const pos = estado.semanaPOS[w] || { tickets: 0, monto: 0 };
    let vM = 0;
    let cM = 0;
    let vU = 0;
    let cU = 0;
    let eU = 0;
    for (const t of estado.tiendas) {
      const s = estado.porTienda[t].semana[w] || {};
      vM += s.monto || 0;
      cM += s.compras || 0;
      vU += s.unidades || 0;
      cU += s.comprasU || 0;
      eU += s.entradasU || 0;
    }
    return {
      semana: w,
      label: etiquetaSemana(w),
      ventasAbarrotes: round2(vM),
      comprasAbarrotes: round2(cM),
      ventasUnidades: round3(vU),
      comprasUnidades: round3(cU),
      entradasUnidades: round3(eU),
      ventasPOS: round2(pos.monto),
      ticketsPOS: pos.tickets || 0,
    };
  });

  const share = estado.ventasPOSMonto > 0
    ? round2((100 * estado.ventasAbarrotesMonto) / estado.ventasPOSMonto)
    : 0;
  const coberturaGlobal = estado.ventasAbarrotesUnidades > 0
    ? round2(estado.comprasAbarrotesUnidades / estado.ventasAbarrotesUnidades)
    : null;

  const ultimaCompra = estado.ultimaCompra || '';
  const corte = hasta || ymdNogalesFromDate(new Date());
  const diasSinPedido = ultimaCompra
    ? Math.max(0, Math.round((new Date(`${corte}T12:00:00Z`) - new Date(`${ultimaCompra}T12:00:00Z`)) / 86400000))
    : null;

  const pedidos = [...estado.pedidosAbarrotes].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const rango = {
    desde,
    hasta,
    arranqueOperativo: FECHA_INICIO_DEPTO_ABARROTES,
    primeraVenta: estado.primeraVenta,
    ultimaVenta: estado.ultimaVenta,
    primeraCompra: estado.primeraCompra,
    ultimaCompra,
    diasSinPedido,
  };

  const totales = {
    ticketsPOS: estado.ticketsPOS,
    ticketsConAbarrotes: estado.ticketsConAbarrotes,
    ventasAbarrotesMonto: round2(estado.ventasAbarrotesMonto),
    ventasAbarrotesUnidades: round3(estado.ventasAbarrotesUnidades),
    ventasPOSMonto: round2(estado.ventasPOSMonto),
    shareAbarrotesPct: share,
    comprasDocsReales: estado.comprasDocsReales,
    comprasDocsRutaExcluidas: estado.comprasDocsRuta,
    comprasDocsAbarrotes: estado.comprasDocsAbarrotes,
    comprasPedidoAbarrotesDocs: estado.comprasPedidoAbarrotesDocs,
    comprasAbarrotesMonto: round2(estado.comprasAbarrotesMonto),
    comprasAbarrotesUnidades: round3(estado.comprasAbarrotesUnidades),
    stockPisoUnidades: round3(tiendas.reduce((s, t) => s + t.stockUnidades, 0)),
    stockPisoValorVenta: round2(tiendas.reduce((s, t) => s + t.stockValorVenta, 0)),
    stockCedisUnidades: round3(stockCedisU),
    coberturaUnidades: coberturaGlobal,
    entradasCompraU: round3(tiendas.reduce((s, t) => s + t.entradasCompraU, 0)),
    entradasMasivoU: round3(tiendas.reduce((s, t) => s + t.entradasMasivoU, 0)),
    entradasCedisU: round3(tiendas.reduce((s, t) => s + t.entradasCedisU, 0)),
    entradasTraspasoU: round3(tiendas.reduce((s, t) => s + t.entradasTraspasoU, 0)),
    skusCatalogo: abaIds.size,
    dias,
  };

  return {
    ok: true,
    departamento: CAT_DEPTO_ABARROTES,
    avisos,
    rango,
    totales,
    paretoTiendas,
    semanal,
    tiendas,
    pedidosAbarrotes: pedidos,
    cedis: {
      unidades: round3(stockCedisU),
      valorVenta: round2(stockCedisValor),
      skusConStock: skusCedis,
    },
    conclusion: textoConclusion({ totales, rango, paretoTiendas }),
  };
}

async function fetchAllPages(supabase, buildQuery, { pageSize = 1000, onPage } = {}) {
  const out = [];
  let from = 0;
  for (;;) {
    const q = buildQuery();
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) return { data: out, error };
    const batch = data || [];
    out.push(...batch);
    if (typeof onPage === 'function') onPage({ cargados: out.length, lote: batch.length });
    if (batch.length < pageSize) return { data: out, error: null };
    from += pageSize;
  }
}

function idsAbarrotes(productos, cat = CAT_DEPTO_ABARROTES) {
  const ids = new Set();
  const catalogo = new Map();
  for (const p of productos || []) {
    const id = String(p?.id || '').trim();
    if (!id) continue;
    catalogo.set(id, p);
    if (normalizarDepartamento(p.cat) === cat) ids.add(id);
  }
  return { ids, catalogo };
}

/**
 * Carga el reporte en vivo desde Supabase.
 * @param {object} opts
 * @param {string} opts.desde YYYY-MM-DD
 * @param {string} opts.hasta YYYY-MM-DD
 * @param {Array} [opts.inventario]
 * @param {function} [opts.onProgress]
 */
export async function cargarReporteDeptoAbarrotes(supabase, {
  desde,
  hasta,
  inventario = [],
  onProgress,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const avisos = [];
  const progress = (msg, extra = {}) => {
    if (typeof onProgress === 'function') onProgress({ mensaje: msg, ...extra });
  };

  progress('Cargando catálogo ABARROTES…', { fase: 'productos' });
  const { data: productosDb, error: errProd } = await supabase
    .from('productos')
    .select('id,nombre,cat,precio,precio_compra_sin,precio_compra_con,stock_sucursales,stock,stock_cedis')
    .limit(20000);
  if (errProd) avisos.push(`Productos: ${errProd.message}`);

  const byId = new Map();
  for (const p of productosDb || []) {
    const id = String(p?.id || '').trim();
    if (id) byId.set(id, p);
  }
  for (const p of inventario || []) {
    const id = String(p?.id || '').trim();
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) || {}), ...p });
  }
  const merged = [...byId.values()];
  const { ids: abaIds, catalogo } = idsAbarrotes(merged);
  if (!abaIds.size) avisos.push('No hay SKUs con catálogo ABARROTES.');

  const estado = crearEstadoReporte();
  const desdeDt = inicioDia(desde);
  const hastaDt = finDia(hasta);

  progress('Cargando compras…', { fase: 'compras' });
  const comprasRes = await fetchAllPages(supabase, () => supabase
    .from('compras')
    .select('id,sucursal_id,sucursal,estado,total,items,items_pedido,proveedor_id,fecha,created_at,notas')
    .gte('created_at', desdeDt.toISOString())
    .lte('created_at', hastaDt.toISOString())
    .order('created_at', { ascending: true }), { pageSize: 500 });
  if (comprasRes.error) avisos.push(`Compras: ${comprasRes.error.message}`);
  for (const c of comprasRes.data || []) agregarCompra(estado, c, abaIds, catalogo);

  progress('Cargando entradas de inventario…', { fase: 'entradas' });
  const movRes = await fetchAllPages(supabase, () => supabase
    .from('movimientos_inventario')
    .select('id,tipo,modo,producto_id,cantidad,sucursal_id,departamento,created_at,motivo,meta')
    .in('tipo', ['entrada', 'traspaso'])
    .gte('created_at', desdeDt.toISOString())
    .lte('created_at', hastaDt.toISOString())
    .order('created_at', { ascending: true }), {
    pageSize: 1000,
    onPage: ({ cargados }) => progress(`Entradas ${cargados.toLocaleString('es-MX')}…`, { fase: 'entradas', cargados }),
  });
  if (movRes.error) avisos.push(`Inventario: ${movRes.error.message}`);
  for (const m of movRes.data || []) agregarEntrada(estado, m, abaIds);

  progress('Cargando ventas del POS…', { fase: 'ventas', cargados: 0 });
  let from = 0;
  let errVentas = null;
  for (;;) {
    const { data, error } = await supabase
      .from('ventas')
      .select('id,sucursal_id,total,created_at,articulos')
      .gte('created_at', desdeDt.toISOString())
      .lte('created_at', hastaDt.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + VENTAS_PAGE_SIZE - 1);
    if (error) {
      errVentas = error;
      break;
    }
    const batch = data || [];
    for (const v of batch) agregarTicket(estado, v, abaIds, catalogo);
    from += batch.length;
    progress(`Ventas ${from.toLocaleString('es-MX')} tickets…`, { fase: 'ventas', cargados: from });
    if (batch.length < VENTAS_PAGE_SIZE) break;
  }
  if (errVentas) avisos.push(`Ventas: ${errVentas.message}`);

  progress('Armando gráficas…', { fase: 'cierre' });
  const pack = construirReporte(estado, {
    desde,
    hasta,
    inventario: merged,
    abaIds,
    catalogo,
    avisos,
  });
  if (errVentas && !estado.ticketsPOS) {
    return { ok: false, error: errVentas.message, avisos };
  }
  return pack;
}

function escCsv(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvReporteDeptoAbarrotes(pack) {
  if (!pack?.ok) return '';
  const lines = [];
  lines.push('Sección,Campo,Valor');
  lines.push(['Resumen', 'Departamento', pack.departamento].map(escCsv).join(','));
  lines.push(['Resumen', 'Desde', pack.rango?.desde].map(escCsv).join(','));
  lines.push(['Resumen', 'Hasta', pack.rango?.hasta].map(escCsv).join(','));
  lines.push(['Resumen', 'Ventas depto $', pack.totales.ventasAbarrotesMonto].map(escCsv).join(','));
  lines.push(['Resumen', '% del POS', pack.totales.shareAbarrotesPct].map(escCsv).join(','));
  lines.push(['Resumen', 'Compras depto $', pack.totales.comprasAbarrotesMonto].map(escCsv).join(','));
  lines.push(['Resumen', 'Cobertura unidades', pack.totales.coberturaUnidades].map(escCsv).join(','));
  lines.push(['Resumen', 'Días sin pedido', pack.rango.diasSinPedido].map(escCsv).join(','));
  lines.push(['Resumen', 'Conclusión', pack.conclusion].map(escCsv).join(','));
  lines.push('');
  lines.push(['Tienda', 'Ventas $', 'Ventas u', 'Tickets', 'Compras $', 'Compras u', 'Docs compra', 'Stock u', 'Cobertura', 'Diagnóstico'].map(escCsv).join(','));
  for (const t of pack.tiendas || []) {
    lines.push([
      t.label,
      t.ventasMonto,
      t.ventasUnidades,
      t.tickets,
      t.comprasMonto,
      t.comprasUnidades,
      t.comprasDocs,
      t.stockUnidades,
      t.coberturaUnidades,
      t.diagnosticoTxt,
    ].map(escCsv).join(','));
  }
  lines.push('');
  lines.push(['Semana', 'Ventas depto $', 'Compras depto $', 'Ventas u', 'Compras u', 'Entradas u', 'Ventas POS $'].map(escCsv).join(','));
  for (const s of pack.semanal || []) {
    lines.push([
      s.semana,
      s.ventasAbarrotes,
      s.comprasAbarrotes,
      s.ventasUnidades,
      s.comprasUnidades,
      s.entradasUnidades,
      s.ventasPOS,
    ].map(escCsv).join(','));
  }
  return `\uFEFF${lines.join('\n')}`;
}

export function descargarCsvReporteDepto(pack) {
  const csv = csvReporteDeptoAbarrotes(pack);
  if (!csv) return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `depto_abarrotes_${pack.rango?.desde || ''}_${pack.rango?.hasta || ''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
