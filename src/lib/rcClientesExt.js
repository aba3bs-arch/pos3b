/**
 * Registro de clientes externos.
 * Cada venta (efectivo, crédito o mixto) queda como ticket.
 * El crédito se abona completo o por partes. Si se cancela un cobro,
 * ese monto regresa a la deuda. Las sucursales 3B no entran.
 * El inventario del camión no se parte.
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

function abonoCancelado(mov) {
  const est = String(mov?.estatus || '').toLowerCase();
  if (est === 'cancelado' || est === 'anulado') return true;
  return /^\s*cancelado\b/i.test(String(mov?.notas || ''));
}

function esCobroSintetico(id) {
  return String(id || '').startsWith('cobro:');
}

/**
 * Mismos datos que el ticket de venta de abarrotes.
 * La línea Tienda es el nombre del cliente externo, no la sucursal 3B.
 */
export function datosTicketAbarrotes(ticket, { cliente, fecha } = {}) {
  const nombre = String(cliente || '').trim();
  const metodo = ticket?.metodo || (Number(ticket?.credito) > 0 && Number(ticket?.efectivo) > 0
    ? 'mixto'
    : Number(ticket?.credito) > 0 ? 'credito' : 'efectivo');
  return {
    sucursal: '',
    tiendaTexto: nombre,
    vendedor: ticket?.vendedor || '',
    folio: ticket?.folio || '',
    destino: nombre,
    fecha: fecha || '',
    articulos: (ticket?.lineas || []).map((l) => ({
      nombre: l.nombre,
      precio: l.precio,
      qty: l.cantidad,
    })),
    total: round2(ticket?.total || (Number(ticket?.efectivo) || 0) + (Number(ticket?.credito) || 0)),
    metodo_pago: metodo,
    metodo,
    monto_efectivo: round2(ticket?.efectivo),
    monto_credito: round2(ticket?.credito),
    tituloTicket: 'VENTA EN RUTA',
  };
}

/** Líneas vendidas, sin las marcas internas del ticket. */
export function lineasDeArticulos(articulos) {
  let arts = articulos;
  if (typeof arts === 'string') {
    try { arts = JSON.parse(arts); } catch { return []; }
  }
  if (!Array.isArray(arts)) return [];
  return arts
    .filter((a) => a && !a._pago_mixto && !a._recepcion_pendiente && !a._lineas_camion && !a._cancelada)
    .map((a) => {
      const cantidad = Number(a.cantidad ?? a.qty ?? 0) || 0;
      const precio = round2(a.precio);
      const importe = round2(a.importe ?? a.subtotal ?? precio * cantidad);
      const nombre = String(a.nombre || a.descripcion || a.producto_id || a.productoId || a.id || '').trim();
      return { nombre: nombre || 'Producto', cantidad, precio, importe };
    })
    .filter((a) => a.nombre && (a.cantidad > 0 || a.importe > 0));
}

function partirCobros(movs) {
  const cobros = [];
  const cobrosCancelados = [];
  let suma = 0;
  for (const a of movs || []) {
    const monto = round2(a.monto);
    if (!(monto > 0)) continue;
    const limpia = String(a.notas || 'Abono').replace(/^\s*cancelado\s*[·.-]\s*/i, '').trim();
    const item = {
      id: String(a.id || ''),
      monto,
      fecha: a.created_at || a.pagado_at || null,
      nota: limpia || 'Abono',
    };
    if (abonoCancelado(a)) cobrosCancelados.push(item);
    else {
      cobros.push(item);
      suma = round2(suma + monto);
    }
  }
  return { cobros, cobrosCancelados, suma };
}

