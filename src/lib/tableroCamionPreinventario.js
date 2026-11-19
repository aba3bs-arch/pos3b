import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { bucketCaratulaRc } from './controlEfectivo.js';
import { mismosFoliosBase } from './foliosPago.js';
import { resumirInventarioCamion } from './resumenInventarioCamion.js';

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Efectivo de venta o crédito cobrado. Los servicios no entran a este tablero. */
export function esMovimientoTableroCamion(movimiento) {
  const bucket = bucketCaratulaRc(movimiento);
  return bucket === 'venta' || bucket === 'creditos';
}

export function codigoTiendaTablero(raw) {
  const codigo = normalizarCodigoTienda(raw);
  return codigo || String(raw || '—').trim() || '—';
}

export function nombreCortoCamion(camion) {
  const alias = String(camion?.alias || '').trim();
  const codigo = String(camion?.codigo || '').trim();
  return alias || codigo || 'Camión';
}

/** Cargado y disponible a precio de ruta. Lo vendido es la diferencia. */
export function valoresInventarioCamion(lineas, productos = []) {
  const base = resumirInventarioCamion(lineas, productos);
  return {
    ...base,
    vendido: r2(Math.max(0, base.cargado - base.disponible)),
  };
}

function ventaDeMovimiento(mov, ventas) {
  const folio = String(mov?.num_traspaso || '').trim().toUpperCase();
  if (folio.length < 4) return null;
  const lista = ventas || [];
  const exacta = lista.find((v) => String(v?.folio || '').trim().toUpperCase() === folio);
  if (exacta) return exacta;
  return lista.find((v) => {
    const f = String(v?.folio || '').trim().toUpperCase();
    if (f.length < 4) return false;
    return folio.startsWith(f) || f.startsWith(folio);
  }) || null;
}

function tipoTicket(mov, venta) {
  const metodo = String(venta?.metodo_pago || '').toLowerCase();
  if (metodo === 'mixto') return 'mixto';
  if (metodo === 'credito' || bucketCaratulaRc(mov) === 'creditos') return 'credito';
  return 'efectivo';
}

function articulosDeVenta(venta) {
  return (Array.isArray(venta?.articulos) ? venta.articulos : [])
    .filter((a) => a && !a._pago_mixto && !a._lineas_camion && !a._recepcion_pendiente);
}

function ticketArticulos(arts) {
  return arts.map((a) => ({
    nombre: a.nombre || a.producto_id || 'Producto',
    cantidad: Number(a.cantidad ?? a.qty) || 0,
    importe: r2(a.importe != null ? a.importe : (Number(a.precio) || 0) * (Number(a.cantidad ?? a.qty) || 0)),
  }));
}

export function ticketDeMovimiento(mov, venta = null) {
  const arts = articulosDeVenta(venta);
  const piezas = arts.reduce((s, a) => s + (Number(a.cantidad ?? a.qty) || 0), 0);
  const monto = r2(mov?.monto);
  return {
    id: mov?.id,
    movimientoId: mov?.id || null,
    origen: 'transito',
    folio: venta?.folio || mov?.num_traspaso || 'Sin folio',
    fecha: venta?.created_at || mov?.fecha_hora || null,
    productos: arts.length,
    piezas,
    subtotal: r2(venta?.total != null && venta.total !== '' ? venta.total : mov?.monto),
    monto,
    abono: 0,
    saldo: monto,
    tipo: tipoTicket(mov, venta),
    articulos: ticketArticulos(arts),
  };
}

/** Parte a crédito de una venta de ruta. En mixto sale de la ficha guardada en el ticket. */
export function montoCreditoDeVenta(venta) {
  const mp = String(venta?.metodo_pago || '').toLowerCase();
  if (mp === 'credito') return r2(venta?.total);
  if (mp !== 'mixto') return 0;
  const mix = (venta?.articulos || []).find((a) => a && a._pago_mixto);
  return r2(mix?.credito);
}

function cargoPendiente(m) {
  if (!m || m.tipo !== 'cargo') return false;
  if (m.pagado_at) return false;
  const est = String(m.estatus || 'pendiente').toLowerCase();
  return est === 'pendiente' || est === '' || est === 'null';
}

function filaVacia(tienda) {
  return { tienda, count: 0, efectivo: 0, credito: 0, abono: 0, total: 0, tickets: [] };
}

function totalesDe(filas) {
  return filas.reduce((acc, f) => ({
    count: acc.count + f.count,
    efectivo: r2(acc.efectivo + f.efectivo),
    credito: r2(acc.credito + f.credito),
    abono: r2(acc.abono + (f.abono || 0)),
    total: r2(acc.total + f.total),
  }), { count: 0, efectivo: 0, credito: 0, abono: 0, total: 0 });
}

/**
 * Suma las ventas a crédito del camión (y el crédito del mixto) con sus abonos.
 * El cargo pendiente ya trae el saldo. Un cobro del mismo folio que ya está en
 * tránsito no se vuelve a sumar: ese dinero es el abono.
 */
