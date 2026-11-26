/**
 * Registro de clientes externos.
 * El inventario del camión no se parte: aquí solo queda el crédito dejado
 * y lo cobrado (abono o crédito cobrado). Las sucursales 3B no entran.
 */

import { montosPagoDesdeVentaRuta, ventaPendienteRecepcion } from './compraGastoCorte.js';
import { tiendaDeVentaRuta, ventaCancelada } from './ventasRutaPorTienda.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function pagado(venta, cargo) {
  if (String(venta?.estado_credito || '').toLowerCase() === 'pagado') return true;
  if (!cargo) return false;
  return Boolean(cargo.pagado_at) || String(cargo.estatus || '').toLowerCase() === 'pagado';
}

function esExterno(row) {
  if (!row) return false;
  if (String(row.cliente_tipo || '').toLowerCase() === 'externo') return true;
  return Boolean(tiendaDeVentaRuta(row).externo);
}

/**
 * Agrupa ventas y movimientos de cobranza de clientes externos.
 * @returns {{ clientes: object[], totales: { efectivo: number, credito: number, cobrado: number, pendiente: number } }}
 */
export function armarRegistroClientesExt(ventas = [], movimientos = []) {
  const abonosPorVenta = new Map();
  const abonosSueltos = [];
  const cargoPorVenta = new Map();
  const cargosSueltos = [];
  for (const mov of movimientos || []) {
    if (!esExterno(mov)) continue;
    if (mov.tipo === 'abono') {
      const ventaId = String(mov.venta_id || '');
      if (!ventaId) abonosSueltos.push(mov);
      else {
        const lista = abonosPorVenta.get(ventaId) || [];
        lista.push(mov);
        abonosPorVenta.set(ventaId, lista);
      }
    } else if (mov.tipo === 'cargo') {
      const ventaId = String(mov.venta_id || '');
      if (!ventaId) cargosSueltos.push(mov);
      else if (!cargoPorVenta.has(ventaId)) cargoPorVenta.set(ventaId, mov);
    }
  }

  const clientes = new Map();
  const grupo = (clave, nombre) => {
    if (!clientes.has(clave)) {
      clientes.set(clave, {
        clave,
        nombre: nombre || clave,
        efectivo: 0,
        credito: 0,
        cobrado: 0,
        pendiente: 0,
        tickets: [],
      });
    }
    const g = clientes.get(clave);
    if (nombre) g.nombre = nombre;
    return g;
  };

  for (const venta of ventas || []) {
    if (!venta || ventaCancelada(venta) || ventaPendienteRecepcion(venta)) continue;
    if (String(venta.estado_credito || '').toLowerCase() === 'anulado') continue;
    if (!esExterno(venta)) continue;
    const tienda = tiendaDeVentaRuta(venta);
    const pago = montosPagoDesdeVentaRuta(venta);
    const efectivo = round2(pago.montoEfectivo);
    const credito = round2(pago.montoCredito);
    if (!(efectivo > 0) && !(credito > 0)) continue;
    const g = grupo(tienda.clave, tienda.nombre);
    g.efectivo = round2(g.efectivo + efectivo);
    if (!(credito > 0)) continue;
    const deVenta = abonosPorVenta.get(String(venta.id)) || [];
    const sumaAbonos = round2(deVenta.reduce((s, a) => s + (Number(a.monto) || 0), 0));
    const cargo = cargoPorVenta.get(String(venta.id));
    let cobrado = Math.min(credito, sumaAbonos);
    const cobros = deVenta
      .filter((a) => Number(a.monto) > 0)
      .map((a) => ({
        id: String(a.id || ''),
        monto: round2(a.monto),
        fecha: a.created_at || null,
        nota: a.notas || 'Abono',
      }));
    if (pagado(venta, cargo) && cobrado + 0.009 < credito) {
      const resto = round2(credito - cobrado);
      cobrado = credito;
      cobros.push({
        id: `cobro:${venta.id}`,
        monto: resto,
        fecha: cargo?.pagado_at || venta.created_at || null,
        nota: 'Crédito cobrado',
      });
    }
    const pendiente = round2(Math.max(0, credito - cobrado));
    g.credito = round2(g.credito + credito);
    g.cobrado = round2(g.cobrado + cobrado);
    g.pendiente = round2(g.pendiente + pendiente);
    g.tickets.push({
      id: String(venta.id),
      folio: venta.folio || '',
      fecha: venta.created_at || null,
      credito,
      cobrado,
      pendiente,
      cobros,
    });
  }

  for (const cargo of cargosSueltos) {
    const tienda = tiendaDeVentaRuta({
      cliente_tipo: 'externo',
      cliente_id: cargo.cliente_id,
      cliente_nombre: cargo.cliente_nombre,
    });
    const g = grupo(tienda.clave, cargo.cliente_nombre || tienda.nombre);
    const monto = round2(cargo.monto);
    if (!(monto > 0)) continue;
    const ya = pagado(null, cargo);
    g.credito = round2(g.credito + monto);
    g.cobrado = round2(g.cobrado + (ya ? monto : 0));
    g.pendiente = round2(g.pendiente + (ya ? 0 : monto));
    g.tickets.push({
      id: String(cargo.id || cargo.folio_venta || g.tickets.length),
      folio: cargo.folio_venta || '',
      fecha: cargo.created_at || null,
      credito: monto,
      cobrado: ya ? monto : 0,
      pendiente: ya ? 0 : monto,
      cobros: ya ? [{
        id: `cobro:${cargo.id}`,
        monto,
        fecha: cargo.pagado_at || cargo.created_at || null,
        nota: 'Crédito cobrado',
      }] : [],
    });
  }

  for (const abono of abonosSueltos) {
    const tienda = tiendaDeVentaRuta({
      cliente_tipo: 'externo',
      cliente_id: abono.cliente_id,
      cliente_nombre: abono.cliente_nombre,
    });
    const g = grupo(tienda.clave, abono.cliente_nombre || tienda.nombre);
    const monto = round2(abono.monto);
    if (!(monto > 0)) continue;
    g.cobrado = round2(g.cobrado + monto);
    g.pendiente = round2(Math.max(0, g.credito - g.cobrado));
    g.tickets.push({
      id: `abono:${abono.id}`,
      folio: abono.folio_venta || '',
      fecha: abono.created_at || null,
      credito: 0,
      cobrado: monto,
      pendiente: 0,
      cobros: [{ id: String(abono.id || ''), monto, fecha: abono.created_at || null, nota: abono.notas || 'Abono' }],
    });
  }

  const lista = [...clientes.values()]
    .map((g) => ({
      ...g,
      tickets: g.tickets.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))),
    }))
    .sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre, 'es'));
  const totales = lista.reduce((acum, g) => ({
    efectivo: round2(acum.efectivo + g.efectivo),
    credito: round2(acum.credito + g.credito),
    cobrado: round2(acum.cobrado + g.cobrado),
    pendiente: round2(acum.pendiente + g.pendiente),
  }), { efectivo: 0, credito: 0, cobrado: 0, pendiente: 0 });
  return { clientes: lista, totales };
}