function ticketVenta({
  id, origen, clienteId, folio, fecha, metodo, total, efectivo, credito, cobrado, pendiente, vendedor, lineas, cobros, cobrosCancelados,
}) {
  return {
    id: String(id),
    origen,
    clienteId: String(clienteId || ''),
    folio: folio || '',
    fecha: fecha || null,
    metodo: metodo || (credito > 0 && efectivo > 0 ? 'mixto' : credito > 0 ? 'credito' : 'efectivo'),
    total: round2(total || (Number(efectivo) || 0) + (Number(credito) || 0)),
    efectivo: round2(efectivo),
    credito: round2(credito),
    cobrado: round2(cobrado),
    pendiente: round2(pendiente),
    vendedor: vendedor || '',
    lineas: lineas || [],
    cobros: cobros || [],
    cobrosCancelados: cobrosCancelados || [],
  };
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
  const abonosPorCargo = new Map();
  for (const mov of movimientos || []) {
    if (!esExterno(mov)) continue;
    if (mov.tipo === 'abono') {
      const ventaId = String(mov.venta_id || '');
      const cargoId = String(mov.cargo_id || '');
      if (ventaId) {
        const lista = abonosPorVenta.get(ventaId) || [];
        lista.push(mov);
        abonosPorVenta.set(ventaId, lista);
      } else if (cargoId) {
        const lista = abonosPorCargo.get(cargoId) || [];
        lista.push(mov);
        abonosPorCargo.set(cargoId, lista);
      } else abonosSueltos.push(mov);
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
    const partido = partirCobros(abonosPorVenta.get(String(venta.id)) || []);
    const cargo = cargoPorVenta.get(String(venta.id));
    let cobrado = Math.min(credito, partido.suma);
    const cobros = partido.cobros;
    if (credito > 0 && pagado(venta, cargo) && cobrado + 0.009 < credito) {
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
    if (credito > 0) {
      g.credito = round2(g.credito + credito);
      g.cobrado = round2(g.cobrado + cobrado);
      g.pendiente = round2(g.pendiente + pendiente);
    }
    g.tickets.push(ticketVenta({
      id: venta.id,
      origen: 'venta',
      clienteId: venta.cliente_id,
      folio: venta.folio,
      fecha: venta.created_at,
      metodo: pago.metodo,
      total: round2(efectivo + credito) || round2(venta.total),
      efectivo,
      credito,
      cobrado: credito > 0 ? cobrado : 0,
      pendiente,
      vendedor: venta.vendedor_nombre,
      lineas: lineasDeArticulos(venta.articulos),
      cobros: credito > 0 ? cobros : [],
      cobrosCancelados: credito > 0 ? partido.cobrosCancelados : [],
    }));
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
    const partido = partirCobros(abonosPorCargo.get(String(cargo.id)) || []);
    let cobrado = Math.min(monto, partido.suma);
    const cobros = partido.cobros;
    const ya = pagado(null, cargo);
    if (ya && cobrado + 0.009 < monto) {
      const resto = round2(monto - cobrado);
      cobrado = monto;
      cobros.push({
        id: `cobro:${cargo.id}`,
        monto: resto,
        fecha: cargo.pagado_at || cargo.created_at || null,
        nota: 'Crédito cobrado',
      });
    }
    const pendiente = round2(Math.max(0, monto - cobrado));
    g.credito = round2(g.credito + monto);
    g.cobrado = round2(g.cobrado + cobrado);
    g.pendiente = round2(g.pendiente + pendiente);
    g.tickets.push(ticketVenta({
      id: cargo.id || cargo.folio_venta || g.tickets.length,
      origen: 'cargo',
      clienteId: cargo.cliente_id,
      folio: cargo.folio_venta,
      fecha: cargo.created_at,
      metodo: 'credito',
      total: monto,
      efectivo: 0,
      credito: monto,
      cobrado,
      pendiente,
      lineas: [],
      cobros,
      cobrosCancelados: partido.cobrosCancelados,
    }));
  }

  for (const abono of abonosSueltos) {
    if (abonoCancelado(abono)) continue;
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
    g.tickets.push(ticketVenta({
      id: `abono:${abono.id}`,
      origen: 'abono',
      clienteId: abono.cliente_id,
      folio: abono.folio_venta,
      fecha: abono.created_at,
      metodo: 'efectivo',
      total: monto,
      efectivo: 0,
      credito: 0,
      cobrado: monto,
      pendiente: 0,
      lineas: [],
      cobros: [{ id: String(abono.id || ''), monto, fecha: abono.created_at || null, nota: abono.notas || 'Abono' }],
    }));
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
  const filtroVentas = (q) => q.eq('cliente_tipo', 'externo').order('created_at', { ascending: false });
  const columnasVenta = 'id,folio,cliente_id,cliente_tipo,cliente_nombre,metodo_pago,total,estado,estado_credito,created_at,articulos';
  let ventas = await paginar(supabase, 'ruta_ventas', `${columnasVenta},vendedor_nombre`, filtroVentas);
  if (ventas.error && /vendedor_nombre/i.test(ventas.error)) {
    ventas = await paginar(supabase, 'ruta_ventas', columnasVenta, filtroVentas);
  }
  if (ventas.error) return { ok: false, error: ventas.error, registro: vacio };
  const columnas = 'id,venta_id,folio_venta,cliente_id,cliente_tipo,cliente_nombre,monto,created_at,tipo,estatus,pagado_at,notas,cargo_id';
  let movimientos = await paginar(
    supabase,
    'ruta_cxc_movimientos',
    columnas,
    (q) => q.eq('cliente_tipo', 'externo').order('created_at', { ascending: false }),
  );
  if (movimientos.error && /cargo_id/i.test(movimientos.error)) {
    movimientos = await paginar(
      supabase,
      'ruta_cxc_movimientos',
      columnas.replace(',cargo_id', ''),
      (q) => q.eq('cliente_tipo', 'externo').order('created_at', { ascending: false }),
    );
  }
  if (movimientos.error) return { ok: false, error: movimientos.error, registro: vacio };
  return { ok: true, registro: armarRegistroClientesExt(ventas.data, movimientos.data) };
}

/** Cobros ya registrados, del más reciente al más antiguo. */
export function cobrosDelRegistro(registro) {
  const lista = [];
  for (const cliente of registro?.clientes || []) {
    for (const ticket of cliente.tickets || []) {
      for (const cobro of ticket.cobros || []) {
        lista.push({
          id: cobro.id,
          monto: round2(cobro.monto),
          fecha: cobro.fecha || null,
          nota: cobro.nota || 'Abono',
          folio: ticket.folio || '',
          cliente: cliente.nombre,
          clienteClave: cliente.clave,
          ticketId: ticket.id,
          origen: ticket.origen,
        });
      }
    }
  }
  lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(b.id).localeCompare(String(a.id)));
  return lista;
}

/**
 * Reparte un cobro entre créditos pendientes, del más antiguo al más nuevo.
 * El último crédito tocado puede quedar parcial.
 */
export function planCobroClienteExt(tickets = [], montoPagar) {
  const orden = [...(tickets || [])]
    .filter((t) => round2(t?.pendiente) > 0)
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || String(a.id).localeCompare(String(b.id)));
  const total = round2(orden.reduce((s, t) => s + round2(t.pendiente), 0));
  const monto = round2(montoPagar);
  if (!(monto > 0)) return { ok: false, error: 'Ingresa un monto mayor a 0.' };
  if (!(total > 0)) return { ok: false, error: 'No hay crédito pendiente en la selección.' };
  if (monto > total + 0.001) {
    return { ok: false, error: `El monto no puede superar el pendiente (${total.toFixed(2)}).` };
  }
  let resto = monto;
  const partes = [];
  for (const ticket of orden) {
    if (resto <= 0.001) break;
    const pendiente = round2(ticket.pendiente);
    const aplica = round2(Math.min(resto, pendiente));
    if (!(aplica > 0)) continue;
    partes.push({
      id: String(ticket.id),
      folio: ticket.folio || '',
      monto: aplica,
      parcial: aplica < pendiente - 0.001,
      pendiente,
    });
    resto = round2(resto - aplica);
  }
  if (!partes.length) return { ok: false, error: 'No se pudo aplicar el monto.' };
  return { ok: true, partes, montoAplicado: round2(monto - resto), total };
}

async function insertarAbono(supabase, row) {
  const intento = async (payload) => supabase.from('ruta_cxc_movimientos').insert([payload]).select('id').maybeSingle();
  let { data, error } = await intento(row);
  if (error && /cargo_id|pagado_por|pagado_at|folio_venta|estatus|metodo_pago|saldo_despues|schema cache/i.test(error.message || '')) {
    const base = {
      cliente_tipo: row.cliente_tipo,
      cliente_id: row.cliente_id,
      cliente_nombre: row.cliente_nombre,
      tipo: 'abono',
      monto: row.monto,
      venta_id: row.venta_id,
      notas: row.notas,
      usuario_nombre: row.usuario_nombre,
    };
    ({ data, error } = await intento(base));
  }
  if (error) return { ok: false, error: error.message || 'No se guardó el cobro.' };
  return { ok: true, id: data?.id || null };
}

async function marcarCargosDeVenta(supabase, ventaId, quien, ahora) {
  const q = await supabase
    .from('ruta_cxc_movimientos')
    .select('id,estatus,pagado_at,tipo')
    .eq('venta_id', String(ventaId))
    .eq('tipo', 'cargo');
  if (q.error || !q.data?.length) return;
  for (const cargo of q.data) {
    if (cargo.pagado_at || String(cargo.estatus || '').toLowerCase() === 'pagado') continue;
    await supabase.from('ruta_cxc_movimientos').update({
      estatus: 'pagado',
      pagado_por: quien,
      pagado_at: ahora,
    }).eq('id', cargo.id);
  }
}

/**
 * Registra un abono o el cobro total de créditos de un cliente externo.
 * No pasa por el corte de la sucursal: el control queda en este registro.
 */
export async function registrarCobroClienteExt(supabase, {
  ticketIds,
  monto,
  nota,
  usuarioNombre,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const ids = [...new Set((ticketIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { ok: false, error: 'Elige al menos un crédito.' };
  const reg = await listarRegistroClientesExt(supabase);
  if (!reg.ok) return { ok: false, error: reg.error || 'No se pudo leer el registro.' };

  const elegidos = [];
  let clave = '';
  for (const cliente of reg.registro.clientes) {
    for (const ticket of cliente.tickets) {
      if (!ids.includes(String(ticket.id)) || !(ticket.pendiente > 0)) continue;
      if (ticket.origen !== 'venta' && ticket.origen !== 'cargo') continue;
      if (clave && clave !== cliente.clave) return { ok: false, error: 'Cobra un cliente a la vez.' };
      clave = cliente.clave;
      elegidos.push({ ...ticket, clienteNombre: cliente.nombre });
    }
  }
  if (!elegidos.length) return { ok: false, error: 'Esos créditos ya no tienen pendiente. Actualiza la pantalla.' };
  if (!String(elegidos[0].clienteId || '').trim()) return { ok: false, error: 'Falta el cliente del crédito.' };
  const plan = planCobroClienteExt(elegidos, monto);
  if (!plan.ok) return plan;

  const ahora = new Date().toISOString();
  const quien = String(usuarioNombre || '').trim() || 'RC/Clientes ext.';
  const notaBase = String(nota || '').trim();
  const aplicados = [];

  for (const parte of plan.partes) {
    const ticket = elegidos.find((t) => String(t.id) === String(parte.id));
    const texto = notaBase || (parte.parcial ? 'Abono' : 'Crédito cobrado');
    const ins = await insertarAbono(supabase, {
      cliente_tipo: 'externo',
      cliente_id: String(ticket.clienteId),
      cliente_nombre: ticket.clienteNombre,
      tipo: 'abono',
      monto: parte.monto,
      saldo_despues: 0,
      venta_id: ticket.origen === 'venta' ? String(ticket.id) : null,
      cargo_id: ticket.origen === 'cargo' ? String(ticket.id) : null,
      folio_venta: ticket.folio || null,
      metodo_pago: 'efectivo',
      estatus: 'pagado',
      notas: texto,
      usuario_nombre: quien,
      pagado_por: quien,
      pagado_at: ahora,
    });
    if (!ins.ok) {
      return {
        ok: false,
        error: aplicados.length
          ? `Se registró parte del cobro y falló el siguiente: ${ins.error}`
          : ins.error,
        aplicados,
      };
    }
    if (!parte.parcial) {
      if (ticket.origen === 'venta') {
        await supabase.from('ruta_ventas').update({ estado_credito: 'pagado' }).eq('id', ticket.id);
        await marcarCargosDeVenta(supabase, ticket.id, quien, ahora);
      } else {
        await supabase.from('ruta_cxc_movimientos').update({
          estatus: 'pagado',
          pagado_por: quien,
          pagado_at: ahora,
        }).eq('id', ticket.id);
      }
    } else if (ticket.origen === 'venta') {
      await ajustarSaldoCargoVenta(supabase, ticket.id, round2(ticket.pendiente - parte.monto));
    }
    aplicados.push({
      id: parte.id,
      folio: parte.folio,
      monto: parte.monto,
      parcial: parte.parcial,
      nota: texto,
    });
  }
  return {
    ok: true,
    aplicados,
    monto: plan.montoAplicado,
    cliente: elegidos[0].clienteNombre,
  };
}

async function cargosDeVenta(supabase, ventaId) {
  const q = await supabase
    .from('ruta_cxc_movimientos')
    .select('id,estatus,pagado_at,tipo,monto')
    .eq('venta_id', String(ventaId))
    .eq('tipo', 'cargo');
  if (q.error || !q.data) return [];
  return q.data;
}

function cargoSigueAbierto(cargo) {
  if (!cargo) return false;
  if (cargo.pagado_at) return false;
  const est = String(cargo.estatus || 'pendiente').toLowerCase();
  return est === 'pendiente' || est === '' || est === 'null';
}

/** El cargo de Cobranza queda en el saldo que este registro todavía debe. */
async function ajustarSaldoCargoVenta(supabase, ventaId, pendiente) {
  const cargos = await cargosDeVenta(supabase, ventaId);
  const vivos = cargos.filter(cargoSigueAbierto);
  if (vivos.length !== 1) return;
  await supabase.from('ruta_cxc_movimientos').update({
    monto: round2(Math.max(0, pendiente)),
  }).eq('id', vivos[0].id);
}

async function marcarAbonoCancelado(supabase, id, nota) {
  let res = await supabase.from('ruta_cxc_movimientos').update({
    estatus: 'cancelado',
    notas: nota,
  }).eq('id', id);
  if (res.error && /estatus|notas|schema cache/i.test(res.error.message || '')) {
    res = await supabase.from('ruta_cxc_movimientos').update({ notas: nota }).eq('id', id);
  }
  if (res.error) return { ok: false, error: res.error.message || 'No se canceló el cobro.' };
  return { ok: true };
}

async function reabrirCargo(supabase, cargoId, monto) {
  const patch = {
    estatus: 'pendiente',
    pagado_por: null,
    pagado_at: null,
  };
  // En un cargo suelto el monto ES el crédito: no se recorta.
  // En la venta el crédito vive en ruta_ventas y aquí solo se alinea Cobranza.
  if (monto > 0) patch.monto = round2(monto);
  let res = await supabase.from('ruta_cxc_movimientos').update(patch).eq('id', cargoId);
  if (res.error) {
    res = await supabase.from('ruta_cxc_movimientos').update({ estatus: 'pendiente' }).eq('id', cargoId);
  }
  if (res.error) return { ok: false, error: res.error.message || 'No se reabrió la deuda.' };
  return { ok: true };
}

async function reabrirDeudaVenta(supabase, ventaId, pendiente) {
  const ventaUpd = await supabase.from('ruta_ventas').update({ estado_credito: 'pendiente' }).eq('id', ventaId);
  if (ventaUpd.error) return { ok: false, error: ventaUpd.error.message || 'No se reabrió la deuda.' };
  const cargos = await cargosDeVenta(supabase, ventaId);
  if (cargos.length === 1) return reabrirCargo(supabase, cargos[0].id, pendiente);
  for (const cargo of cargos) {
    if (cargoSigueAbierto(cargo)) continue;
    const re = await reabrirCargo(supabase, cargo.id, 0);
    if (!re.ok) return re;
  }
  return { ok: true };
}

/**
 * Anula un cobro de este registro. El monto deja de contar como cobrado
 * y vuelve al pendiente del mismo crédito.
 */
export async function cancelarCobroClienteExt(supabase, { cobroId, usuarioNombre } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const id = String(cobroId || '').trim();
  if (!id) return { ok: false, error: 'Falta el cobro a cancelar.' };
  const reg = await listarRegistroClientesExt(supabase);
  if (!reg.ok) return { ok: false, error: reg.error || 'No se pudo leer el registro.' };

  let hallado = null;
  for (const cliente of reg.registro.clientes) {
    for (const ticket of cliente.tickets || []) {
      const cobro = (ticket.cobros || []).find((c) => String(c.id) === id);
      if (!cobro) continue;
      hallado = { cliente, ticket, cobro };
      break;
    }
    if (hallado) break;
  }
  if (!hallado) return { ok: false, error: 'Ese cobro ya no está activo. Actualiza la pantalla.' };

  const quien = String(usuarioNombre || '').trim() || 'RC/Clientes ext.';
  const { ticket, cobro, cliente } = hallado;
  const sintetico = esCobroSintetico(cobro.id);
  const sint = (ticket.cobros || []).find((c) => esCobroSintetico(c.id) && round2(c.monto) > 0 && String(c.id) !== id);

  if (!sintetico && sint && String(ticket.clienteId || '').trim()) {
    const preserva = await insertarAbono(supabase, {
      cliente_tipo: 'externo',
      cliente_id: String(ticket.clienteId),
      cliente_nombre: cliente.nombre,
      tipo: 'abono',
      monto: sint.monto,
      saldo_despues: 0,
      venta_id: ticket.origen === 'venta' ? String(ticket.id) : null,
      cargo_id: ticket.origen === 'cargo' ? String(ticket.id) : null,
      folio_venta: ticket.folio || null,
      metodo_pago: 'efectivo',
      estatus: 'pagado',
      notas: 'Crédito cobrado',
      usuario_nombre: quien,
      pagado_por: quien,
      pagado_at: sint.fecha || new Date().toISOString(),
    });
    if (!preserva.ok) return { ok: false, error: preserva.error || 'No se pudo conservar el resto cobrado.' };
  }

  if (!sintetico) {
    const notaPrevia = String(cobro.nota || 'Cobro').replace(/^\s*cancelado\s*[·.-]\s*/i, '');
    const marca = await marcarAbonoCancelado(supabase, id, `CANCELADO · ${notaPrevia} · ${quien}`);
    if (!marca.ok) return marca;
  }

  const otros = (ticket.cobros || []).filter((c) => String(c.id) !== id && !esCobroSintetico(c.id));
  const preservado = sintetico || !sint ? 0 : round2(sint.monto);
  const cobradoRestante = round2(otros.reduce((s, c) => s + round2(c.monto), 0) + preservado);
  const pendiente = round2(Math.max(0, round2(ticket.credito) - cobradoRestante));

  if (pendiente > 0.009 && ticket.origen === 'venta') {
    const re = await reabrirDeudaVenta(supabase, ticket.id, pendiente);
    if (!re.ok) return re;
  } else if (pendiente > 0.009 && ticket.origen === 'cargo') {
    const re = await reabrirCargo(supabase, ticket.id);
    if (!re.ok) return re;
  }

  return {
    ok: true,
    monto: round2(cobro.monto),
    cliente: cliente.nombre,
    folio: ticket.folio || '',
    pendiente,
  };
}
