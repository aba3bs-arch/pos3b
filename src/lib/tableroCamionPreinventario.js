import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { bucketCaratulaRc } from './controlEfectivo.js';
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

export function ticketDeMovimiento(mov, venta = null) {
  const arts = Array.isArray(venta?.articulos) ? venta.articulos : [];
  const piezas = arts.reduce((s, a) => s + (Number(a.cantidad ?? a.qty) || 0), 0);
  return {
    id: mov?.id,
    folio: venta?.folio || mov?.num_traspaso || 'Sin folio',
    fecha: venta?.created_at || mov?.fecha_hora || null,
    productos: arts.length,
    piezas,
    subtotal: r2(venta?.total != null && venta.total !== '' ? venta.total : mov?.monto),
    monto: r2(mov?.monto),
    tipo: tipoTicket(mov, venta),
    articulos: arts.map((a) => ({
      nombre: a.nombre || a.producto_id || 'Producto',
      cantidad: Number(a.cantidad ?? a.qty) || 0,
      importe: r2(a.importe != null ? a.importe : (Number(a.precio) || 0) * (Number(a.cantidad ?? a.qty) || 0)),
    })),
  };
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
    total: r2(acc.total + f.total),
  }), { count: 0, efectivo: 0, credito: 0, total: 0 });
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
      if (t.id) ids.push(t.id);
    }
  }
  return ids;
}
