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

/** Tolerancia de monto (centavos) para considerar “cuadra”. */
export const TOL_MONTO = 0.51;

export const ESTADOS = {
  OK: 'ok',
  SIN_GASTO: 'sin_gasto',
  GASTO_DUPLICADO: 'gasto_duplicado',
  GASTO_SIN_INGRESO: 'gasto_sin_ingreso',
  SIN_INVENTARIO: 'sin_inventario',
  PRODUCTOS_FALTANTES: 'productos_faltantes',
  MONTO_DESCUADRADO: 'monto_descuadrado',
};

export const ETIQUETA_ESTADO = {
  [ESTADOS.OK]: 'Cuadrado',
  [ESTADOS.SIN_GASTO]: 'Sin gasto',
  [ESTADOS.GASTO_DUPLICADO]: 'Gasto duplicado',
  [ESTADOS.GASTO_SIN_INGRESO]: 'Gasto sin ingreso',
  [ESTADOS.SIN_INVENTARIO]: 'Sin inventario',
  [ESTADOS.PRODUCTOS_FALTANTES]: 'Productos faltantes',
  [ESTADOS.MONTO_DESCUADRADO]: 'Monto descuadrado',
};

export const COLOR_ESTADO = {
  [ESTADOS.OK]: '#0f766e',
  [ESTADOS.SIN_GASTO]: '#b45309',
  [ESTADOS.GASTO_DUPLICADO]: '#b91c1c',
  [ESTADOS.GASTO_SIN_INGRESO]: '#7c3aed',
  [ESTADOS.SIN_INVENTARIO]: '#dc2626',
  [ESTADOS.PRODUCTOS_FALTANTES]: '#c2410c',
  [ESTADOS.MONTO_DESCUADRADO]: '#0369a1',
};

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

function compraRecibida(c) {
  const est = String(c?.estado || '').toLowerCase();
  return !est || est === 'recibida' || est === 'recibido' || est === 'cerrada';
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
  if (nGastos === 0) return ESTADOS.SIN_GASTO;

  const ref = ticket > 0 ? ticket : inv;
  if (ref > 0 && !montosCuadran(ref, gasto)) return ESTADOS.MONTO_DESCUADRADO;
  if (ticket > 0 && inv > 0 && !montosCuadran(ticket, inv)) return ESTADOS.MONTO_DESCUADRADO;
  return ESTADOS.OK;
}

/**
 * Une compras + movimientos + traspasos + gastos en filas por folio / evento.
 * Función pura (sin I/O) — útil para tests.
 */
