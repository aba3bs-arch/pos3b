/**
 * Consolidación: tickets de compra ↔ ingresos de inventario (compra / ingreso libre / traspaso)
 * ↔ gastos PROVEEDORES del corte Abarrotes.
 *
 * Detecta:
 * - productos del ticket que no entraron al inventario
 * - gastos no generados o duplicados
 * - montos descuadrados
 * - ingresos sin gasto / gastos sin ingreso
 */
import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { inicioDia, finDia, ymdNogalesFromDate } from './corteCaja.js';
import {
  folioVisibleCompra,
  normalizarFolioInventario,
  variantesFolioInventario,
} from './foliosInventario.js';
import {
  MARKER_SMOK_INV,
  MARKER_TICKET_INV_LEGACY,
  parseFoliosInventarioSmoking,
} from './corteContabilidad/smokingSustentoInventario.js';
import {
  nombreProveedorDesdeGasto,
  normalizarNombreProveedorClave,
} from './proveedorEntregas.js';

export const MARKER_TRP_INV = 'TRP_INV:';

/** Tolerancia estricta (centavos) para considerar montos “cuadrados”. */
export const TOL_MONTO = 0.51;

/** Soft-match gasto↔ingreso: hasta $50 o 20% de diferencia. */
export const TOL_SOFT_ABS = 50;
export const TOL_SOFT_REL = 0.2;

/**
 * Días permitidos entre ingreso (lunes) y pago/gasto (viernes u otro día).
 * Compras a crédito: la mercancía entra antes; el gasto se captura al pagar.
 */
export const DIAS_MATCH_CREDITO = 14;

export const ESTADOS = {
  OK: 'ok',
  /** Ingreso/compra sin gasto aún — normal en compras a crédito (pendiente de pago). */
  CREDITO_PENDIENTE: 'credito_pendiente',
  /** @deprecated prefer CREDITO_PENDIENTE */
  SIN_GASTO: 'credito_pendiente',
  GASTO_DUPLICADO: 'gasto_duplicado',
  GASTO_SIN_INGRESO: 'gasto_sin_ingreso',
  SIN_INVENTARIO: 'sin_inventario',
  PRODUCTOS_FALTANTES: 'productos_faltantes',
  MONTO_DESCUADRADO: 'monto_descuadrado',
};

export const ETIQUETA_ESTADO = {
  [ESTADOS.OK]: 'Cuadrado',
  [ESTADOS.CREDITO_PENDIENTE]: 'Crédito · pendiente de pago',
  credito_pendiente: 'Crédito · pendiente de pago',
  [ESTADOS.GASTO_DUPLICADO]: 'Gasto duplicado',
  [ESTADOS.GASTO_SIN_INGRESO]: 'Gasto sin ingreso',
  [ESTADOS.SIN_INVENTARIO]: 'Sin inventario',
  [ESTADOS.PRODUCTOS_FALTANTES]: 'Productos faltantes',
  [ESTADOS.MONTO_DESCUADRADO]: 'Monto descuadrado',
};

export const COLOR_ESTADO = {
  [ESTADOS.OK]: '#0f766e',
  [ESTADOS.CREDITO_PENDIENTE]: '#a16207',
  credito_pendiente: '#a16207',
  [ESTADOS.GASTO_DUPLICADO]: '#b91c1c',
  [ESTADOS.GASTO_SIN_INGRESO]: '#7c3aed',
  [ESTADOS.SIN_INVENTARIO]: '#dc2626',
  [ESTADOS.PRODUCTOS_FALTANTES]: '#c2410c',
  [ESTADOS.MONTO_DESCUADRADO]: '#0369a1',
};