export function incorporarVentasCredito(tablero, ventas = [], cxc = []) {
  const map = new Map((tablero?.filas || []).map((f) => [f.tienda, {
    ...f,
    abono: r2(f.abono),
    tickets: [...(f.tickets || [])],
  }]));

  for (const venta of ventas || []) {
    if (String(venta?.estado || '').toLowerCase() === 'cancelada') continue;
    if (String(venta?.estado_credito || '').toLowerCase() === 'anulado') continue;
    const original = montoCreditoDeVenta(venta);
    if (!(original > 0)) continue;
    const tienda = codigoTiendaTablero(venta.cliente_id || venta.cliente_nombre);
    if (!map.has(tienda)) map.set(tienda, filaVacia(tienda));
    const g = map.get(tienda);

    const cargos = (cxc || []).filter((m) => m?.tipo === 'cargo' && (
      (venta.id && String(m.venta_id || '') === String(venta.id))
      || mismosFoliosBase(m.folio_venta, venta.folio)
    ));
    const cargoIds = new Set(cargos.map((c) => String(c.id)));
    const abonos = (cxc || []).filter((m) => m?.tipo === 'abono' && (
      cargoIds.has(String(m.cargo_id || ''))
      || (venta.id && String(m.venta_id || '') === String(venta.id))
      || mismosFoliosBase(m.folio_venta, venta.folio)
    ));
    let abono = r2(abonos.reduce((s, a) => s + (Number(a.monto) || 0), 0));
    const pendientes = cargos.filter(cargoPendiente);

    const quitar = g.tickets.filter((t) => t.tipo === 'credito' && t.origen !== 'credito' && mismosFoliosBase(t.folio, venta.folio));
    if (quitar.length) {
      const cobrado = r2(quitar.reduce((s, t) => s + (Number(t.monto) || 0), 0));
      if (abono < cobrado) abono = cobrado;
      for (const t of quitar) t.reemplazado = true;
      g.credito = r2(Math.max(0, g.credito - cobrado));
      g.count = Math.max(0, g.count - quitar.length);
    }

    let saldo;
    if (pendientes.length) {
      saldo = r2(pendientes.reduce((s, c) => s + (Number(c.monto) || 0), 0));
      if (abono < r2(original - saldo)) abono = r2(original - saldo);
    } else if (cargos.length) {
      saldo = 0;
      if (abono <= 0) abono = original;
    } else {
      saldo = r2(Math.max(0, original - abono));
    }

    const arts = articulosDeVenta(venta);
    g.tickets.push({
      id: `credito:${venta.id || venta.folio}`,
      movimientoId: null,
      origen: 'credito',
      folio: venta.folio || 'Sin folio',
      fecha: venta.created_at || null,
      productos: arts.length,
      piezas: arts.reduce((s, a) => s + (Number(a.cantidad ?? a.qty) || 0), 0),
      subtotal: original,
      monto: original,
      abono,
      saldo,
      tipo: 'credito',
      articulos: ticketArticulos(arts),
    });
    g.credito = r2(g.credito + original);
    g.abono = r2((g.abono || 0) + abono);
    g.count += 1;
    g.total = r2(g.efectivo + g.credito);
  }

  const filas = [...map.values()]
    .filter((f) => f.count > 0 || f.efectivo > 0 || f.credito > 0)
    .sort((a, b) => (b.total - a.total) || String(a.tienda).localeCompare(String(b.tienda), 'es'));
  for (const f of filas) {
    f.tickets.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  }
  return { filas, totales: totalesDe(filas) };
}

/** Efectivo que sí se puede liquidar: solo movimientos en tránsito, no el crédito por cobrar. */
export function totalLiquidable(filas = [], marcas = {}) {
  let total = 0;
  for (const f of filas || []) {
    if (marcas[f.tienda] === false) continue;
    for (const t of f.tickets || []) {
      if (t.movimientoId) total = r2(total + (Number(t.monto) || 0));
    }
  }
  return total;
}

/**
 * Agrupa el efectivo en tránsito del camión por tienda y arma los tickets.
 * `ventas` enriquece cada movimiento con productos cuando el folio coincide.
 */
export function armarTableroTiendas(movimientos = [], ventas = []) {
  const map = new Map();
  for (const mov of movimientos || []) {
    if (!esMovimientoTableroCamion(mov)) continue;
    const venta = ventaDeMovimiento(mov, ventas);
    const tienda = codigoTiendaTablero(mov.sucursal_origen || venta?.cliente_id);
    if (!map.has(tienda)) {
      map.set(tienda, {
        tienda,
        count: 0,
        efectivo: 0,
        credito: 0,
        abono: 0,
        total: 0,
        tickets: [],
      });
    }
    const g = map.get(tienda);
    const monto = r2(mov.monto);
    if (bucketCaratulaRc(mov) === 'creditos') g.credito = r2(g.credito + monto);
    else g.efectivo = r2(g.efectivo + monto);
    g.total = r2(g.efectivo + g.credito);
    g.count += 1;
    g.tickets.push(ticketDeMovimiento(mov, venta));
  }
  const filas = [...map.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return String(a.tienda).localeCompare(String(b.tienda), 'es');
  });
  for (const f of filas) {
    f.tickets.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  }
  const totales = filas.reduce((acc, f) => ({
    count: acc.count + f.count,
    efectivo: r2(acc.efectivo + f.efectivo),
    credito: r2(acc.credito + f.credito),
    abono: r2(acc.abono + (f.abono || 0)),
    total: r2(acc.total + f.total),
  }), { count: 0, efectivo: 0, credito: 0, abono: 0, total: 0 });
  return { filas, totales };
}

/** Suma solo las tiendas marcadas para liquidar. */
export function totalesMarcados(filas = [], marcas = {}) {
  return (filas || []).reduce((acc, f) => {
    if (marcas[f.tienda] === false) return acc;
    return {
      count: acc.count + f.count,
      efectivo: r2(acc.efectivo + f.efectivo),
      credito: r2(acc.credito + f.credito),
      total: r2(acc.total + f.total),
    };
  }, { count: 0, efectivo: 0, credito: 0, total: 0 });
}

export function idsMovimientosMarcados(filas = [], marcas = {}) {
  const ids = [];
  for (const f of filas || []) {
    if (marcas[f.tienda] === false) continue;
    for (const t of f.tickets || []) {
      if (t.movimientoId) ids.push(t.movimientoId);
      else if (t.origen !== 'credito' && t.id) ids.push(t.id);
    }
  }
  return ids;
}
