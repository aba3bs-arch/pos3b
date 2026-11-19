import { montosPagoDesdeVentaRuta, ventaPendienteRecepcion } from './compraGastoCorte.js';
import { tiendaDeVentaRuta, ventaCancelada } from './ventasRutaPorTienda.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function productosDe(venta) {
  return (venta?.articulos || []).filter((a) => a && a.producto_id && !a._pago_mixto && !a._lineas_camion);
}

/**
 * Arma la tabla del camión y los tickets de cada tienda a partir de ruta_ventas.
 * Una venta que la tienda aún no recibe no entra.
 */
export function filasTiendaDesdeVentas(ventas) {
  const map = new Map();
  for (const v of ventas || []) {
    if (!v || ventaCancelada(v) || ventaPendienteRecepcion(v)) continue;
    const pago = montosPagoDesdeVentaRuta(v);
    const efectivo = round2(pago.montoEfectivo);
    const credito = round2(pago.montoCredito);
    if (!(efectivo > 0) && !(credito > 0)) continue;
    const tienda = tiendaDeVentaRuta(v);
    const clave = tienda.clave || '—';
    const fila = map.get(clave) || {
      clave,
      nombre: tienda.nombre || clave,
      mov: 0,
      venta: 0,
      efectivo: 0,
      credito: 0,
      tickets: [],
    };
    const lineas = productosDe(v).map((a) => ({
      nombre: a.nombre || String(a.producto_id),
      cantidad: Number(a.cantidad) || 0,
      precio: round2(a.precio),
      importe: round2(a.importe || (Number(a.precio) || 0) * (Number(a.cantidad) || 0)),
    }));
    const metodo = credito > 0 && efectivo > 0 ? 'Mixto' : credito > 0 ? 'Crédito' : 'Efectivo';
    fila.mov += 1;
    fila.venta = round2(fila.venta + efectivo + credito);
    fila.efectivo = round2(fila.efectivo + efectivo);
    fila.credito = round2(fila.credito + credito);
    fila.tickets.push({
      id: v.id,
      folio: v.folio || String(v.id),
      fecha: v.created_at || null,
      metodo,
      productos: lineas.length,
      efectivo,
      credito,
      total: round2(efectivo + credito),
      lineas,
    });
    map.set(clave, fila);
  }
  const filas = [...map.values()].sort((a, b) => b.venta - a.venta || a.clave.localeCompare(b.clave, 'es'));
  const total = filas.reduce(
    (s, f) => ({
      mov: s.mov + f.mov,
      venta: round2(s.venta + f.venta),
      efectivo: round2(s.efectivo + f.efectivo),
      credito: round2(s.credito + f.credito),
    }),
    { mov: 0, venta: 0, efectivo: 0, credito: 0 },
  );
  return { filas, total };
}