/** Estados que sí cuentan como discrepancia operativa (no el crédito pendiente). */
export function esDiscrepanciaEstado(estado) {
  const e = String(estado || '');
  return e && e !== ESTADOS.OK && e !== ESTADOS.CREDITO_PENDIENTE && e !== 'sin_gasto';
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function fmtMonto(n) {
  return `$${round2(n).toFixed(2)}`;
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

function articulosDeCompra(compra) {
  const items = parseJsonArray(compra?.items);
  if (items.length) return items;
  return parseJsonArray(compra?.items_pedido);
}

function claveProducto(line) {
  const id = String(line?.id || line?.producto_id || '').trim();
  if (id) return `id:${id}`;
  const nom = String(line?.nombre || line?.producto_nombre || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  return nom ? `nom:${nom}` : '';
}

function qtyDeLinea(line) {
  return Math.abs(Number(line?.qty ?? line?.cantidad ?? line?.qty_pedido ?? line?.qty_recibido) || 0);
}

function costoDeLinea(line) {
  return Number(line?.costo ?? line?.costo_est ?? line?.precio ?? line?.meta?.precio) || 0;
}

function folioDeMovimiento(m) {
  return normalizarFolioInventario(m?.folio || m?.meta?.folio || '');
}

function ymdDeIso(iso) {
  return ymdNogalesFromDate(iso) || String(iso || '').slice(0, 10);
}

function montosCuadran(a, b, tol = TOL_MONTO) {
  return Math.abs(round2(a) - round2(b)) <= tol;
}

/** Soft-match: $100 vs $108 (Snacky) sí acerca; no exige centavo exacto. */
export function montosCercanos(a, b, { absTol = TOL_SOFT_ABS, relTol = TOL_SOFT_REL } = {}) {
  const x = round2(a);
  const y = round2(b);
  if (!(x > 0) || !(y > 0)) return false;
  const diff = Math.abs(x - y);
  if (diff <= absTol) return true;
  return diff / Math.max(x, y) <= relTol;
}

function compraRecibida(c) {
  const est = String(c?.estado || '').toLowerCase();
  return !est || est === 'recibida' || est === 'recibido' || est === 'cerrada';
}

/** Folio visible tipo Consultas cuando no hay ING-/CMP- en meta. */
function folioDisplayMovimiento(m) {
  const raw = folioDeMovimiento(m);
  if (raw) return raw;
  const id = String(m?.id || m?.cloudId || '').replace(/[^a-fA-F0-9]/g, '');
  if (!id) return '';
  const hex = id.slice(-8) || id;
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return String(m.id).slice(0, 5);
  return String(n % 100000).padStart(5, '0');
}

/** Agrupa ingresos sin folio como en Consultas (misma tienda + usuario + ventana 3 min). */
function claveBucketSinFolio(m) {
  const t = new Date(m?.created_at || 0).getTime();
  const bucket = Number.isFinite(t) ? Math.floor(t / 180000) : 0;
  const sid = normalizarCodigoTienda(m?.sucursal_id) || '';
  const user = String(m?.usuario || '').trim() || '—';
  return `sinfolio:${sid}:${user}:${bucket}`;
}

function proveedoresCoinciden(a, b) {
  const ka = normalizarNombreProveedorClave(a);
  const kb = normalizarNombreProveedorClave(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

/** Extrae folios ligados a un gasto (SMOK_INV / TICKET_INV / TRP_INV / folios sueltos). */
export function foliosDesdeComentarioGasto(comentario) {
  const str = String(comentario || '');
  const up = str.toUpperCase();
  const out = [];
  const add = (f) => {
    const n = normalizarFolioInventario(f);
    if (n && !out.some((x) => x.toUpperCase() === n.toUpperCase())) out.push(n);
  };

  for (const marker of [MARKER_SMOK_INV, MARKER_TICKET_INV_LEGACY, MARKER_TRP_INV]) {
    const idx = up.indexOf(marker);
    if (idx < 0) continue;
    const rest = str.slice(idx + marker.length);
    for (const f of parseFoliosInventarioSmoking(rest)) add(f);
  }

  // Folios sueltos en el comentario (por si alguien pegó ING-/CMP-/trp- sin marcador).
  const re = /\b((?:ING|RET|CMP)-[A-Z0-9-]+|trp-[A-Za-z0-9-]+)\b/gi;
  let m;
  while ((m = re.exec(str))) add(m[1]);

  return out;
}

export function proveedorDesdeGasto(gasto) {
  const desdeSub = nombreProveedorDesdeGasto(gasto?.subcategoria);
  if (desdeSub) return desdeSub;
  const desdeCom = nombreProveedorDesdeGasto(gasto?.comentario);
  if (desdeCom) return desdeCom;
  const sub = String(gasto?.subcategoria || '').trim();
  if (sub) return sub;
  return '';
}

/**
 * Compara líneas del ticket/compra vs líneas de inventario.
 * Devuelve faltantes (en ticket, no en inventario o con menos qty).
 */
export function compararProductosTicketVsInventario(ticketLines, invLines) {
  const ticketMap = new Map();
  for (const l of ticketLines || []) {
    const k = claveProducto(l);
    if (!k) continue;
    const prev = ticketMap.get(k) || {
      clave: k,
      id: l.id || l.producto_id || null,
      nombre: l.nombre || l.producto_nombre || '—',
      qty_ticket: 0,
      costo: costoDeLinea(l),
    };
    prev.qty_ticket = round2(prev.qty_ticket + qtyDeLinea(l));
    if (!prev.costo) prev.costo = costoDeLinea(l);
    ticketMap.set(k, prev);
  }

  const invMap = new Map();
  for (const l of invLines || []) {
    const k = claveProducto(l);
    if (!k) continue;
    const prev = invMap.get(k) || {
      clave: k,
      id: l.id || l.producto_id || null,
      nombre: l.nombre || l.producto_nombre || '—',
      qty_inventario: 0,
      costo: costoDeLinea(l),
    };
    prev.qty_inventario = round2(prev.qty_inventario + qtyDeLinea(l));
    if (!prev.costo) prev.costo = costoDeLinea(l);
    invMap.set(k, prev);
  }

  const faltantes = [];
  for (const [k, t] of ticketMap) {
    const inv = invMap.get(k);
    const qtyInv = inv?.qty_inventario || 0;
    if (qtyInv + 0.001 < t.qty_ticket) {
      faltantes.push({
        ...t,
        qty_inventario: qtyInv,
        qty_faltante: round2(t.qty_ticket - qtyInv),
      });
    }
  }

  const extras = [];
  for (const [k, inv] of invMap) {
    if (!ticketMap.has(k)) {
      extras.push({
        ...inv,
        qty_ticket: 0,
        qty_faltante: 0,
      });
    }
  }

  return { faltantes, extras, ticketMap, invMap };
}

function totalLineas(lines) {
  return round2(
    (lines || []).reduce((a, l) => a + qtyDeLinea(l) * costoDeLinea(l), 0),
  );
}

function totalTraspasoLineas(lineas, campo = 'costo') {
  return round2(
    (Array.isArray(lineas) ? lineas : []).reduce((a, l) => {
      const qty = Math.max(0, Number(l?.cantidad) || 0);
      const val = Number(l?.[campo]) || 0;
      return a + qty * val;
    }, 0),
  );
}

function clavesFolio(folio, sucursal = '') {
  const vars = variantesFolioInventario(folio, sucursal);
  return [...new Set(vars.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean))];
}

/**
 * Clasifica el estado de una fila consolidada (prioridad de alertas).
 * Ingreso sin gasto = crédito pendiente de pago (no es falla automática).
 */
export function clasificarEstadoFila(fila) {
  if (fila?.origen === 'gasto_huerfano') return ESTADOS.GASTO_SIN_INGRESO;
  const nGastos = (fila?.gastos || []).length;
  const tieneInv = (fila?.lineas_inventario || []).length > 0 || fila?.tipo === 'traspaso';
  const faltantes = fila?.productos_faltantes || [];
  const ticket = Number(fila?.monto_ticket) || 0;
  const inv = Number(fila?.monto_inventario) || 0;
  const gasto = Number(fila?.monto_gasto) || 0;

  if (!tieneInv && (fila?.tipo === 'compra' || ticket > 0)) return ESTADOS.SIN_INVENTARIO;
  if (faltantes.length) return ESTADOS.PRODUCTOS_FALTANTES;
  if (nGastos > 1) return ESTADOS.GASTO_DUPLICADO;
  if (nGastos === 0) return ESTADOS.CREDITO_PENDIENTE;

  const ref = ticket > 0 ? ticket : inv;
  if (ref > 0 && !montosCuadran(ref, gasto)) return ESTADOS.MONTO_DESCUADRADO;
  if (ticket > 0 && inv > 0 && !montosCuadran(ticket, inv)) return ESTADOS.MONTO_DESCUADRADO;
  return ESTADOS.OK;
}

/**
 * Une compras + movimientos + traspasos + gastos en filas por folio / evento.
 * Función pura (sin I/O) — útil para tests.
 * @param {object} opts
 * @param {Map<string,{id:string,nombre:string}>} [opts.productoAProveedor] producto_id → proveedor
 */
export function consolidarEventos({
  compras = [],
  movimientos = [],
  traspasos = [],
  gastos = [],
  productoAProveedor = null,
} = {}) {
  /** @type {Map<string, object>} clave canónica → evento */
  const eventos = new Map();
  /** folio upper → clave canónica del evento */
  const folioIndex = new Map();

  const registrarFolios = (clave, folio, sucursal) => {
    for (const k of clavesFolio(folio, sucursal)) {
      if (!folioIndex.has(k)) folioIndex.set(k, clave);
    }
  };

  const ensureEvento = (clave, base) => {
    if (!eventos.has(clave)) eventos.set(clave, base);
    return eventos.get(clave);
  };

  const proveedorDeLineas = (lineas) => {
    if (!productoAProveedor || !(productoAProveedor instanceof Map)) return '';
    const counts = new Map();
    for (const l of lineas || []) {
      const pid = String(l.producto_id || l.id || '').trim();
      if (!pid) continue;
      const p = productoAProveedor.get(pid);
      const nom = p?.nombre || '';
      const k = normalizarNombreProveedorClave(nom);
      if (!k) continue;
      const prev = counts.get(k) || { n: 0, nombre: nom };
      prev.n += 1;
      counts.set(k, prev);
    }
    let best = null;
    for (const v of counts.values()) {
      if (!best || v.n > best.n) best = v;
    }
    return best?.nombre || '';
  };

  // 1) Compras recibidas
  for (const c of compras || []) {
    if (!compraRecibida(c)) continue;
    const sid = normalizarCodigoTienda(c.sucursal_id || c.sucursal) || 'MAIN';
    const folio = folioVisibleCompra(c) || normalizarFolioInventario(c.id);
    const clave = `compra:${c.id}`;
    const ticketLines = articulosDeCompra(c).map((l) => ({
      id: l.id,
      nombre: l.nombre,
      qty: qtyDeLinea(l),
      costo: Number(l.costo ?? l.costo_est) || 0,
    }));
    ensureEvento(clave, {
      id: clave,
      origen: 'compra',
      tipo: 'compra',
      folio,
      compra_id: c.id,
      sucursal_id: sid,
      tienda: etiquetaTienda(sid),
      fecha: c.created_at || c.fecha || null,
      fecha_ymd: ymdDeIso(c.created_at || c.fecha),
      proveedor: c.proveedores?.nombre || c.proveedor_nombre || '',
      proveedor_id: c.proveedor_id || null,
      monto_ticket: round2(c.total),
      monto_inventario: 0,
      monto_gasto: 0,
      lineas_ticket: ticketLines,
      lineas_inventario: [],
      productos_faltantes: [],
      gastos: [],
      notas: c.notas || '',
    });
    registrarFolios(clave, folio, sid);
    if (c.id) registrarFolios(clave, String(c.id), sid);
  }

  // 2) Movimientos de entrada agrupados por folio (o bucket 3 min si no hay folio)
  const movPorGrupo = new Map();
  for (const m of movimientos || []) {
    const tipo = String(m.tipo || '').toLowerCase();
    if (tipo && tipo !== 'entrada') continue;
    const modo = String(m.modo || m.meta?.modo || '').toLowerCase();
    if (modo === 'retiro') continue;
    const folio = folioDeMovimiento(m);
    if (folio && /^RET-/i.test(folio)) continue;
    const key = folio ? `folio:${folio.toUpperCase()}` : claveBucketSinFolio(m);
    if (!movPorGrupo.has(key)) movPorGrupo.set(key, []);
    movPorGrupo.get(key).push(m);
  }

  for (const [grupoKey, rows] of movPorGrupo) {
    const folioRaw = folioDeMovimiento(rows[0]);
    const folio = folioRaw || folioDisplayMovimiento(rows[0]) || grupoKey;
    const sid =
      normalizarCodigoTienda(
        rows.find((r) => !['MAIN', 'CEDIS'].includes(normalizarCodigoTienda(r.sucursal_id)))?.sucursal_id,
      ) ||
      normalizarCodigoTienda(rows[0]?.sucursal_id) ||
      'MAIN';

    const lineas = rows.map((m) => ({
      id: m.producto_id,
      producto_id: m.producto_id,
      nombre: m.producto_nombre || m.nombre,
      producto_nombre: m.producto_nombre || m.nombre,
      qty: Math.abs(Number(m.cantidad) || 0),
      cantidad: Math.abs(Number(m.cantidad) || 0),
      costo: (() => {
        const u = Number(m.meta?.precio) || 0;
        if (u > 0) return u;
        const qty = Math.abs(Number(m.cantidad) || 0);
        const sub = Number(m.meta?.subtotal) || 0;
        return qty > 0 && sub > 0 ? sub / qty : 0;
      })(),
      precio: Number(m.meta?.precio) || 0,
      meta: m.meta,
    }));
    const montoInv = totalLineas(lineas);
    const fecha = rows.map((r) => r.created_at).filter(Boolean).sort()[0] || null;
    const proveedorInf = proveedorDeLineas(lineas);

    let claveExistente = null;
    if (folioRaw) {
      for (const k of clavesFolio(folioRaw, sid)) {
        if (folioIndex.has(k)) {
          claveExistente = folioIndex.get(k);
          break;
        }
      }
    }

    if (claveExistente && eventos.has(claveExistente)) {
      const ev = eventos.get(claveExistente);
      ev.lineas_inventario = [...(ev.lineas_inventario || []), ...lineas];
      ev.monto_inventario = round2(totalLineas(ev.lineas_inventario));
      if (!ev.fecha) ev.fecha = fecha;
      if (!ev.proveedor && proveedorInf) ev.proveedor = proveedorInf;
      if (folioRaw) registrarFolios(claveExistente, folioRaw, sid);
      continue;
    }

    const clave = folioRaw ? `ingreso:${String(folioRaw).toUpperCase()}` : `ingreso:${grupoKey}`;
    ensureEvento(clave, {
      id: clave,
      origen: 'ingreso',
      tipo: folioRaw && /^CMP-/i.test(folioRaw) ? 'compra' : 'ingreso',
      folio,
      compra_id: null,
      sucursal_id: sid,
      tienda: etiquetaTienda(sid),
      fecha,
      fecha_ymd: ymdDeIso(fecha),
      proveedor: proveedorInf,
      proveedor_id: null,
      monto_ticket: 0,
      monto_inventario: montoInv,
      monto_gasto: 0,
      lineas_ticket: [],
      lineas_inventario: lineas,
      productos_faltantes: [],
      gastos: [],
      notas: rows[0]?.motivo || '',
    });
    if (folioRaw) registrarFolios(clave, folioRaw, sid);
  }

  // 3) Traspasos recibidos
  for (const t of traspasos || []) {
    const est = String(t.estado || '').toLowerCase();
    if (est && !['recibido', 'recibida', 'cerrado', 'cerrada'].includes(est)) continue;
    const folio = normalizarFolioInventario(t.folio) || String(t.folio || '').trim();
    if (!folio) continue;
    const sid = normalizarCodigoTienda(t.destino_id || t.sucursal_id) || 'MAIN';
    const lineasRaw = parseJsonArray(t.lineas);
    const lineas = lineasRaw.map((l) => ({
      id: l.producto_id || l.id,
      nombre: l.nombre || l.producto_nombre,
      qty: Number(l.cantidad) || 0,
      costo: Number(l.costo) || Number(l.precio) || 0,
    }));
    const montoCosto = totalTraspasoLineas(lineasRaw, 'costo');
    const montoPrecio = totalTraspasoLineas(lineasRaw, 'precio');
    const clave = `traspaso:${String(t.id || folio).toUpperCase()}`;
    ensureEvento(clave, {
      id: clave,
      origen: 'traspaso',
      tipo: 'traspaso',
      folio,
      compra_id: null,
      traspaso_id: t.id,
      sucursal_id: sid,
      tienda: etiquetaTienda(sid),
      fecha: t.recibido_at || t.created_at || null,
      fecha_ymd: ymdDeIso(t.recibido_at || t.created_at),
      proveedor: `Traspaso ${etiquetaTienda(t.origen_id)} → ${etiquetaTienda(sid)}`,
      proveedor_id: null,
      monto_ticket: montoCosto || montoPrecio,
      monto_inventario: montoCosto || montoPrecio,
      monto_gasto: 0,
      lineas_ticket: lineas,
      lineas_inventario: lineas,
      productos_faltantes: [],
      gastos: [],
      notas: t.notas || '',
      origen_id: t.origen_id,
      destino_id: t.destino_id,
    });
    registrarFolios(clave, folio, sid);
  }

  // 4) Ligar gastos por folio (duro) y soft-match
  const gastosUsados = new Set();

  const vincularGasto = (ev, g, via) => {
    if (!ev || !g?.id) return;
    if (ev.gastos.some((x) => String(x.id) === String(g.id))) return;
    ev.gastos.push({
      id: g.id,
      monto: round2(g.monto),
      categoria: g.categoria || '',
      subcategoria: g.subcategoria || '',
      comentario: g.comentario || '',
      proveedor: proveedorDesdeGasto(g),
      fecha: g.created_at,
      fecha_ymd: ymdDeIso(g.created_at),
      sucursal_id: normalizarCodigoTienda(g.sucursal_id) || '',
      via,
      usuario: g.usuario_nombre || '',
    });
    gastosUsados.add(String(g.id));
    if (!ev.proveedor) ev.proveedor = proveedorDesdeGasto(g);
  };

  for (const g of gastos || []) {
    const folios = foliosDesdeComentarioGasto(g.comentario);
    if (!folios.length) continue;
    const sid = normalizarCodigoTienda(g.sucursal_id) || '';
    for (const f of folios) {
      let clave = null;
      for (const k of clavesFolio(f, sid)) {
        if (folioIndex.has(k)) {
          clave = folioIndex.get(k);
          break;
        }
      }
      if (clave && eventos.has(clave)) {
        vincularGasto(eventos.get(clave), g, 'folio');
      }
    }
  }

  // Soft-match: gasto sin folio → ingreso sin gasto
  // 1) monto exacto  2) proveedor + monto cercano  3) proveedor + mismo día
  const gastosPendientes = (gastos || []).filter((g) => !gastosUsados.has(String(g.id)));
  for (const g of gastosPendientes) {
    const sid = normalizarCodigoTienda(g.sucursal_id) || '';
    const monto = round2(g.monto);
    const ymd = ymdDeIso(g.created_at);
    const provGasto = proveedorDesdeGasto(g);

    let mejor = null;
    let mejorScore = -1;
    let via = 'monto';
    for (const ev of eventos.values()) {
      if ((ev.gastos || []).length) continue;
      if (sid && ev.sucursal_id && ev.sucursal_id !== sid) continue;
      const ref = Number(ev.monto_ticket) > 0 ? Number(ev.monto_ticket) : Number(ev.monto_inventario);
      if (!(ref > 0) && !(ev.lineas_inventario || []).length) continue;

      let score = 0;
      const mismoProv = proveedoresCoinciden(provGasto, ev.proveedor);
      const exacto = ref > 0 && montosCuadran(ref, monto);
      const cercano = ref > 0 && montosCercanos(ref, monto);

      if (exacto) score += 20;
      else if (cercano) score += 12;
      else if (mismoProv) score += 6; // proveedor sin monto cercano: aún se liga (quedará descuadrado)
      else continue;

      if (mismoProv) score += 10;

      if (ev.fecha_ymd && ymd) {
        const d0 = Date.parse(`${ev.fecha_ymd}T12:00:00`);
        const d1 = Date.parse(`${ymd}T12:00:00`);
        if (!Number.isNaN(d0) && !Number.isNaN(d1)) {
          const dias = Math.abs(d0 - d1) / 86400000;
          // Crédito: ingreso lunes / pago viernes (u hasta ~2 semanas).
          if (dias > DIAS_MATCH_CREDITO) continue;
          score += Math.max(0, 8 - Math.min(dias, 7));
        }
      } else {
        score += 1;
      }

      if (score > mejorScore) {
        mejorScore = score;
        mejor = ev;
        via = exacto ? 'monto' : cercano ? 'monto_cercano' : 'proveedor';
      }
    }
    if (mejor && mejorScore >= 12) vincularGasto(mejor, g, via);
  }

  // 5) Finalizar filas: faltantes, montos gasto, estado
  const filas = [];
  for (const ev of eventos.values()) {
    const cmp = compararProductosTicketVsInventario(ev.lineas_ticket, ev.lineas_inventario);
    ev.productos_faltantes = (ev.lineas_ticket || []).length ? cmp.faltantes : [];
    if (!(Number(ev.monto_inventario) > 0) && (ev.lineas_inventario || []).length) {
      ev.monto_inventario = totalLineas(ev.lineas_inventario);
    }
    ev.monto_gasto = round2((ev.gastos || []).reduce((a, g) => a + (Number(g.monto) || 0), 0));
    ev.n_gastos = (ev.gastos || []).length;
    ev.n_faltantes = (ev.productos_faltantes || []).length;
    ev.estado = clasificarEstadoFila(ev);
    ev.estado_label = ETIQUETA_ESTADO[ev.estado] || ev.estado;
    filas.push(ev);
  }

  // 6) Gastos huérfanos (sin ingreso)
  for (const g of gastos || []) {
    if (gastosUsados.has(String(g.id))) continue;
    const sid = normalizarCodigoTienda(g.sucursal_id) || 'MAIN';
    const folios = foliosDesdeComentarioGasto(g.comentario);
    const fila = {
      id: `gasto:${g.id}`,
      origen: 'gasto_huerfano',
      tipo: 'gasto',
      folio: folios[0] || '—',
      folios_marcados: folios,
      compra_id: null,
      sucursal_id: sid,
      tienda: etiquetaTienda(sid),
      fecha: g.created_at,
      fecha_ymd: ymdDeIso(g.created_at),
      proveedor: proveedorDesdeGasto(g),
      proveedor_id: null,
      monto_ticket: 0,
      monto_inventario: 0,
      monto_gasto: round2(g.monto),
      lineas_ticket: [],
      lineas_inventario: [],
      productos_faltantes: [],
      gastos: [
        {
          id: g.id,
          monto: round2(g.monto),
          categoria: g.categoria || '',
          subcategoria: g.subcategoria || '',
          comentario: g.comentario || '',
          proveedor: proveedorDesdeGasto(g),
          fecha: g.created_at,
          fecha_ymd: ymdDeIso(g.created_at),
          sucursal_id: sid,
          via: folios.length ? 'folio_sin_ingreso' : 'sin_vínculo',
          usuario: g.usuario_nombre || '',
        },
      ],
      n_gastos: 1,
      n_faltantes: 0,
      notas: g.comentario || '',
    };
    fila.estado = clasificarEstadoFila(fila);
    fila.estado_label = ETIQUETA_ESTADO[fila.estado] || fila.estado;
    filas.push(fila);
  }

  filas.sort((a, b) => {
    const fa = String(a.fecha_ymd || '');
    const fb = String(b.fecha_ymd || '');
    if (fa !== fb) return fb.localeCompare(fa);
    return String(a.tienda || '').localeCompare(String(b.tienda || ''), 'es');
  });

  return filas;
}

/** Resumen global + por tienda. */
export function resumirConsolidacion(filas) {
  const resumen = {
    n_eventos: 0,
    n_ok: 0,
    n_credito_pendiente: 0,
    n_discrepancias: 0,
    por_estado: {},
    monto_ticket: 0,
    monto_inventario: 0,
    monto_gasto: 0,
    diferencia_ticket_gasto: 0,
    n_productos_faltantes: 0,
    por_tienda: [],
  };

  const estadosUnicos = [...new Set([...Object.values(ESTADOS), 'credito_pendiente', 'sin_gasto'])];
  for (const e of estadosUnicos) {
    resumen.por_estado[e] = 0;
  }

  const tiendas = new Map();
  for (const f of filas || []) {
    resumen.n_eventos += 1;
    const est = f.estado || ESTADOS.OK;
    resumen.por_estado[est] = (resumen.por_estado[est] || 0) + 1;
    if (est === ESTADOS.OK) resumen.n_ok += 1;
    else if (est === ESTADOS.CREDITO_PENDIENTE || est === 'sin_gasto') resumen.n_credito_pendiente += 1;
    else if (esDiscrepanciaEstado(est)) resumen.n_discrepancias += 1;

    resumen.monto_ticket = round2(resumen.monto_ticket + (Number(f.monto_ticket) || 0));
    resumen.monto_inventario = round2(resumen.monto_inventario + (Number(f.monto_inventario) || 0));
    resumen.monto_gasto = round2(resumen.monto_gasto + (Number(f.monto_gasto) || 0));
    resumen.n_productos_faltantes += Number(f.n_faltantes) || (f.productos_faltantes || []).length || 0;

    const tid = f.sucursal_id || 'MAIN';
    if (!tiendas.has(tid)) {
      tiendas.set(tid, {
        id: tid,
        label: f.tienda || etiquetaTienda(tid),
        n_eventos: 0,
        n_ok: 0,
        n_credito_pendiente: 0,
        n_discrepancias: 0,
        por_estado: {},
        monto_ticket: 0,
        monto_inventario: 0,
        monto_gasto: 0,
        n_productos_faltantes: 0,
        filas: [],
      });
    }
    const t = tiendas.get(tid);
    t.n_eventos += 1;
    t.por_estado[est] = (t.por_estado[est] || 0) + 1;
    if (est === ESTADOS.OK) t.n_ok += 1;
    else if (est === ESTADOS.CREDITO_PENDIENTE || est === 'sin_gasto') t.n_credito_pendiente += 1;
    else if (esDiscrepanciaEstado(est)) t.n_discrepancias += 1;
    t.monto_ticket = round2(t.monto_ticket + (Number(f.monto_ticket) || 0));
    t.monto_inventario = round2(t.monto_inventario + (Number(f.monto_inventario) || 0));
    t.monto_gasto = round2(t.monto_gasto + (Number(f.monto_gasto) || 0));
    t.n_productos_faltantes += Number(f.n_faltantes) || (f.productos_faltantes || []).length || 0;
    t.filas.push(f);
  }

  resumen.diferencia_ticket_gasto = round2(resumen.monto_ticket - resumen.monto_gasto);
  resumen.por_tienda = [...tiendas.values()].sort(
    (a, b) => b.n_discrepancias - a.n_discrepancias || a.label.localeCompare(b.label, 'es'),
  );
  return resumen;
}

function addDaysYmd(ymd, days) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ymdEnPeriodo(ymd, desde, hasta) {
  if (!ymd) return false;
  if (desde && ymd < desde) return false;
  if (hasta && ymd > hasta) return false;
  return true;
}

export function tiendasFiltroConsolidacionCompras() {
  return [{ id: '', label: 'Todas las tiendas' }, ...listarSucursalesOperativas().map((s) => ({ id: s, label: etiquetaTienda(s) }))];
}

export function columnasCsvConsolidacionCompras() {
  return [
    { label: 'Fecha', value: (r) => r.fecha_ymd || '' },
    { label: 'Tienda', value: (r) => r.tienda || r.sucursal_id || '' },
    { label: 'Tipo', value: (r) => r.tipo || '' },
    { label: 'Folio', value: (r) => r.folio || '' },
    { label: 'Proveedor', value: (r) => r.proveedor || '' },
    { label: 'Ticket', value: (r) => round2(r.monto_ticket) },
    { label: 'Inventario', value: (r) => round2(r.monto_inventario) },
    { label: 'Gasto', value: (r) => round2(r.monto_gasto) },
    { label: 'N gastos', value: (r) => r.n_gastos || 0 },
    { label: 'Productos faltantes', value: (r) => r.n_faltantes || 0 },
    { label: 'Estado', value: (r) => r.estado_label || r.estado || '' },
    {
      label: 'Detalle faltantes',
      value: (r) =>
        (r.productos_faltantes || [])
          .map((p) => `${p.nombre} (−${p.qty_faltante})`)
          .join('; '),
    },
  ];
}

async function fetchAllPages(buildQuery, { pageSize = 1000, maxPages = 20 } = {}) {
  const out = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const q = buildQuery();
    const { data, error } = await q.range(from, to);
    if (error) return { data: out, error };
    const chunk = data || [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { data: out, error: null };
}

/**
 * Carga datos del periodo y consolida.
 * Amplía ±DIAS_MATCH_CREDITO para cruzar ingreso lunes ↔ pago viernes (crédito).
 */
export async function cargarConsolidacionComprasInventario(
  supabase,
  { desde, hasta, sucursal = '' } = {},
) {
  if (!supabase) return { filas: [], resumen: resumirConsolidacion([]), error: 'Sin conexión.' };
  if (!desde || !hasta) return { filas: [], resumen: resumirConsolidacion([]), error: 'Indica el periodo.' };

  const suc = sucursal ? normalizarCodigoTienda(sucursal) : '';
  // Margen para compras a crédito: ingreso en el periodo, gasto días después (o al revés).
  const desdeMatch = addDaysYmd(desde, -DIAS_MATCH_CREDITO);
  const hastaMatch = addDaysYmd(hasta, DIAS_MATCH_CREDITO);
  const desdeDt = inicioDia(desdeMatch);
  const hastaDt = finDia(hastaMatch);
  const avisos = [];

  const selectMov =
    'id,tipo,modo,producto_id,producto_nombre,cantidad,sucursal_id,meta,created_at,motivo,usuario';
  const selectTrp =
    'id,folio,tipo,estado,origen_id,destino_id,lineas,notas,created_at,enviado_at,recibido_at';

  const [comprasRes, movRes, trpRes, gastosRes, vinculosRes, provRes] = await Promise.all([
    fetchAllPages(() => {
      let q = supabase
        .from('compras')
        .select('id,sucursal_id,sucursal,estado,total,items,items_pedido,proveedor_id,fecha,created_at,notas,proveedores(nombre)')
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .order('created_at', { ascending: false });
      if (suc) q = q.eq('sucursal_id', suc);
      return q;
    }),
    fetchAllPages(() => {
      let q = supabase
        .from('movimientos_inventario')
        .select(selectMov)
        .eq('tipo', 'entrada')
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .order('created_at', { ascending: false });
      if (suc) {
        q = q.in('sucursal_id', [suc, 'MAIN', 'CEDIS']);
      }
      return q;
    }),
    fetchAllPages(() => {
      let q = supabase
        .from('inventario_traspasos')
        .select(selectTrp)
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .order('created_at', { ascending: false });
      if (suc) q = q.eq('destino_id', suc);
      return q;
    }),
    fetchAllPages(() => {
      let q = supabase
        .from('cortes_contabilidad_gastos')
        .select('id,sucursal_id,modulo,categoria,subcategoria,comentario,monto,usuario_nombre,created_at,cerrado')
        .eq('modulo', 'abarrotes')
        .ilike('categoria', '%PROVEEDOR%')
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .order('created_at', { ascending: false });
      if (suc) q = q.eq('sucursal_id', suc);
      return q;
    }),
    supabase.from('proveedor_producto').select('proveedor_id, producto_id').limit(20000),
    supabase.from('proveedores').select('id, nombre').order('nombre'),
  ]);

  if (comprasRes.error && !/does not exist|schema cache|compras/i.test(String(comprasRes.error.message || ''))) {
    avisos.push(`Compras: ${comprasRes.error.message}`);
  }
  if (movRes.error && movRes.error.code !== '42P01') {
    avisos.push(`Inventario: ${movRes.error.message}`);
  }
  if (trpRes.error && trpRes.error.code !== '42P01') {
    // Reintento sin columnas opcionales si el esquema es más viejo
    if (/updated_at|recibido_at|enviado_at|column/i.test(String(trpRes.error.message || ''))) {
      const trp2 = await fetchAllPages(() => {
        let q = supabase
          .from('inventario_traspasos')
          .select('id,folio,tipo,estado,origen_id,destino_id,lineas,notas,created_at')
          .gte('created_at', desdeDt.toISOString())
          .lte('created_at', hastaDt.toISOString())
          .order('created_at', { ascending: false });
        if (suc) q = q.eq('destino_id', suc);
        return q;
      });
      if (!trp2.error) {
        trpRes.data = trp2.data;
        trpRes.error = null;
      } else {
        avisos.push(`Traspasos: ${trpRes.error.message}`);
      }
    } else {
      avisos.push(`Traspasos: ${trpRes.error.message}`);
    }
  }
  if (gastosRes.error && gastosRes.error.code !== '42P01') {
    avisos.push(`Gastos: ${gastosRes.error.message}`);
  }

  const productoAProveedor = new Map();
  const provById = new Map((provRes.data || []).map((p) => [String(p.id), p]));
  for (const v of vinculosRes.data || []) {
    const pid = String(v.producto_id || '').trim();
    const prid = String(v.proveedor_id || '').trim();
    if (!pid || !prid || productoAProveedor.has(pid)) continue;
    const p = provById.get(prid);
    if (p) productoAProveedor.set(pid, { id: prid, nombre: p.nombre });
  }

  let movimientos = movRes.data || [];
  if (suc) {
    movimientos = movimientos.filter((m) => {
      const ms = normalizarCodigoTienda(m.sucursal_id);
      if (ms === suc) return true;
      if (ms === 'MAIN' || ms === 'CEDIS') return true;
      return false;
    });
  }

  const filas = consolidarEventos({
    compras: (comprasRes.data || []).filter(compraRecibida),
    movimientos,
    traspasos: trpRes.data || [],
    gastos: gastosRes.data || [],
    productoAProveedor,
  });

  let filasFiltradas = filas.filter((f) => {
    // Visible si el ingreso/compra/traspaso cae en el periodo…
    if (ymdEnPeriodo(f.fecha_ymd, desde, hasta)) return true;
    // …o el pago (gasto) cayó en el periodo (crédito pagado esta semana).
    if ((f.gastos || []).some((g) => ymdEnPeriodo(g.fecha_ymd, desde, hasta))) return true;
    return false;
  });

  if (suc) {
    filasFiltradas = filasFiltradas.filter((f) => {
      if (f.sucursal_id === suc) return true;
      if (['MAIN', 'CEDIS'].includes(f.sucursal_id) && (f.gastos || []).some((g) => g.sucursal_id === suc)) {
        return true;
      }
      return false;
    });
  }

  const resumen = resumirConsolidacion(filasFiltradas);
  return {
    filas: filasFiltradas,
    resumen,
    error: null,
    aviso: avisos.length ? avisos.join(' · ') : null,
    meta: {
      n_compras: (comprasRes.data || []).length,
      n_movimientos: movimientos.length,
      n_traspasos: (trpRes.data || []).length,
      n_gastos: (gastosRes.data || []).length,
      margen_credito_dias: DIAS_MATCH_CREDITO,
    },
  };
}
