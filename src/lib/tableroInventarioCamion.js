import { normalizarCodigoTienda } from '../constants/sucursales.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function dineroTablero(n) {
  const v = round2(n);
  return `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function articulosVenta(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Líneas de producto del ticket. Omite las marcas internas del POS. */
export function lineasProductoVenta(raw) {
  return articulosVenta(raw).filter((a) => (
    a
    && a.producto_id
    && !a._pago_mixto
    && !a._lineas_camion
    && a._recepcion_pendiente == null
  ));
}

export function ventaCancelada(venta) {
  const estado = String(venta?.estado || '').toLowerCase();
  return estado === 'cancelada' || estado === 'anulada';
}

/** Efectivo y crédito de un ticket. Mixto sin desglose no se cuenta como efectivo. */
export function montosTicket(venta) {
  const total = round2(venta?.total);
  const metodo = String(venta?.metodo_pago || '').toLowerCase();
  if (metodo === 'credito') return { metodo: 'credito', efectivo: 0, credito: total };
  if (metodo === 'mixto') {
    const mix = articulosVenta(venta?.articulos).find((a) => a && (a._pago_mixto === true || a._pago_mixto === 1));
    const efectivo = round2(mix?.efectivo ?? 0);
    const credito = round2(mix?.credito ?? 0);
    if (efectivo + credito > 0) return { metodo: 'mixto', efectivo, credito };
    return { metodo: 'mixto', efectivo: 0, credito: total };
  }
  return { metodo: 'efectivo', efectivo: total, credito: 0 };
}

export function claveTiendaVenta(venta) {
  if (String(venta?.cliente_tipo || '') === 'externo') {
    const nombre = String(venta?.cliente_nombre || venta?.cliente_id || 'Externo').trim();
    return `EXT:${nombre}`;
  }
  return normalizarCodigoTienda(venta?.cliente_id)
    || normalizarCodigoTienda(venta?.cliente_nombre)
    || String(venta?.cliente_nombre || 'SIN TIENDA').trim();
}

export function etiquetaCortaTienda(clave) {
  const id = String(clave || '');
  return id.startsWith('EXT:') ? id.slice(4) : id;
}

/**
 * Tablero del camión con la carga abierta.
 * Cargado y disponible salen del inventario. La venta y la tabla salen de los tickets vivos.
 */
export function armarTableroInventarioCamion({ cargado = 0, disponible = 0, ventas = [] } = {}) {
  const tickets = [];
  for (const venta of ventas || []) {
    if (!venta || ventaCancelada(venta)) continue;
    const pago = montosTicket(venta);
    const lineas = lineasProductoVenta(venta.articulos);
    const piezas = lineas.reduce((suma, linea) => suma + (Number(linea.cantidad) || 0), 0);
    const tienda = claveTiendaVenta(venta);
    tickets.push({
      id: String(venta.id || venta.folio || tickets.length),
      folio: String(venta.folio || '—'),
      fecha: venta.created_at || null,
      tienda,
      etiqueta: etiquetaCortaTienda(tienda),
      metodo: pago.metodo,
      efectivo: pago.efectivo,
      credito: pago.credito,
      total: round2(pago.efectivo + pago.credito) || round2(venta.total),
      piezas,
      lineas: lineas.map((linea) => ({
        nombre: linea.nombre || linea.producto_id,
        cantidad: Number(linea.cantidad) || 0,
        importe: round2(linea.importe ?? (Number(linea.precio) || 0) * (Number(linea.cantidad) || 0)),
      })),
    });
  }

  const porTienda = new Map();
  for (const ticket of tickets) {
    if (!porTienda.has(ticket.tienda)) {
      porTienda.set(ticket.tienda, {
        id: ticket.tienda,
        etiqueta: ticket.etiqueta,
        mov: 0,
        venta: 0,
        efectivo: 0,
        credito: 0,
        tickets: [],
      });
    }
    const grupo = porTienda.get(ticket.tienda);
    grupo.mov += 1;
    grupo.venta = round2(grupo.venta + ticket.total);
    grupo.efectivo = round2(grupo.efectivo + ticket.efectivo);
    grupo.credito = round2(grupo.credito + ticket.credito);
    grupo.tickets.push(ticket);
  }

  const tiendas = [...porTienda.values()].sort((a, b) => b.venta - a.venta || a.etiqueta.localeCompare(b.etiqueta, 'es'));
  for (const grupo of tiendas) {
    grupo.tickets.sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
  }
  const venta = tiendas.reduce((acum, grupo) => ({
    total: round2(acum.total + grupo.venta),
    efectivo: round2(acum.efectivo + grupo.efectivo),
    credito: round2(acum.credito + grupo.credito),
    mov: acum.mov + grupo.mov,
  }), { total: 0, efectivo: 0, credito: 0, mov: 0 });

  return {
    cargado: round2(cargado),
    disponible: round2(disponible),
    venta,
    tiendas,
  };
}

export function totalMarcado(tiendas, marcadas) {
  return (tiendas || []).reduce((acum, tienda) => {
    if (marcadas && marcadas[tienda.id] === false) return acum;
    return {
      total: round2(acum.total + tienda.venta),
      efectivo: round2(acum.efectivo + tienda.efectivo),
      credito: round2(acum.credito + tienda.credito),
      mov: acum.mov + tienda.mov,
    };
  }, { total: 0, efectivo: 0, credito: 0, mov: 0 });
}

export function textoResumenCamion({ nombre, tablero, tienda }) {
  const lineas = [
    `Inventario camión ${nombre || ''}`.trim(),
    `Cargado en ruta: ${dineroTablero(tablero?.cargado)}`,
    `Disponible actual: ${dineroTablero(tablero?.disponible)}`,
    `Venta total: ${dineroTablero(tablero?.venta?.total)}`,
    `Efectivo: ${dineroTablero(tablero?.venta?.efectivo)}`,
    `Crédito: ${dineroTablero(tablero?.venta?.credito)}`,
  ];
  const grupos = tienda ? [tienda] : (tablero?.tiendas || []);
  for (const grupo of grupos) {
    lineas.push(`${grupo.etiqueta}: ${grupo.mov} mov · ${dineroTablero(grupo.venta)} (efectivo ${dineroTablero(grupo.efectivo)}, crédito ${dineroTablero(grupo.credito)})`);
    for (const ticket of grupo.tickets || []) {
      lineas.push(`  ${ticket.folio} · ${ticket.metodo} · ${ticket.piezas} productos · ${dineroTablero(ticket.total)}`);
    }
  }
  return lineas.join('\n');
}