async function paginar(supabase, tabla, select, afinar) {
  const out = [];
  for (let desde = 0; desde < 20000; desde += 500) {
    let q = supabase.from(tabla).select(select).range(desde, desde + 499);
    if (afinar) q = afinar(q);
    const { data, error } = await q;
    if (error) return { data: out, error: error.message || 'No se pudo leer.' };
    out.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return { data: out };
}

export async function listarRegistroClientesExt(supabase) {
  const vacio = armarRegistroClientesExt([], []);
  if (!supabase) return { ok: false, error: 'Sin conexión.', registro: vacio };
  const ventas = await paginar(
    supabase,
    'ruta_ventas',
    'id,folio,cliente_id,cliente_tipo,cliente_nombre,metodo_pago,total,estado,estado_credito,created_at,articulos',
    (q) => q.eq('cliente_tipo', 'externo').order('created_at', { ascending: false }),
  );
  if (ventas.error) return { ok: false, error: ventas.error, registro: vacio };
  const movimientos = await paginar(
    supabase,
    'ruta_cxc_movimientos',
    'id,venta_id,folio_venta,cliente_id,cliente_tipo,cliente_nombre,monto,created_at,tipo,estatus,pagado_at,notas',
    (q) => q.eq('cliente_tipo', 'externo').order('created_at', { ascending: false }),
  );
  if (movimientos.error) return { ok: false, error: movimientos.error, registro: vacio };
  return { ok: true, registro: armarRegistroClientesExt(ventas.data, movimientos.data) };
}