export function consolidarEventos({ compras = [], movimientos = [], traspasos = [], gastos = [] } = {}) {
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
    const ev = ensureEvento(clave, {
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

  // 2) Movimientos de entrada agrupados por folio
  const movPorFolio = new Map();
  for (const m of movimientos || []) {
    const tipo = String(m.tipo || '').toLowerCase();
    if (tipo && tipo !== 'entrada') continue;
    const folio = folioDeMovimiento(m);
    if (!folio) continue;
    // Solo ingresos de compra / masivo (no retiros disfrazados)
    const modo = String(m.modo || m.meta?.modo || '').toLowerCase();
    if (modo && !['compra', 'masivo', 'entrada', ''].includes(modo) && modo === 'retiro') continue;
    if (/^RET-/i.test(folio)) continue;

    const key = folio.toUpperCase();
    if (!movPorFolio.has(key)) movPorFolio.set(key, []);
    movPorFolio.get(key).push(m);
  }

  for (const [folioUp, rows] of movPorFolio) {
    const folio = folioDeMovimiento(rows[0]) || folioUp;
    const sid =
      normalizarCodigoTienda(rows.find((r) => !['MAIN', 'CEDIS'].includes(normalizarCodigoTienda(r.sucursal_id)))?.sucursal_id) ||
      normalizarCodigoTienda(rows[0]?.sucursal_id) ||
      'MAIN';

    const lineas = rows.map((m) => ({
      id: m.producto_id,
      producto_id: m.producto_id,
      nombre: m.producto_nombre || m.nombre,
      producto_nombre: m.producto_nombre || m.nombre,
      qty: Math.abs(Number(m.cantidad) || 0),
      cantidad: Math.abs(Number(m.cantidad) || 0),
      costo: Number(m.meta?.precio) || Number(m.precio) || 0,
      precio: Number(m.meta?.precio) || Number(m.precio) || 0,
      meta: m.meta,
    }));
    const montoInv = totalLineas(lineas);
    const fecha = rows.map((r) => r.created_at).filter(Boolean).sort()[0] || null;

    // ¿Ya hay evento de compra con este folio?
    let claveExistente = null;
    for (const k of clavesFolio(folio, sid)) {
      if (folioIndex.has(k)) {
        claveExistente = folioIndex.get(k);
        break;
      }
    }

    if (claveExistente && eventos.has(claveExistente)) {
      const ev = eventos.get(claveExistente);
      ev.lineas_inventario = [...(ev.lineas_inventario || []), ...lineas];
      ev.monto_inventario = round2(totalLineas(ev.lineas_inventario));
      if (!ev.fecha) ev.fecha = fecha;
      registrarFolios(claveExistente, folio, sid);
      continue;
    }

    const clave = `ingreso:${folioUp}`;
    ensureEvento(clave, {
      id: clave,
      origen: 'ingreso',
      tipo: /^CMP-/i.test(folio) ? 'compra' : 'ingreso',
      folio,
      compra_id: null,
      sucursal_id: sid,
      tienda: etiquetaTienda(sid),
      fecha,
      fecha_ymd: ymdDeIso(fecha),
      proveedor: '',
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
    registrarFolios(clave, folio, sid);
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
      fecha: t.recibido_at || t.updated_at || t.created_at || null,
      fecha_ymd: ymdDeIso(t.recibido_at || t.updated_at || t.created_at),
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

  // Soft-match: gasto sin folio → ingreso sin gasto, misma tienda, monto ±tol, ±1 día
  const gastosPendientes = (gastos || []).filter((g) => !gastosUsados.has(String(g.id)));
  for (const g of gastosPendientes) {
    const sid = normalizarCodigoTienda(g.sucursal_id) || '';
    const monto = round2(g.monto);
    const ymd = ymdDeIso(g.created_at);
    const provGasto = normalizarNombreProveedorClave(proveedorDesdeGasto(g));

    let mejor = null;
    let mejorScore = -1;
    for (const ev of eventos.values()) {
      if ((ev.gastos || []).length) continue;
      if (sid && ev.sucursal_id && ev.sucursal_id !== sid) continue;
      const ref = Number(ev.monto_ticket) > 0 ? Number(ev.monto_ticket) : Number(ev.monto_inventario);
      if (!(ref > 0) || !montosCuadran(ref, monto)) continue;

      let score = 10;
      if (ev.fecha_ymd && ymd) {
        const d0 = Date.parse(`${ev.fecha_ymd}T12:00:00`);
        const d1 = Date.parse(`${ymd}T12:00:00`);
        if (!Number.isNaN(d0) && !Number.isNaN(d1)) {
          const dias = Math.abs(d0 - d1) / 86400000;
          if (dias > 2) continue;
          score += Math.max(0, 5 - dias);
        }
      }
      if (provGasto && ev.proveedor) {
        const pk = normalizarNombreProveedorClave(ev.proveedor);
        if (pk && (pk === provGasto || pk.includes(provGasto) || provGasto.includes(pk))) score += 8;
      }
      if (score > mejorScore) {
        mejorScore = score;
        mejor = ev;
      }
    }
    if (mejor) vincularGasto(mejor, g, 'monto');
  }

  // 5) Finalizar filas: faltantes, montos gasto, estado
  const filas = [];
  for (const ev of eventos.values()) {
    const cmp = compararProductosTicketVsInventario(ev.lineas_ticket, ev.lineas_inventario);
    // Solo marcar faltantes si había ticket/pedido con líneas
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
    n_discrepancias: 0,
    por_estado: {},
    monto_ticket: 0,
    monto_inventario: 0,
    monto_gasto: 0,
    diferencia_ticket_gasto: 0,
    n_productos_faltantes: 0,
    por_tienda: [],
  };

  for (const e of Object.values(ESTADOS)) {
    resumen.por_estado[e] = 0;
  }

  const tiendas = new Map();
  for (const f of filas || []) {
    resumen.n_eventos += 1;
    const est = f.estado || ESTADOS.OK;
    resumen.por_estado[est] = (resumen.por_estado[est] || 0) + 1;
    if (est === ESTADOS.OK) resumen.n_ok += 1;
    else resumen.n_discrepancias += 1;

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
    else t.n_discrepancias += 1;
    t.monto_ticket = round2(t.monto_ticket + (Number(f.monto_ticket) || 0));
    t.monto_inventario = round2(t.monto_inventario + (Number(f.monto_inventario) || 0));
    t.monto_gasto = round2(t.monto_gasto + (Number(f.monto_gasto) || 0));
    t.n_productos_faltantes += Number(f.n_faltantes) || (f.productos_faltantes || []).length || 0;
    t.filas.push(f);
  }

  resumen.diferencia_ticket_gasto = round2(resumen.monto_ticket - resumen.monto_gasto);
  resumen.por_tienda = [...tiendas.values()].sort((a, b) => b.n_discrepancias - a.n_discrepancias || a.label.localeCompare(b.label, 'es'));
  return resumen;
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
 */
export async function cargarConsolidacionComprasInventario(
  supabase,
  { desde, hasta, sucursal = '' } = {},
) {
  if (!supabase) return { filas: [], resumen: resumirConsolidacion([]), error: 'Sin conexión.' };
  if (!desde || !hasta) return { filas: [], resumen: resumirConsolidacion([]), error: 'Indica el periodo.' };

  const suc = sucursal ? normalizarCodigoTienda(sucursal) : '';
  const desdeDt = inicioDia(desde);
  const hastaDt = finDia(hasta);
  const avisos = [];

  const [comprasRes, movRes, trpRes, gastosRes] = await Promise.all([
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
        .select('id,tipo,modo,producto_id,producto_nombre,cantidad,sucursal_id,meta,created_at,motivo,precio')
        .eq('tipo', 'entrada')
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .order('created_at', { ascending: false });
      if (suc) {
        // Incluye MAIN/CEDIS: ingresos libres a menudo se capturan allá.
        q = q.in('sucursal_id', [suc, 'MAIN', 'CEDIS']);
      }
      return q;
    }),
    fetchAllPages(() => {
      let q = supabase
        .from('inventario_traspasos')
        .select('id,folio,tipo,estado,origen_id,destino_id,lineas,notas,created_at,updated_at,recibido_at')
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
  ]);

  if (comprasRes.error && !/does not exist|schema cache|compras/i.test(String(comprasRes.error.message || ''))) {
    avisos.push(`Compras: ${comprasRes.error.message}`);
  }
  if (movRes.error && movRes.error.code !== '42P01') {
    avisos.push(`Inventario: ${movRes.error.message}`);
  }
  if (trpRes.error && trpRes.error.code !== '42P01') {
    avisos.push(`Traspasos: ${trpRes.error.message}`);
  }
  if (gastosRes.error && gastosRes.error.code !== '42P01') {
    avisos.push(`Gastos: ${gastosRes.error.message}`);
  }

  let movimientos = movRes.data || [];
  if (suc) {
    // Si filtramos tienda, solo conservar MAIN/CEDIS cuando el folio “parece” de esa tienda
    // o ya hay compra/traspaso local — se resuelve al consolidar; aquí no recortamos agresivo.
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
  });

  // Si hay filtro de tienda, ocultar eventos de otras (p.ej. traspasos/ingresos MAIN puros sin vínculo)
  const filasFiltradas = suc
    ? filas.filter((f) => {
        if (f.sucursal_id === suc) return true;
        // Ingreso en MAIN/CEDIS ligado a gasto de la tienda
        if (['MAIN', 'CEDIS'].includes(f.sucursal_id) && (f.gastos || []).some((g) => g.sucursal_id === suc)) {
          return true;
        }
        return false;
      })
    : filas;

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
    },
  };
}
